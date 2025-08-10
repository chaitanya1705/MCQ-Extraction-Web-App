# MCQ Extraction Web App

A complete web application for extracting Multiple Choice Questions from PDFs with LaTeX support, built with Next.js and deployable on Vercel.

## 🚀 Live Demo

Deploy this app to Vercel in minutes and start extracting MCQs from your PDFs!

## ✨ Features

- **PDF Upload & Viewing**: Upload PDFs and view them with zoom and navigation controls
- **Interactive Selection**: Draw bounding boxes around questions and options
- **Smart Text Extraction**: Extract text from selected regions with high accuracy
- **LaTeX Support**: Full LaTeX rendering with KaTeX for mathematical expressions
- **Inline Editing**: Edit extracted text directly in the interface
- **JSON Export**: Download extracted MCQs in structured JSON format
- **Modern UI**: Beautiful, responsive interface built with Tailwind CSS
- **Single Deployment**: Entire app deployable as one Vercel project

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **PDF Processing**: PDF.js for viewing, client-side extraction
- **LaTeX Rendering**: KaTeX with react-katex
- **Icons**: Lucide React
- **Deployment**: Vercel (serverless functions)

## 📁 Project Structure

```
mcq-extraction-app/
├── components/
│   ├── Layout.tsx              # Main layout component
│   ├── PDFViewer.tsx           # PDF display with controls
│   ├── BoundingBoxSelector.tsx # Interactive selection tool
│   └── MCQEditor.tsx           # Edit extracted MCQs
├── pages/
│   ├── api/
│   │   ├── upload.ts           # Handle PDF uploads
│   │   ├── extract.ts          # Text extraction endpoint
│   │   └── render-latex.ts     # LaTeX validation
│   ├── _app.tsx               # Next.js app wrapper
│   ├── _document.tsx          # HTML document structure
│   └── index.tsx              # Main application page
├── lib/
│   ├── types.ts              # TypeScript definitions
│   ├── pdf-utils.ts          # PDF processing utilities
│   └── latex-utils.ts        # LaTeX helper functions
├── styles/
│   └── globals.css           # Global styles and utilities
├── public/
│   └── sample.pdf            # Example PDF for testing
├── package.json              # Dependencies and scripts
├── next.config.js            # Next.js configuration
├── tailwind.config.js        # Tailwind CSS setup
├── tsconfig.json             # TypeScript configuration
├── vercel.json               # Vercel deployment config
└── README.md                 # This file
```

## 🚀 Quick Start

### 1. Create the Project

```bash
# Create Next.js app with TypeScript and Tailwind
npx create-next-app@latest mcq-extraction-app --typescript --tailwind --eslint --app-router=false
cd mcq-extraction-app
```

### 2. Install Dependencies

```bash
# Install all required packages
npm install pdfjs-dist react-katex katex formidable lucide-react
npm install --save-dev @types/formidable @types/katex
```

### 3. Set Up Project Files

Copy all the files from this project structure into your created app:

- Replace `pages/index.tsx` with the main application
- Add all component files to `components/`
- Add utility files to `lib/`
- Add API routes to `pages/api/`
- Update configuration files (`next.config.js`, `tailwind.config.js`, etc.)
- Replace `styles/globals.css` with the provided styles

### 4. Create Upload Directory

```bash
mkdir uploads
echo "uploads/" >> .gitignore
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## 🌐 Deploy to Vercel

### Method 1: GitHub Integration (Recommended)

1. Push your code to a GitHub repository
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click "New Project"
4. Import your GitHub repository
5. Deploy with default settings

### Method 2: Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from project directory
vercel

# Follow the prompts to deploy
```

### Method 3: Direct Deploy

1. Zip your project folder
2. Go to [Vercel](https://vercel.com)
3. Drag and drop your zip file
4. Wait for deployment

## 📝 Usage Guide

### Step 1: Upload PDF
- Click "Upload PDF" on the homepage
- Select a PDF file containing multiple choice questions
- Wait for the PDF to load in the viewer

### Step 2: Select Questions and Options
- Use the drawing tool to create bounding boxes
- Select "Question" type for question text
- Select "Option" type for answer choices
- Draw boxes around each piece of text you want to extract
- Resize and move boxes as needed
- Double-click boxes to delete them

### Step 3: Extract Text
- Click "Extract Text" once you've selected all elements
- The app will process your selections and extract the text
- Review the extracted content for accuracy

### Step 4: Edit and Refine
- Click any text to edit it inline
- The app supports LaTeX syntax (use $ symbols for math)
- Mark correct answers by selecting the radio button
- Delete unwanted MCQs using the delete button

### Step 5: Export
- Click "Download JSON" to export your MCQs
- The file contains structured data ready for use

## 🔧 Configuration

### Environment Variables (Optional)

Create a `.env.local` file for custom settings:

```env
# Maximum file size for uploads (default: 10MB)
MAX_FILE_SIZE=10485760

# Upload directory (default: ./uploads)
UPLOAD_DIR=./uploads
```

### Customization Options

#### PDF Viewer Settings
Edit `components/PDFViewer.tsx`:
- Modify default scale (currently 1.5x)
- Change zoom limits (0.5x to 3x)
- Adjust canvas dimensions

#### LaTeX Configuration
Edit `lib/latex-utils.ts`:
- Add custom LaTeX pattern detection
- Modify cleaning functions
- Extend symbol recognition

#### UI Styling
Edit `styles/globals.css` and component files:
- Change color scheme
- Modify animations and transitions
- Adjust responsive breakpoints

## 📊 Sample Output

The app exports MCQs in this JSON format:

```json
[
  {
    "id": "mcq-1",
    "question": "What is the derivative of $f(x) = x^2 + 3x + 2$?",
    "options": [
      "$2x + 3$",
      "$x^2 + 3$",
      "$2x + 2$",
      "$3x + 2$"
    ],
    "correct_answer": "$2x + 3$",
    "page": 1
  }
]
```

## 🔍 Troubleshooting

### Common Issues

**PDF not loading**
- Ensure file is a valid PDF
- Check file size (max 10MB by default)
- Try a different PDF file

**Bounding boxes not working**
- Make sure you're clicking and dragging on the overlay
- Check that PDF has loaded completely
- Try refreshing the page

**LaTeX not rendering**
- Ensure KaTeX CSS is loaded
- Check LaTeX syntax (balanced braces, valid commands)
- Use $ symbols to wrap math expressions

**Deployment issues**
- Check that all dependencies are in package.json
- Ensure vercel.json is configured correctly
- Review Vercel build logs for specific errors

### Performance Optimization

For large PDFs or many extractions:
- Consider implementing caching for rendered pages
- Add loading states for better UX
- Implement pagination for large MCQ sets
- Consider server-side processing for complex LaTeX



## 📄 License

This project is open source and available under the MIT License.

