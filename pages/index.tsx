import React, { useState, useCallback, useEffect, useRef } from 'react';
import Head from 'next/head';
import Layout from '../components/Layout';
import PDFViewerWithOverlay from '../components/PDFViewerWithOverlay';
import MCQEditor from '../components/MCQEditor';
import { 
  Upload, Download, FileText, Brain, ArrowLeft, HardDrive, 
  Zap, Eye, Trash2, Save, FileDown, AlertCircle, CheckCircle 
} from 'lucide-react';
import type { BoundingBox, MCQ, PDFData } from '../lib/types';
import { HybridTextExtractor } from '../lib/ocr-utils';
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
  stage: 'processing' | 'ocr' | 'complete';
  currentFile?: string;
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
  
  const textExtractorRef = useRef<HybridTextExtractor | null>(null);

  // Initialize text extractor
  useEffect(() => {
    textExtractorRef.current = new HybridTextExtractor();
    
    return () => {
      if (textExtractorRef.current) {
        textExtractorRef.current.terminate();
      }
    };
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
    LocalStorage.cleanupOldFiles(7); // Clean files older than 7 days
  }, []);

  const addNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
    
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    setIsLoading(true);
    
    try {
      // Validate file size (500MB limit)
      if (file.size > 500 * 1024 * 1024) {
        addNotification('File size exceeds 500MB limit', 'error');
        return;
      }

      // Check available storage
      if (file.size > storageInfo.remaining) {
        addNotification(`Insufficient storage. Available: ${LocalStorage.formatBytes(storageInfo.remaining)}`, 'error');
        return;
      }

      addNotification('Saving file locally...', 'info');
      const fileId = await LocalStorage.saveFile(file);
      setCurrentFileId(fileId);

      // Load PDF
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
    if (!pdfData || boundingBoxes.length === 0 || !textExtractorRef.current) return;

    setIsLoading(true);
    const questionBoxes = boundingBoxes.filter(bbox => bbox.type === 'question');
    
    setExtractionProgress({
      current: 0,
      total: questionBoxes.length,
      stage: 'processing'
    });

    try {
      const extractedMCQs: MCQ[] = [];
      const arrayBuffer = await pdfData.file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      for (let i = 0; i < questionBoxes.length; i++) {
        const questionBox = questionBoxes[i];
        
        setExtractionProgress({
          current: i + 1,
          total: questionBoxes.length,
          stage: 'ocr',
          currentFile: `Question ${i + 1}`
        });

        const optionBoxes = boundingBoxes.filter(
          bbox => bbox.type === 'option' && bbox.page === questionBox.page
        );

        // Get canvas for OCR
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        if (!canvas) continue;

        try {
          // Extract question text
          const questionResult = await textExtractorRef.current.extractFromBoundingBox(
            pdf, canvas, questionBox.page, questionBox, 1.5
          );

          // Extract option texts
          const options: string[] = [];
          for (const optionBox of optionBoxes) {
            const optionResult = await textExtractorRef.current.extractFromBoundingBox(
              pdf, canvas, optionBox.page, optionBox, 1.5
            );
            
            if (optionResult.text.trim()) {
              options.push(optionResult.text.trim());
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
        } catch (error) {
          console.error(`Extraction failed for question ${i + 1}:`, error);
          // Add fallback MCQ
          extractedMCQs.push({
            id: questionBox.id,
            question: `Question ${i + 1} from page ${questionBox.page}`,
            options: [`Option A`, `Option B`, `Option C`, `Option D`],
            page: questionBox.page,
          });
        }
      }

      setMcqs(extractedMCQs);
      
      // Save extraction data locally
      if (currentFileId) {
        const dataId = LocalStorage.saveMCQData(
          currentFileId,
          pdfData.file.name,
          extractedMCQs,
          boundingBoxes
        );
        addNotification(`Extracted ${extractedMCQs.length} questions successfully!`, 'success');
      }
      
      setCurrentStep('edit');
      
      setExtractionProgress({
        current: questionBoxes.length,
        total: questionBoxes.length,
        stage: 'complete'
      });

    } catch (error) {
      console.error('Extraction failed:', error);
      addNotification('Extraction failed: ' + (error as Error).message, 'error');
    } finally {
      setIsLoading(false);
      setTimeout(() => setExtractionProgress(null), 2000);
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
        <title>MCQ Extraction Tool - Advanced PDF Processing</title>
        <meta name="description" content="Extract Multiple Choice Questions from PDFs with OCR and LaTeX support" />
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
                    {extractionProgress.stage === 'processing' ? 'Processing...' :
                     extractionProgress.stage === 'ocr' ? 'Extracting Text...' :
                     'Complete!'}
                  </h3>
                  
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(extractionProgress.current / extractionProgress.total) * 100}%` }}
                    ></div>
                  </div>
                  
                  <p className="text-sm text-gray-600">
                    {extractionProgress.currentFile || `${extractionProgress.current} of ${extractionProgress.total}`}
                  </p>
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
                    <p className="text-sm text-gray-500">Advanced PDF processing with OCR & LaTeX support</p>
                  </div>
                </div>
                
                {/* Storage Info */}
                <div className="flex items-center space-x-4">
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
                      Upload PDFs and extract multiple choice questions with OCR, LaTeX support, and intelligent text recognition.
                    </p>
                    
                    {/* Features */}
                    <div className="grid md:grid-cols-3 gap-6 mb-8">
                      <div className="bg-white rounded-lg p-6 shadow-sm">
                        <Eye className="h-8 w-8 text-blue-600 mx-auto mb-3" />
                        <h3 className="font-semibold text-gray-900 mb-2">Smart Recognition</h3>
                        <p className="text-sm text-gray-600">Hybrid PDF text + OCR extraction</p>
                      </div>
                      <div className="bg-white rounded-lg p-6 shadow-sm">
                        <Brain className="h-8 w-8 text-purple-600 mx-auto mb-3" />
                        <h3 className="font-semibold text-gray-900 mb-2">LaTeX Support</h3>
                        <p className="text-sm text-gray-600">Mathematical equations and symbols</p>
                      </div>
                      <div className="bg-white rounded-lg p-6 shadow-sm">
                        <HardDrive className="h-8 w-8 text-green-600 mx-auto mb-3" />
                        <h3 className="font-semibold text-gray-900 mb-2">Local Storage</h3>
                        <p className="text-sm text-gray-600">All data saved locally in browser</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="border-2 border-dashed border-blue-300 rounded-xl p-12 hover:border-blue-400 transition-colors bg-white">
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                      }}
                      className="hidden"
                      id="pdf-upload"
                      disabled={isLoading}
                    />
                    <label
                      htmlFor="pdf-upload"
                      className="cursor-pointer flex flex-col items-center"
                    >
                      <Upload className="h-12 w-12 text-blue-400 mb-4" />
                      <span className="text-xl font-semibold text-gray-700 mb-2">
                        {isLoading ? 'Processing PDF...' : 'Choose PDF File'}
                      </span>
                      <span className="text-sm text-gray-500">
                        Maximum size: 500MB • Files are stored locally in your browser
                      </span>
                    </label>
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
                        <button
                          onClick={handleExtractText}
                          disabled={isLoading}
                          className="w-full mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                        >
                          <Zap className="h-4 w-4" />
                          <span>{isLoading ? 'Extracting...' : 'Extract Text'}</span>
                        </button>
                      )}
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">💡 Pro Tips</h4>
                    <div className="text-xs text-blue-700 space-y-1">
                      <p>• Group options near their questions for better accuracy</p>
                      <p>• Include mathematical symbols in selections for LaTeX detection</p>
                      <p>• Larger selections generally improve OCR accuracy</p>
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
    </>
  );
}