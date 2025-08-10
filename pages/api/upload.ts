import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

const uploadDir = path.join(process.cwd(), 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({
      uploadDir,
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
      filter: ({ mimetype }) => {
        return mimetype === 'application/pdf';
      },
    });

    const [fields, files] = await form.parse(req);
    
    if (!files.file || !files.file[0]) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }

    const file = files.file[0];
    const fileId = path.basename(file.filepath);

    // Store file info in a simple way (in production, use a database)
    const fileInfo = {
      id: fileId,
      originalName: file.originalFilename,
      filepath: file.filepath,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };

    // Save file info to a JSON file (simple storage for demo)
    const infoPath = path.join(uploadDir, `${fileId}.json`);
    fs.writeFileSync(infoPath, JSON.stringify(fileInfo, null, 2));

    res.status(200).json({
      success: true,
      fileId,
      message: 'File uploaded successfully',
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Upload failed',
    });
  }
}