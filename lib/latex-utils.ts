export const detectLatex = (text: string): boolean => {
  const latexPatterns = [
    /\$[^$]+\$/g, // Inline math $...$
    /\$\$[^$]+\$\$/g, // Display math $$...$$
    /\\[a-zA-Z]+\{[^}]*\}/g, // LaTeX commands like \frac{}{}, \sqrt{}
    /\\[a-zA-Z]+/g, // Simple commands like \alpha, \beta
    /\^[^{\s]+/g, // Superscripts
    /_[^{\s]+/g, // Subscripts
    /\^{[^}]+}/g, // Complex superscripts
    /_{[^}]+}/g, // Complex subscripts
  ];

  return latexPatterns.some(pattern => pattern.test(text));
};

export const cleanLatex = (text: string): string => {
  // Clean common OCR errors in LaTeX
  return text
    .replace(/\s*\$\s*/g, '$') // Remove spaces around $
    .replace(/\\\s+/g, '\\') // Remove spaces after backslash
    .replace(/\{\s+/g, '{') // Remove spaces after {
    .replace(/\s+\}/g, '}') // Remove spaces before }
    .replace(/([a-zA-Z])\s+([a-zA-Z])/g, '$1$2') // Remove spaces in variable names
    .trim();
};

export const wrapLatexInline = (text: string): string => {
  // If text contains LaTeX but isn't wrapped, wrap it
  if (detectLatex(text) && !text.includes('$')) {
    return `$${text}$`;
  }
  return text;
};

export const extractLatexFromText = (text: string): string[] => {
  const latexMatches: string[] = [];
  const patterns = [
    /\$[^$]+\$/g,
    /\$\$[^$]+\$\$/g,
  ];

  patterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      latexMatches.push(...matches);
    }
  });

  return latexMatches;
};