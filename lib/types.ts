export interface BoundingBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'question' | 'option';
  text?: string;
  page: number;
}

export interface MCQ {
  id: string;
  question: string;
  options: string[];
  correct_answer?: string;
  page: number;
}

export interface PDFData {
  file: File;
  numPages: number;
  currentPage: number;
}

export interface ExtractionResult {
  text: string;
  hasLatex: boolean;
  confidence: number;
}

export interface UploadResponse {
  success: boolean;
  fileId: string;
  message?: string;
}

export interface ExtractResponse {
  success: boolean;
  text: string;
  hasLatex: boolean;
  message?: string;
}