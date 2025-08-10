// lib/gemini-utils.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { BoundingBox, ExtractionResult } from './types';

export interface GeminiExtractionResult {
  text: string;
  confidence: number;
  hasLatex: boolean;
  isQuestion: boolean;
  options?: string[];
}

export class GeminiExtractor {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;

  constructor(apiKey?: string) {
    if (apiKey) {
      this.initialize(apiKey);
    }
  }

  initialize(apiKey: string): void {
    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    } catch (error) {
      console.error('Failed to initialize Gemini:', error);
      throw new Error('Invalid API key or initialization failed');
    }
  }

  isInitialized(): boolean {
    return this.model !== null;
  }

  async extractTextFromCanvas(
    canvas: HTMLCanvasElement,
    bbox: BoundingBox,
    extractionType: 'question' | 'option' = 'question'
  ): Promise<GeminiExtractionResult> {
    if (!this.model) {
      throw new Error('Gemini not initialized. Please provide a valid API key.');
    }

    try {
      // Crop the canvas to the bounding box
      const croppedCanvas = this.cropCanvas(canvas, bbox);
      
      // Convert canvas to base64 image
      const imageData = croppedCanvas.toDataURL('image/png');
      const base64Data = imageData.split(',')[1];

      // Create the prompt based on extraction type
      const prompt = this.createExtractionPrompt(extractionType);

      // Send to Gemini
      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Data,
            mimeType: 'image/png'
          }
        }
      ]);

      const response = await result.response;
      const text = response.text();

      // Parse the response
      return this.parseGeminiResponse(text, extractionType);
    } catch (error) {
      console.error('Gemini extraction failed:', error);
      throw new Error(`Gemini API error: ${(error as Error).message}`);
    }
  }

  async extractMCQFromCanvas(
    canvas: HTMLCanvasElement,
    questionBox: BoundingBox,
    optionBoxes: BoundingBox[]
  ): Promise<{ question: string; options: string[]; hasLatex: boolean }> {
    if (!this.model) {
      throw new Error('Gemini not initialized. Please provide a valid API key.');
    }

    try {
      // Create a combined image with question and options
      const combinedCanvas = this.createCombinedCanvas(canvas, questionBox, optionBoxes);
      const imageData = combinedCanvas.toDataURL('image/png');
      const base64Data = imageData.split(',')[1];

      const prompt = `
You are an expert at extracting Multiple Choice Questions from academic documents. 

Analyze this image and extract the complete MCQ with the following requirements:

1. QUESTION: Extract the main question text exactly as written
2. OPTIONS: Extract all visible answer options (A, B, C, D, E, etc.)
3. LATEX: Preserve any mathematical notation using LaTeX format with $ symbols
4. FORMATTING: Clean up OCR artifacts but maintain mathematical symbols

Please respond in this exact JSON format:
{
  "question": "extracted question text",
  "options": ["option A text", "option B text", "option C text", "option D text"],
  "hasLatex": true/false,
  "confidence": 0-100
}

Important:
- Wrap mathematical expressions in $ symbols (e.g., $x^2 + 3x + 2$)
- Include Greek letters as LaTeX (e.g., $\\alpha$, $\\beta$)
- Preserve fractions as $\\frac{numerator}{denominator}$
- Keep subscripts as $x_1$ and superscripts as $x^2$
- Remove any OCR artifacts like extra spaces or misrecognized characters
- If text is unclear, indicate lower confidence but still provide best attempt
`;

      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            data: base64Data,
            mimeType: 'image/png'
          }
        }
      ]);

      const response = await result.response;
      const text = response.text();

      // Parse JSON response
      const parsed = this.parseJSONResponse(text);
      
      return {
        question: parsed.question || '',
        options: parsed.options || [],
        hasLatex: parsed.hasLatex || false
      };
    } catch (error) {
      console.error('Gemini MCQ extraction failed:', error);
      throw new Error(`Failed to extract MCQ: ${(error as Error).message}`);
    }
  }

  private cropCanvas(canvas: HTMLCanvasElement, bbox: BoundingBox): HTMLCanvasElement {
    const croppedCanvas = document.createElement('canvas');
    const ctx = croppedCanvas.getContext('2d')!;
    
    croppedCanvas.width = bbox.width;
    croppedCanvas.height = bbox.height;
    
    ctx.drawImage(
      canvas,
      bbox.x, bbox.y, bbox.width, bbox.height,
      0, 0, bbox.width, bbox.height
    );
    
    return croppedCanvas;
  }

  private createCombinedCanvas(
    canvas: HTMLCanvasElement,
    questionBox: BoundingBox,
    optionBoxes: BoundingBox[]
  ): HTMLCanvasElement {
    // Calculate combined dimensions
    const allBoxes = [questionBox, ...optionBoxes];
    const minX = Math.min(...allBoxes.map(b => b.x));
    const minY = Math.min(...allBoxes.map(b => b.y));
    const maxX = Math.max(...allBoxes.map(b => b.x + b.width));
    const maxY = Math.max(...allBoxes.map(b => b.y + b.height));
    
    const combinedCanvas = document.createElement('canvas');
    const ctx = combinedCanvas.getContext('2d')!;
    
    combinedCanvas.width = maxX - minX;
    combinedCanvas.height = maxY - minY;
    
    // Fill with white background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height);
    
    // Draw the combined area
    ctx.drawImage(
      canvas,
      minX, minY, combinedCanvas.width, combinedCanvas.height,
      0, 0, combinedCanvas.width, combinedCanvas.height
    );
    
    return combinedCanvas;
  }

  private createExtractionPrompt(type: 'question' | 'option'): string {
    if (type === 'question') {
      return `
Extract the question text from this image. The text may contain mathematical equations.

Requirements:
- Extract the complete question text exactly as written
- Preserve mathematical notation using LaTeX format with $ symbols
- Clean up any OCR artifacts
- Wrap mathematical expressions in $ symbols (e.g., $x^2 + 3x + 2$)
- Convert mathematical symbols to LaTeX equivalents

Respond with only the cleaned question text.
`;
    } else {
      return `
Extract the answer option text from this image. This is likely a multiple choice option (A, B, C, D, etc.).

Requirements:
- Extract only the option text (not the letter identifier)
- Preserve mathematical notation using LaTeX format with $ symbols
- Clean up any OCR artifacts
- Wrap mathematical expressions in $ symbols

Respond with only the cleaned option text.
`;
    }
  }

  private parseGeminiResponse(text: string, type: 'question' | 'option'): GeminiExtractionResult {
    // Clean the response text
    const cleanedText = text
      .replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '') // Remove code blocks
      .replace(/^["']|["']$/g, '') // Remove surrounding quotes
      .trim();

    // Detect LaTeX
    const hasLatex = this.detectLatex(cleanedText);
    
    // Calculate confidence based on text quality
    const confidence = this.calculateConfidence(cleanedText);

    return {
      text: cleanedText,
      confidence,
      hasLatex,
      isQuestion: type === 'question'
    };
  }

  private parseJSONResponse(text: string): any {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // Fallback parsing if JSON is malformed
      const questionMatch = text.match(/"question":\s*"([^"]+)"/);
      const optionsMatch = text.match(/"options":\s*\[(.*?)\]/);
      const latexMatch = text.match(/"hasLatex":\s*(true|false)/);
      
      let options: string[] = [];
      if (optionsMatch) {
        options = optionsMatch[1]
          .split(',')
          .map(opt => opt.replace(/^\s*"|"\s*$/g, '').trim())
          .filter(opt => opt.length > 0);
      }

      return {
        question: questionMatch?.[1] || '',
        options,
        hasLatex: latexMatch?.[1] === 'true',
        confidence: 85
      };
    } catch (error) {
      console.error('Failed to parse Gemini response:', error);
      return {
        question: '',
        options: [],
        hasLatex: false,
        confidence: 0
      };
    }
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

  private calculateConfidence(text: string): number {
    if (!text || text.length < 3) return 0;
    
    let confidence = 80;
    
    // Boost confidence for common question indicators
    if (/^(what|which|how|find|solve|calculate|determine)/i.test(text)) {
      confidence += 10;
    }
    
    // Boost for mathematical content
    if (this.detectLatex(text)) {
      confidence += 5;
    }
    
    // Reduce for very short text
    if (text.length < 10) {
      confidence -= 20;
    }
    
    // Reduce for apparent OCR artifacts
    if (/[|_]{2,}/.test(text)) {
      confidence -= 15;
    }
    
    return Math.max(0, Math.min(100, confidence));
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      // Test with a simple text prompt
      const result = await model.generateContent('Say "API key valid" if you can read this.');
      const response = await result.response;
      const text = response.text();
      
      return text.toLowerCase().includes('api key valid');
    } catch (error) {
      console.error('API key validation failed:', error);
      return false;
    }
  }
}