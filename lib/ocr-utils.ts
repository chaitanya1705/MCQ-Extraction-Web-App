// lib/ocr-utils.ts
import Tesseract from 'tesseract.js';

export interface OCRResult {
  text: string;
  confidence: number;
  hasLatex: boolean;
}

export class OCRExtractor {
  private worker: Tesseract.Worker | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.worker = await Tesseract.createWorker('eng');
    await this.worker.setParameters({
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,?!()[]{}+-=/*^_$\\αβγδεζηθικλμνξοπρστυφχψω∑∫∞√≤≥≠±÷×∝∈∉⊆⊇∪∩',
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
    });
    this.isInitialized = true;
  }

  async extractTextFromCanvas(canvas: HTMLCanvasElement, bbox?: { x: number; y: number; width: number; height: number }): Promise<OCRResult> {
    await this.initialize();
    
    if (!this.worker) {
      throw new Error('OCR worker not initialized');
    }

    let imageData: HTMLCanvasElement | ImageData;

    if (bbox) {
      // Create cropped canvas for better OCR accuracy
      const croppedCanvas = document.createElement('canvas');
      const ctx = croppedCanvas.getContext('2d')!;
      croppedCanvas.width = bbox.width;
      croppedCanvas.height = bbox.height;
      
      ctx.drawImage(canvas, bbox.x, bbox.y, bbox.width, bbox.height, 0, 0, bbox.width, bbox.height);
      imageData = croppedCanvas;
    } else {
      imageData = canvas;
    }

    try {
      const { data } = await this.worker.recognize(imageData);
      const text = this.cleanOCRText(data.text);
      const hasLatex = this.detectMathContent(text);
      
      return {
        text,
        confidence: data.confidence,
        hasLatex
      };
    } catch (error) {
      console.error('OCR extraction failed:', error);
      return {
        text: '',
        confidence: 0,
        hasLatex: false
      };
    }
  }

  private cleanOCRText(text: string): string {
    return text
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Fix common OCR mistakes
      .replace(/(\d+)\s*\.\s*([A-Z])/g, '$1. $2') // Fix question numbering
      .replace(/([a-z])\s*\)\s*/g, '$1) ') // Fix option lettering
      .replace(/\|\s*/g, 'I') // Fix I recognition
      .replace(/0/g, 'O') // Context-based O/0 correction in text
      .replace(/5/g, 'S') // Context-based S/5 correction in text
      // Clean LaTeX-like content
      .replace(/\s*\$\s*/g, '$')
      .replace(/\\\s+/g, '\\')
      // Remove artifacts
      .replace(/[|_]+/g, ' ')
      .trim();
  }

  private detectMathContent(text: string): boolean {
    const mathPatterns = [
      /\$[^$]+\$/,
      /\\[a-zA-Z]+/,
      /\^[\w{}]+/,
      /_[\w{}]+/,
      /[∑∫∞√≤≥≠±÷×∝∈∉⊆⊇∪∩]/,
      /[αβγδεζηθικλμνξοπρστυφχψω]/,
      /\b(sin|cos|tan|log|ln|exp|lim|max|min)\b/i
    ];
    
    return mathPatterns.some(pattern => pattern.test(text));
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }
}

// Enhanced text extraction combining PDF.js and OCR
export class HybridTextExtractor {
  private ocrExtractor: OCRExtractor;

  constructor() {
    this.ocrExtractor = new OCRExtractor();
  }

  async extractFromBoundingBox(
    pdf: any,
    canvas: HTMLCanvasElement,
    pageNumber: number,
    bbox: { x: number; y: number; width: number; height: number },
    scale: number = 1.5
  ): Promise<{ text: string; method: 'pdf' | 'ocr' | 'hybrid'; confidence: number; hasLatex: boolean }> {
    
    // First, try PDF.js text extraction
    let pdfText = '';
    let pdfConfidence = 0;
    
    try {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale });
      
      // Convert screen coordinates to PDF coordinates
      const pdfBbox = {
        x: bbox.x / scale,
        y: (viewport.height - bbox.y - bbox.height) / scale,
        width: bbox.width / scale,
        height: bbox.height / scale,
      };
      
      textContent.items.forEach((item: any) => {
        if (item.transform) {
          const [, , , , x, y] = item.transform;
          
          if (
            x >= pdfBbox.x &&
            x <= pdfBbox.x + pdfBbox.width &&
            y >= pdfBbox.y &&
            y <= pdfBbox.y + pdfBbox.height
          ) {
            pdfText += item.str + ' ';
          }
        }
      });
      
      pdfText = pdfText.trim();
      pdfConfidence = pdfText.length > 0 ? 95 : 0; // High confidence if text found
    } catch (error) {
      console.error('PDF text extraction failed:', error);
    }

    // If PDF extraction yields good results, use it
    if (pdfText.length > 10 && pdfConfidence > 90) {
      return {
        text: pdfText,
        method: 'pdf',
        confidence: pdfConfidence,
        hasLatex: this.detectLatex(pdfText)
      };
    }

    // Otherwise, use OCR
    try {
      const ocrResult = await this.ocrExtractor.extractTextFromCanvas(canvas, bbox);
      
      if (ocrResult.confidence > 60) {
        // If both methods found text, combine them intelligently
        if (pdfText.length > 0 && ocrResult.text.length > 0) {
          const combinedText = this.combineTextResults(pdfText, ocrResult.text);
          return {
            text: combinedText,
            method: 'hybrid',
            confidence: Math.max(pdfConfidence, ocrResult.confidence),
            hasLatex: ocrResult.hasLatex || this.detectLatex(pdfText)
          };
        }
        
        return {
          text: ocrResult.text,
          method: 'ocr',
          confidence: ocrResult.confidence,
          hasLatex: ocrResult.hasLatex
        };
      }
    } catch (error) {
      console.error('OCR extraction failed:', error);
    }

    // Fallback to whatever we have
    return {
      text: pdfText || 'Unable to extract text',
      method: pdfText ? 'pdf' : 'ocr',
      confidence: pdfConfidence || 0,
      hasLatex: this.detectLatex(pdfText)
    };
  }

  private combineTextResults(pdfText: string, ocrText: string): string {
    // Simple combination strategy - prefer PDF text but fill gaps with OCR
    if (pdfText.length > ocrText.length * 0.8) {
      return pdfText;
    }
    
    // If OCR found significantly more text, it might have caught images
    if (ocrText.length > pdfText.length * 1.5) {
      return ocrText;
    }
    
    // Combine both, preferring PDF structure
    return pdfText + ' ' + ocrText;
  }

  private detectLatex(text: string): boolean {
    const latexPatterns = [
      /\$[^$]+\$/g,
      /\\[a-zA-Z]+\{[^}]*\}/g,
      /\\[a-zA-Z]+/g,
      /\^[^{\s]+/g,
      /_[^{\s]+/g,
      /\^{[^}]+}/g,
      /_{[^}]+}/g,
      /[∑∫∞√≤≥≠±÷×∝∈∉⊆⊇∪∩]/,
      /[αβγδεζηθικλμνξοπρστυφχψω]/
    ];

    return latexPatterns.some(pattern => pattern.test(text));
  }

  async terminate(): Promise<void> {
    await this.ocrExtractor.terminate();
  }
}