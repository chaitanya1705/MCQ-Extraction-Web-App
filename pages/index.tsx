import React, { useState, useCallback, useEffect, useRef } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import PDFViewerWithOverlay from '../components/PDFViewerWithOverlay';
import MCQEditor from '../components/MCQEditor';
import ApiKeyManager from '../components/ApiKeyManager';
import { 
  Upload, Download, FileText, Brain, ArrowLeft, HardDrive, 
  Zap, Eye, Trash2, Save, FileDown, AlertCircle, CheckCircle,
  Settings, Key 
} from 'lucide-react';
import type { BoundingBox, MCQ, PDFData } from '../lib/types';
import { GeminiExtractor } from '../lib/gemini-utils';
import { LocalStorage } from '../lib/storage-utils';
import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  (window as any).pdfjsLib = pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

interface ExtractionProgress {
  current: number;
  total: number;
  stage: 'processing' | 'extracting' | 'formatting' | 'complete';
  currentItem?: string;
  error?: string;
}

export default function Home() {
  const [pdfData, setPdfData] = useState<PDFData | null>(null);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [mcqs, setMcqs] = useState<MCQ[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<'upload' | 'select' | 'edit'>('upload');
  const [extractionProgress, setExtractionProgress] = useState<ExtractionProgress | null>(null);
  const [storageInfo, setStorageInfo] = useState({ used: 0, remaining: 0 });
  const [currentFileId, setCurrentFileId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Array<{id: string, message: string, type: 'success' | 'error' | 'info'}>>([]);
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [showApiKeyManager, setShowApiKeyManager] = useState(false);
  
  const geminiExtractorRef = useRef<GeminiExtractor | null>(null);

  // Initialize Gemini extractor when API key is available
  useEffect(() => {
    // Check for stored API key on component mount
    const storedKey = sessionStorage.getItem('gemini_api_key');
    if (storedKey) {
      setGeminiApiKey(storedKey);
      geminiExtractorRef.current = new GeminiExtractor(storedKey);
    }
  }, []);

  // Update storage info
  useEffect(() => {
    const updateStorageInfo = () => {
      const used = LocalStorage.getStorageUsage();
      const remaining = LocalStorage.getRemainingStorage();
      setStorageInfo({ used, remaining });
    };
    
    updateStorageInfo();
    const interval = setInterval(updateStorageInfo, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto cleanup old files
  useEffect(() => {
    LocalStorage.cleanupOldFiles(7);
  }, []);

  const addNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  const handleApiKeySet = useCallback((newApiKey: string) => {
    if (newApiKey) {
      setGeminiApiKey(newApiKey);
      geminiExtractorRef.current = new GeminiExtractor(newApiKey);
      addNotification('Gemini API connected successfully!', 'success');
    } else {
      setGeminiApiKey('');
      geminiExtractorRef.current = null;
      addNotification('API key removed', 'info');
    }
  }, [addNotification]);

  const handleFileUpload = useCallback(async (file: File) => {
    setIsLoading(true);
    
    try {
      if (file.size > 500 * 1024 * 1024) {
        addNotification('File size exceeds 500MB limit', 'error');
        return;
      }

      if (file.size > storageInfo.remaining) {
        addNotification(`Insufficient storage. Available: ${LocalStorage.formatBytes(storageInfo.remaining)}`, 'error');
        return;
      }

      addNotification('Saving file locally...', 'info');
      const fileId = await LocalStorage.saveFile(file);
      setCurrentFileId(fileId);

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      setPdfData({ file, numPages: pdf.numPages, currentPage: 1 });
      setCurrentStep('select');
      
      addNotification('File uploaded and saved successfully!', 'success');
    } catch (error) {
      console.error('Upload failed:', error);
      addNotification('Upload failed: ' + (error as Error).message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [storageInfo.remaining, addNotification]);

  const handleBoundingBoxCreate = useCallback((bbox: BoundingBox) => {
    setBoundingBoxes(prev => [...prev, bbox]);
  }, []);

  const handleBoundingBoxUpdate = useCallback((id: string, updates: Partial<BoundingBox>) => {
    setBoundingBoxes(prev => 
      prev.map(bbox => bbox.id === id ? { ...bbox, ...updates } : bbox)
    );
  }, []);

  const handleBoundingBoxDelete = useCallback((id: string) => {
    setBoundingBoxes(prev => prev.filter(bbox => bbox.id !== id));
  }, []);

  const handleExtractText = useCallback(async () => {
    if (!pdfData || boundingBoxes.length === 0 || !geminiExtractorRef.current) {
      if (!geminiExtractorRef.current) {
        addNotification('Please configure Gemini API key first', 'error');
        setShowApiKeyManager(true);
        return;
      }
      return;
    }

    setIsLoading(true);
    const questionBoxes = boundingBoxes.filter(bbox => bbox.type === 'question');
    
    setExtractionProgress({
      current: 0,
      total: questionBoxes.length,
      stage: 'processing'
    });

    try {
      const extractedMCQs: MCQ[] = [];

      for (let i = 0; i < questionBoxes.length; i++) {
        const questionBox = questionBoxes[i];
        
        setExtractionProgress({
          current: i + 1,
          total: questionBoxes.length,
          stage: 'extracting',
          currentItem: `Question ${i + 1} from page ${questionBox.page}`
        });

        // Find option boxes on the same page
        const optionBoxes = boundingBoxes.filter(
          bbox => bbox.type === 'option' && bbox.page === questionBox.page
        );

        // Get the current canvas
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        if (!canvas) continue;

        try {
          setExtractionProgress(prev => prev ? {
            ...prev,
            stage: 'extracting',
            currentItem: `Analyzing question ${i + 1}...`
          } : null);

          // Use Gemini to extract the complete MCQ
          const mcqResult = await geminiExtractorRef.current.extractMCQFromCanvas(
            canvas,
            questionBox,
            optionBoxes
          );

          setExtractionProgress(prev => prev ? {
            ...prev,
            stage: 'formatting',
            currentItem: `Formatting question ${i + 1}...`
          } : null);

          if (mcqResult.question && mcqResult.options.length > 0) {
            extractedMCQs.push({
              id: questionBox.id,
              question: mcqResult.question,
              options: mcqResult.options,
              page: questionBox.page,
            });
          }
        } catch (error) {
          console.error(`Gemini extraction failed for question ${i + 1}:`, error);
          
          // Fallback: try individual extractions
          try {
            const questionResult = await geminiExtractorRef.current!.extractTextFromCanvas(
              canvas,
              questionBox,
              'question'
            );

            const options: string[] = [];
            for (const optionBox of optionBoxes) {
              try {
                const optionResult = await geminiExtractorRef.current!.extractTextFromCanvas(
                  canvas,
                  optionBox,
                  'option'
                );
                if (optionResult.text.trim()) {
                  options.push(optionResult.text.trim());
                }
              } catch (optionError) {
                console.error('Option extraction failed:', optionError);
              }
            }

            if (questionResult.text && options.length > 0) {
              extractedMCQs.push({
                id: questionBox.id,
                question: questionResult.text,
                options,
                page: questionBox.page,
              });
            }
          } catch (fallbackError) {
            console.error('Fallback extraction also failed:', fallbackError);
            setExtractionProgress(prev => prev ? {
              ...prev,
              error: `Failed to extract question ${i + 1}: ${(fallbackError as Error).message}`
            } : null);
          }
        }

        // Small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setMcqs(extractedMCQs);
      
      // Save extraction data locally
      if (currentFileId) {
        LocalStorage.saveMCQData(
          currentFileId,
          pdfData.file.name,
          extractedMCQs,
          boundingBoxes
        );
      }
      
      setCurrentStep('edit');
      
      setExtractionProgress({
        current: questionBoxes.length,
        total: questionBoxes.length,
        stage: 'complete'
      });

      addNotification(`Successfully extracted ${extractedMCQs.length} questions using Gemini AI!`, 'success');

    } catch (error) {
      console.error('Extraction failed:', error);
      addNotification('Extraction failed: ' + (error as Error).message, 'error');
      setExtractionProgress(prev => prev ? {
        ...prev,
        error: (error as Error).message
      } : null);
    } finally {
      setIsLoading(false);
      setTimeout(() => setExtractionProgress(null), 3000);
    }
  }, [pdfData, boundingBoxes, currentFileId, addNotification]);

  const handleDownloadJSON = useCallback(() => {
    if (mcqs.length > 0 && pdfData) {
      LocalStorage.exportMCQAsJSON(mcqs, pdfData.file.name);
      addNotification('JSON file downloaded successfully!', 'success');
    }
  }, [mcqs, pdfData, addNotification]);

  const handleDownloadCSV = useCallback(() => {
    if (mcqs.length > 0 && pdfData) {
      LocalStorage.exportMCQAsCSV(mcqs, pdfData.file.name);
      addNotification('CSV file downloaded successfully!', 'success');
    }
  }, [mcqs, pdfData, addNotification]);

  const handleSaveProject = useCallback(() => {
    if (currentFileId && pdfData && (boundingBoxes.length > 0 || mcqs.length > 0)) {
      try {
        LocalStorage.saveMCQData(
          currentFileId,
          pdfData.file.name,
          mcqs,
          boundingBoxes
        );
        addNotification('Project saved successfully!', 'success');
      } catch (error) {
        addNotification('Failed to save project', 'error');
      }
    }
  }, [currentFileId, pdfData, mcqs, boundingBoxes, addNotification]);

  const handleReset = useCallback(() => {
    if (currentFileId) {
      LocalStorage.deleteFile(currentFileId);
    }
    setPdfData(null);
    setBoundingBoxes([]);
    setMcqs([]);
    setCurrentFileId(null);
    setCurrentStep('upload');
    addNotification('Project reset successfully', 'info');
  }, [currentFileId, addNotification]);

  const handleGoBack = () => {
    if (currentStep === 'edit') {
      setCurrentStep('select');
    } else if (currentStep === 'select') {
      setCurrentStep('upload');
      setPdfData(null);
      setBoundingBoxes([]);
    }
  };

  return (
    <>
      <Head>
        <title>MCQ Extraction Tool - Powered by Gemini AI</title>
        <meta name="description" content="Extract Multiple Choice Questions from PDFs using Google Gemini AI with LaTeX support" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css"
        />
      </Head>

      <Layout>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
          {/* Notifications */}
          <div className="fixed top-4 right-4 z-50 space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 rounded-lg shadow-lg max-w-sm transition-all duration-300 ${
                  notification.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' :
                  notification.type === 'error' ? 'bg-red-100 text-red-800 border border-red-200' :
                  'bg-blue-100 text-blue-800 border border-blue-200'
                }`}
              >
                <div className="flex items-center space-x-2">
                  {notification.type === 'success' && <CheckCircle className="h-4 w-4 text-green-600" />}
                  {notification.type === 'error' && <AlertCircle className="h-4 w-4 text-red-600" />}
                  {notification.type === 'info' && <AlertCircle className="h-4 w-4 text-blue-600" />}
                  <span className="text-sm font-medium">{notification.message}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Progress Modal */}
          {extractionProgress && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <div className="text-center">
                  <Brain className="h-12 w-12 text-blue-600 mx-auto mb-4 animate-pulse" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {extractionProgress.stage === 'processing' ? 'Processing PDF...' :
                     extractionProgress.stage === 'extracting' ? 'Gemini AI Extracting...' :
                     extractionProgress.stage === 'formatting' ? 'Formatting Results...' :
                     extractionProgress.error ? 'Extraction Error' :
                     'Complete!'}
                  </h3>
                  
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        extractionProgress.error ? 'bg-red-500' : 'bg-blue-600'
                      }`}
                      style={{ width: `${(extractionProgress.current / extractionProgress.total) * 100}%` }}
                    ></div>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-2">
                    {extractionProgress.currentItem || `${extractionProgress.current} of ${extractionProgress.total}`}
                  </p>

                  {extractionProgress.error && (
                    <div className="bg-red-50 border border-red-200 rounded p-3 mt-3">
                      <p className="text-xs text-red-700">{extractionProgress.error}</p>
                    </div>
                  )}

                  {extractionProgress.stage === 'complete' && !extractionProgress.error && (
                    <div className="flex items-center justify-center space-x-1 text-green-600 mt-2">
                      <CheckCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Extraction completed!</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="bg-white shadow-sm border-b">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center py-6">
                <div className="flex items-center space-x-3">
                  <Brain className="h-8 w-8 text-blue-600" />
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">MCQ Extraction Tool</h1>
                    <p className="text-sm text-gray-500">Powered by Google Gemini AI with LaTeX support</p>
                  </div>
                </div>
                
                {/* Header Controls */}
                <div className="flex items-center space-x-4">
                  {/* API Key Status */}
                  <button
                    onClick={() => setShowApiKeyManager(!showApiKeyManager)}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      geminiApiKey 
                        ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    <Key className="h-4 w-4" />
                    <span>{geminiApiKey ? 'API Connected' : 'API Required'}</span>
                  </button>

                  {/* Storage Info */}
                  <div className="text-right">
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <HardDrive className="h-4 w-4" />
                      <span>Storage: {LocalStorage.formatBytes(storageInfo.used)} used</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {LocalStorage.formatBytes(storageInfo.remaining)} remaining
                    </div>
                  </div>
                </div>
              </div>

              {/* API Key Manager Panel */}
              {showApiKeyManager && (
                <div className="pb-6">
                  <ApiKeyManager
                    onApiKeySet={handleApiKeySet}
                    currentApiKey={geminiApiKey}
                  />
                </div>
              )}

              {/* Step Navigation */}
              <div className="flex items-center justify-between pb-6">
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => {
                      setCurrentStep('upload');
                      setPdfData(null);
                      setBoundingBoxes([]);
                      setMcqs([]);
                    }}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-full text-sm transition-colors ${
                      currentStep === 'upload' 
                        ? 'bg-blue-100 text-blue-700 font-medium' 
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    <Upload className="h-4 w-4" />
                    <span>Upload PDF</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      if (pdfData) setCurrentStep('select');
                    }}
                    disabled={!pdfData}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-full text-sm transition-colors ${
                      currentStep === 'select' 
                        ? 'bg-blue-100 text-blue-700 font-medium' 
                        : pdfData 
                          ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <FileText className="h-4 w-4" />
                    <span>Select Regions</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      if (mcqs.length > 0) setCurrentStep('edit');
                    }}
                    disabled={mcqs.length === 0}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-full text-sm transition-colors ${
                      currentStep === 'edit' 
                        ? 'bg-blue-100 text-blue-700 font-medium' 
                        : mcqs.length > 0
                          ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <Brain className="h-4 w-4" />
                    <span>Edit MCQs</span>
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center space-x-2">
                  {currentStep !== 'upload' && (
                    <button
                      onClick={handleGoBack}
                      className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      <span>Back</span>
                    </button>
                  )}
                  
                  {(boundingBoxes.length > 0 || mcqs.length > 0) && (
                    <button
                      onClick={handleSaveProject}
                      className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      <Save className="h-4 w-4" />
                      <span>Save</span>
                    </button>
                  )}
                  
                  {mcqs.length > 0 && (
                    <>
                      <button
                        onClick={handleDownloadJSON}
                        className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <Download className="h-4 w-4" />
                        <span>JSON</span>
                      </button>
                      
                      <button
                        onClick={handleDownloadCSV}
                        className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                      >
                        <FileDown className="h-4 w-4" />
                        <span>CSV</span>
                      </button>
                    </>
                  )}
                  
                  {pdfData && (
                    <button
                      onClick={handleReset}
                      className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {currentStep === 'upload' && (
              <div className="space-y-8">
                {/* API Key Warning if not configured */}
                {!geminiApiKey && (
                  <div className="max-w-2xl mx-auto">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <h3 className="text-sm font-medium text-amber-800">Gemini API Key Required</h3>
                          <p className="text-sm text-amber-700 mt-1">
                            Please configure your Gemini API key to enable advanced text extraction and OCR capabilities.
                          </p>
                          <button
                            onClick={() => setShowApiKeyManager(true)}
                            className="mt-2 text-sm text-amber-800 underline hover:text-amber-900"
                          >
                            Configure API Key
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="text-center">
                  <div className="max-w-2xl mx-auto">
                    <div className="mb-8">
                      <div className="flex justify-center items-center space-x-4 mb-4">
                        <FileText className="h-16 w-16 text-blue-600" />
                        <Zap className="h-8 w-8 text-yellow-500" />
                        <Brain className="h-16 w-16 text-purple-600" />
                      </div>
                      <h2 className="text-3xl font-bold text-gray-900 mb-4">
                        Advanced MCQ Extraction
                      </h2>
                      <p className="text-lg text-gray-600 mb-6">
                        Upload PDFs and extract multiple choice questions using Google Gemini AI with superior OCR and LaTeX recognition.
                      </p>
                      
                      {/* Features */}
                      <div className="grid md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-white rounded-lg p-6 shadow-sm">
                          <Brain className="h-8 w-8 text-purple-600 mx-auto mb-3" />
                          <h3 className="font-semibold text-gray-900 mb-2">Gemini AI Powered</h3>
                          <p className="text-sm text-gray-600">Advanced vision models for superior text recognition</p>
                        </div>
                        <div className="bg-white rounded-lg p-6 shadow-sm">
                          <Eye className="h-8 w-8 text-green-600 mx-auto mb-3" />
                          <h3 className="font-semibold text-gray-900 mb-2">Smart LaTeX</h3>
                          <p className="text-sm text-gray-600">Automatic mathematical equation recognition</p>
                        </div>
                        <div className="bg-white rounded-lg p-6 shadow-sm">
                          <HardDrive className="h-8 w-8 text-blue-600 mx-auto mb-3" />
                          <h3 className="font-semibold text-gray-900 mb-2">Local Storage</h3>
                          <p className="text-sm text-gray-600">All data processed locally in your browser</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className={`border-2 border-dashed rounded-xl p-12 transition-colors bg-white ${
                      geminiApiKey 
                        ? 'border-blue-300 hover:border-blue-400' 
                        : 'border-gray-300 opacity-75'
                    }`}>
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (!geminiApiKey) {
                              addNotification('Please configure Gemini API key first', 'error');
                              setShowApiKeyManager(true);
                              return;
                            }
                            handleFileUpload(file);
                          }
                        }}
                        className="hidden"
                        id="pdf-upload"
                        disabled={isLoading || !geminiApiKey}
                      />
                      <label
                        htmlFor="pdf-upload"
                        className={`cursor-pointer flex flex-col items-center ${
                          !geminiApiKey ? 'cursor-not-allowed' : ''
                        }`}
                      >
                        <Upload className={`h-12 w-12 mb-4 ${
                          geminiApiKey ? 'text-blue-400' : 'text-gray-300'
                        }`} />
                        <span className={`text-xl font-semibold mb-2 ${
                          geminiApiKey ? 'text-gray-700' : 'text-gray-400'
                        }`}>
                          {isLoading ? 'Processing PDF...' : 
                           !geminiApiKey ? 'Configure API Key First' :
                           'Choose PDF File'}
                        </span>
                        <span className="text-sm text-gray-500">
                          {geminiApiKey 
                            ? 'Maximum size: 500MB • Enhanced by Gemini AI' 
                            : 'Gemini API key required for extraction'}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 'select' && pdfData && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                  <PDFViewerWithOverlay
                    pdfData={pdfData}
                    boundingBoxes={boundingBoxes}
                    onBoundingBoxCreate={handleBoundingBoxCreate}
                    onBoundingBoxUpdate={handleBoundingBoxUpdate}
                    onBoundingBoxDelete={handleBoundingBoxDelete}
                  />
                </div>
                
                <div className="space-y-6">
                  <div className="bg-white rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Selection Guide
                    </h3>
                    <div className="space-y-3 text-sm text-gray-600">
                      <div className="flex items-start space-x-2">
                        <div className="w-3 h-3 bg-blue-500 rounded mt-1"></div>
                        <span>Draw boxes around <strong>questions</strong></span>
                      </div>
                      <div className="flex items-start space-x-2">
                        <div className="w-3 h-3 bg-green-500 rounded mt-1"></div>
                        <span>Draw boxes around <strong>options</strong></span>
                      </div>
                      <p className="mt-4 text-xs">
                        Click and drag to create selection boxes. 
                        Boxes can be moved after creation. Double-click to delete.
                      </p>
                    </div>
                  </div>

                  {boundingBoxes.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Selections ({boundingBoxes.length})
                      </h3>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {boundingBoxes.map((bbox) => (
                          <div
                            key={bbox.id}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded"
                          >
                            <div className="flex items-center space-x-2">
                              <div className={`w-3 h-3 rounded ${
                                bbox.type === 'question' ? 'bg-blue-500' : 'bg-green-500'
                              }`}></div>
                              <span className="text-sm capitalize">{bbox.type}</span>
                              <span className="text-xs text-gray-500">Page {bbox.page}</span>
                            </div>
                            <button
                              onClick={() => handleBoundingBoxDelete(bbox.id)}
                              className="text-red-500 hover:text-red-700 text-xs"
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                      
                      {boundingBoxes.filter(b => b.type === 'question').length > 0 && (
                        <div className="mt-4 space-y-3">
                          {!geminiApiKey && (
                            <div className="bg-red-50 border border-red-200 rounded p-3">
                              <p className="text-xs text-red-700 mb-2">
                                Gemini API key required for extraction
                              </p>
                              <button
                                onClick={() => setShowApiKeyManager(true)}
                                className="text-xs text-red-800 underline"
                              >
                                Configure API Key
                              </button>
                            </div>
                          )}
                          
                          <button
                            onClick={handleExtractText}
                            disabled={isLoading || !geminiApiKey}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                          >
                            <Brain className="h-4 w-4" />
                            <span>{isLoading ? 'Extracting with Gemini...' : 'Extract with Gemini AI'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">🚀 Gemini AI Benefits</h4>
                    <div className="text-xs text-blue-700 space-y-1">
                      <p>• Superior OCR accuracy for mathematical content</p>
                      <p>• Automatic LaTeX formatting for equations</p>
                      <p>• Intelligent text structure recognition</p>
                      <p>• Context-aware option grouping</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 'edit' && (
              <MCQEditor
                mcqs={mcqs}
                onMCQUpdate={(id, updates) => {
                  setMcqs(prev => 
                    prev.map(mcq => mcq.id === id ? { ...mcq, ...updates } : mcq)
                  );
                }}
                onMCQDelete={(id) => {
                  setMcqs(prev => prev.filter(mcq => mcq.id !== id));
                }}
              />
            )}
          </div>
        </div>
      </Layout>
      {/* Footer */}
<footer className="bg-white border-t py-4 mt-8">
  <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
    © {new Date().getFullYear()} Chaitanya N — Crafted with precision and innovation
  </div>
</footer>


    </>
  );
}