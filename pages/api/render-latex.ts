import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { latex } = req.body;

    if (!latex) {
      return res.status(400).json({
        success: false,
        message: 'LaTeX content required',
      });
    }

    // Basic LaTeX validation
    const isValidLatex = (text: string): boolean => {
      // Check for balanced braces
      let braceCount = 0;
      for (const char of text) {
        if (char === '{') braceCount++;
        if (char === '}') braceCount--;
        if (braceCount < 0) return false;
      }
      return braceCount === 0;
    };

    // Clean and validate LaTeX
    const cleanedLatex = latex
      .replace(/\s+/g, ' ')
      .trim();

    const isValid = isValidLatex(cleanedLatex);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid LaTeX syntax',
      });
    }

    // In a real implementation, you might want to:
    // 1. Use KaTeX server-side rendering
    // 2. Generate SVG or HTML output
    // 3. Cache rendered results
    
    res.status(200).json({
      success: true,
      latex: cleanedLatex,
      isValid: true,
      message: 'LaTeX validated successfully',
    });
  } catch (error) {
    console.error('LaTeX rendering error:', error);
    res.status(500).json({
      success: false,
      message: 'LaTeX rendering failed',
    });
  }
}