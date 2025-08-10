import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
}

export const loadPDF = async (file: File): Promise<pdfjsLib.PDFDocumentProxy> => {
  const arrayBuffer = await file.arrayBuffer();
  return await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
};

export const renderPage = async (
  pdf: pdfjsLib.PDFDocumentProxy, 
  pageNumber: number, 
  canvas: HTMLCanvasElement,
  scale: number = 1.5
): Promise<void> => {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not get canvas context');
  
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  
  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };
  
  await page.render(renderContext).promise;
};

export const getPageText = async (
  pdf: pdfjsLib.PDFDocumentProxy, 
  pageNumber: number
): Promise<string> => {
  const page = await pdf.getPage(pageNumber);
  const textContent = await page.getTextContent();
  
  return textContent.items
    .map((item: any) => item.str)
    .join(' ');
};

export const extractTextFromBoundingBox = async (
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  bbox: { x: number; y: number; width: number; height: number },
  scale: number = 1.5
): Promise<string> => {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const textContent = await page.getTextContent();
  
  // Convert screen coordinates to PDF coordinates
  const pdfBbox = {
    x: bbox.x / scale,
    y: (viewport.height - bbox.y - bbox.height) / scale,
    width: bbox.width / scale,
    height: bbox.height / scale,
  };
  
  let extractedText = '';
  
  textContent.items.forEach((item: any) => {
    if (item.transform) {
      const [, , , , x, y] = item.transform;
      
      // Check if text item is within bounding box
      if (
        x >= pdfBbox.x &&
        x <= pdfBbox.x + pdfBbox.width &&
        y >= pdfBbox.y &&
        y <= pdfBbox.y + pdfBbox.height
      ) {
        extractedText += item.str + ' ';
      }
    }
  });
  
  return extractedText.trim();
};