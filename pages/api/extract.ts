import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

// Note: For Vercel deployment, we'll use a client-side extraction approach
// since server-side PDF processing with canvas and complex dependencies
// can be challenging in serverless environments

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileId, boundingBox, type } = req.body;

    if (!boundingBox) {
      return res.status(400).json({
        success: false,
        message: 'Bounding box coordinates required',
      });
    }

    // For this demo, we'll return mock extracted text
    // In a real implementation, you would:
    // 1. Load the PDF file using the fileId
    // 2. Extract text from the specified bounding box coordinates
    // 3. Process the text for LaTeX detection
    
    const mockTexts = {
      question: [
        "What is the derivative of $f(x) = x^2 + 3x + 2$?",
        "Solve for x: $2x + 5 = 13$",
        "Which of the following is equivalent to $\\frac{a^2 - b^2}{a + b}$?",
        "Find the value of $\\int_0^1 x^2 dx$",
        "What is the solution to the equation $x^2 - 5x + 6 = 0$?"
      ],
      option: [
        "$2x + 3$",
        "$x = 4$",
        "$a - b$",
        "$\\frac{1}{3}$",
        "$x = 2, x = 3$",
        "$2x^2 + 3$",
        "$x = 8$",
        "$a + b$",
        "$\\frac{2}{3}$",
        "$x = 1, x = 6$",
        "$x^2 + 3$",
        "$x = -4$",
        "$\\frac{a^2}{b^2}$",
        "$1$",
        "$x = -2, x = -3$"
      ]
    };

    // Simulate text extraction with random selection
    const texts = type === 'question' ? mockTexts.question : mockTexts.option;
    const extractedText = texts[Math.floor(Math.random() * texts.length)];
    
    // Detect if text contains LaTeX
    const hasLatex = /\$.*\$|\\[a-zA-Z]+/.test(extractedText);

    res.status(200).json({
      success: true,
      text: extractedText,
      hasLatex,
    });
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({
      success: false,
      message: 'Text extraction failed',
    });
  }
}