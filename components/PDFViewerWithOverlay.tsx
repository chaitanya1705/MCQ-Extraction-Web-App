import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { loadPDF, renderPage } from '../lib/pdf-utils';
import type { PDFData, BoundingBox } from '../lib/types';

interface PDFViewerWithOverlayProps {
  pdfData: PDFData;
  boundingBoxes: BoundingBox[];
  onBoundingBoxCreate: (bbox: BoundingBox) => void;
  onBoundingBoxUpdate: (id: string, updates: Partial<BoundingBox>) => void;
  onBoundingBoxDelete: (id: string) => void;
}

export default function PDFViewerWithOverlay({
  pdfData,
  boundingBoxes,
  onBoundingBoxCreate,
  onBoundingBoxUpdate,
  onBoundingBoxDelete,
}: PDFViewerWithOverlayProps) {
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<'question' | 'option'>('question');
  
  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [draggedBox, setDraggedBox] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Update pdfData currentPage when page changes
  useEffect(() => {
    if (pdfData) {
      pdfData.currentPage = currentPage;
    }
  }, [currentPage, pdfData]);

  // Load PDF
  useEffect(() => {
    const loadPDFFile = async () => {
      setIsLoading(true);
      try {
        const pdfDoc = await loadPDF(pdfData.file);
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        if (pdfData) {
          pdfData.numPages = pdfDoc.numPages;
        }
      } catch (error) {
        console.error('Error loading PDF:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (pdfData?.file) {
      loadPDFFile();
    }
  }, [pdfData?.file]);

  // Render current page
  useEffect(() => {
    const renderCurrentPage = async () => {
      if (pdf && canvasRef.current) {
        try {
          await renderPage(pdf, currentPage, canvasRef.current, scale);
        } catch (error) {
          console.error('Error rendering page:', error);
        }
      }
    };

    renderCurrentPage();
  }, [pdf, currentPage, scale]);

  const goToPreviousPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setCurrentPage(prev => Math.min(numPages, prev + 1));
  };

  const zoomIn = () => {
    setScale(prev => Math.min(3, prev + 0.25));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(0.5, prev - 0.25));
  };

  // Mouse handlers for bounding box drawing
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking on existing bounding box
    const clickedBox = boundingBoxes.find(bbox => 
      bbox.page === currentPage &&
      x >= bbox.x && x <= bbox.x + bbox.width &&
      y >= bbox.y && y <= bbox.y + bbox.height
    );

    if (clickedBox) {
      // Start dragging existing box
      setDraggedBox(clickedBox.id);
      setDragOffset({
        x: x - clickedBox.x,
        y: y - clickedBox.y,
      });
    } else {
      // Start drawing new box
      setIsDrawing(true);
      setStartPos({ x, y });
      setCurrentPos({ x, y });
    }
  }, [boundingBoxes, currentPage]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDrawing) {
      setCurrentPos({ x, y });
    } else if (draggedBox) {
      // Move existing box
      const newX = Math.max(0, x - dragOffset.x);
      const newY = Math.max(0, y - dragOffset.y);
      
      onBoundingBoxUpdate(draggedBox, { x: newX, y: newY });
    }
  }, [isDrawing, draggedBox, dragOffset, onBoundingBoxUpdate]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isDrawing) {
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) return;

      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      const width = Math.abs(endX - startPos.x);
      const height = Math.abs(endY - startPos.y);

      // Only create box if it has minimum size
      if (width > 10 && height > 10) {
        const newBox: BoundingBox = {
          id: `bbox-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          x: Math.min(startPos.x, endX),
          y: Math.min(startPos.y, endY),
          width,
          height,
          type: selectedType,
          page: currentPage,
        };

        onBoundingBoxCreate(newBox);
      }

      setIsDrawing(false);
      setCurrentPos({ x: 0, y: 0 });
    }

    setDraggedBox(null);
  }, [isDrawing, startPos, selectedType, currentPage, onBoundingBoxCreate]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Find and delete clicked box
    const clickedBox = boundingBoxes.find(bbox => 
      bbox.page === currentPage &&
      x >= bbox.x && x <= bbox.x + bbox.width &&
      y >= bbox.y && y <= bbox.y + bbox.height
    );

    if (clickedBox) {
      onBoundingBoxDelete(clickedBox.id);
    }
  }, [boundingBoxes, onBoundingBoxDelete, currentPage]);

  // Calculate current drawing box dimensions
  const getCurrentDrawingBox = () => {
    if (!isDrawing) return null;
    
    return {
      left: Math.min(startPos.x, currentPos.x),
      top: Math.min(startPos.y, currentPos.y),
      width: Math.abs(currentPos.x - startPos.x),
      height: Math.abs(currentPos.y - startPos.y),
    };
  };

  const drawingBox = getCurrentDrawingBox();

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading PDF...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Selection Tool</h3>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-600">Type:</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as 'question' | 'option')}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="question">Question</option>
                <option value="option">Option</option>
              </select>
            </div>
            
            <div className="text-sm text-gray-500">
              Click & drag to select • Double-click to delete • Drag boxes to move
            </div>
          </div>
        </div>
      </div>

      {/* PDF Viewer with Overlay */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {/* PDF Controls */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50">
          <div className="flex items-center space-x-2">
            <button
              onClick={goToPreviousPage}
              disabled={currentPage <= 1}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            
            <span className="text-sm text-gray-600 min-w-max">
              Page {currentPage} of {numPages}
            </span>
            
            <button
              onClick={goToNextPage}
              disabled={currentPage >= numPages}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={zoomOut}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            
            <span className="text-sm text-gray-600 min-w-max">
              {Math.round(scale * 100)}%
            </span>
            
            <button
              onClick={zoomIn}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* PDF Canvas with Overlay */}
        <div className="p-4 overflow-auto max-h-[600px] bg-gray-100">
          <div className="flex justify-center">
            <div ref={containerRef} className="relative inline-block">
              {/* PDF Canvas */}
              <canvas
                ref={canvasRef}
                className="shadow-lg border border-gray-300 bg-white block"
                style={{ maxWidth: '100%', height: 'auto' }}
              />
              
              {/* Interactive Overlay */}
              <div
                ref={overlayRef}
                className="absolute inset-0 z-10"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onDoubleClick={handleDoubleClick}
                style={{ 
                  cursor: isDrawing ? 'crosshair' : draggedBox ? 'move' : 'crosshair',
                  pointerEvents: 'all'
                }}
              >
                {/* Render existing bounding boxes for current page */}
                {boundingBoxes
                  .filter(bbox => bbox.page === currentPage)
                  .map((bbox) => (
                  <div
                    key={bbox.id}
                    className={`absolute border-2 pointer-events-none select-none ${
                      bbox.type === 'question' 
                        ? 'border-blue-500 bg-blue-500 bg-opacity-20' 
                        : 'border-green-500 bg-green-500 bg-opacity-20'
                    }`}
                    style={{
                      left: bbox.x,
                      top: bbox.y,
                      width: bbox.width,
                      height: bbox.height,
                    }}
                  >
                    {/* Label */}
                    <div className={`absolute -top-6 left-0 px-2 py-1 text-xs text-white rounded pointer-events-none ${
                      bbox.type === 'question' ? 'bg-blue-500' : 'bg-green-500'
                    }`}>
                      {bbox.type} #{bbox.id.split('-')[1]?.slice(0, 4) || 'new'}
                    </div>
                    
                    {/* Resize handle */}
                    <div
                      className={`absolute -right-1 -bottom-1 w-3 h-3 ${
                        bbox.type === 'question' ? 'bg-blue-500' : 'bg-green-500'
                      } cursor-se-resize pointer-events-auto`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        // Handle resize logic here if needed
                      }}
                    />
                  </div>
                ))}

                {/* Show current drawing box */}
                {drawingBox && (
                  <div
                    className={`absolute border-2 border-dashed pointer-events-none select-none ${
                      selectedType === 'question' 
                        ? 'border-blue-500 bg-blue-500 bg-opacity-10' 
                        : 'border-green-500 bg-green-500 bg-opacity-10'
                    }`}
                    style={{
                      left: drawingBox.left,
                      top: drawingBox.top,
                      width: drawingBox.width,
                      height: drawingBox.height,
                    }}
                  >
                    {/* Preview label */}
                    <div className={`absolute -top-6 left-0 px-2 py-1 text-xs text-white rounded ${
                      selectedType === 'question' ? 'bg-blue-500' : 'bg-green-500'
                    }`}>
                      {selectedType}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}