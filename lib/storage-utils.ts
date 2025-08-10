// lib/storage-utils.ts

export interface StoredFile {
  id: string;
  name: string;
  timestamp: number;
  size: number;
  type: string;
}

export interface StoredMCQData {
  id: string;
  fileName: string;
  timestamp: number;
  mcqs: any[];
  boundingBoxes: any[];
}

export class LocalStorage {
  private static readonly FILES_KEY = 'mcq_tool_files';
  private static readonly MCQ_DATA_KEY = 'mcq_tool_data';
  private static readonly MAX_STORAGE_SIZE = 500 * 1024 * 1024; // 500MB

  // File Management
  static async saveFile(file: File): Promise<string> {
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Check storage capacity
      await this.checkStorageCapacity(file.size);
      
      // Convert file to base64 for storage
      const base64Data = await this.fileToBase64(file);
      
      const storedFile: StoredFile = {
        id: fileId,
        name: file.name,
        timestamp: Date.now(),
        size: file.size,
        type: file.type
      };

      // Store file metadata
      const files = this.getStoredFiles();
      files.push(storedFile);
      localStorage.setItem(this.FILES_KEY, JSON.stringify(files));
      
      // Store actual file data
      localStorage.setItem(`file_${fileId}`, base64Data);
      
      return fileId;
    } catch (error) {
      console.error('Failed to save file:', error);
      throw new Error('Failed to save file to local storage');
    }
  }

  static async getFile(fileId: string): Promise<File | null> {
    try {
      const files = this.getStoredFiles();
      const fileInfo = files.find(f => f.id === fileId);
      
      if (!fileInfo) return null;
      
      const base64Data = localStorage.getItem(`file_${fileId}`);
      if (!base64Data) return null;
      
      const file = this.base64ToFile(base64Data, fileInfo.name, fileInfo.type);
      return file;
    } catch (error) {
      console.error('Failed to retrieve file:', error);
      return null;
    }
  }

  static getStoredFiles(): StoredFile[] {
    try {
      const files = localStorage.getItem(this.FILES_KEY);
      return files ? JSON.parse(files) : [];
    } catch {
      return [];
    }
  }

  static deleteFile(fileId: string): void {
    try {
      // Remove file data
      localStorage.removeItem(`file_${fileId}`);
      
      // Remove file metadata
      const files = this.getStoredFiles();
      const updatedFiles = files.filter(f => f.id !== fileId);
      localStorage.setItem(this.FILES_KEY, JSON.stringify(updatedFiles));
      
      // Also remove associated MCQ data
      this.deleteMCQData(fileId);
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  }

  // MCQ Data Management
  static saveMCQData(fileId: string, fileName: string, mcqs: any[], boundingBoxes: any[]): string {
    const dataId = `data_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const mcqData: StoredMCQData = {
      id: dataId,
      fileName,
      timestamp: Date.now(),
      mcqs,
      boundingBoxes
    };

    try {
      const allData = this.getStoredMCQData();
      allData.push(mcqData);
      localStorage.setItem(this.MCQ_DATA_KEY, JSON.stringify(allData));
      
      return dataId;
    } catch (error) {
      console.error('Failed to save MCQ data:', error);
      throw new Error('Failed to save MCQ data');
    }
  }

  static getMCQData(dataId: string): StoredMCQData | null {
    try {
      const allData = this.getStoredMCQData();
      return allData.find(d => d.id === dataId) || null;
    } catch {
      return null;
    }
  }

  static getStoredMCQData(): StoredMCQData[] {
    try {
      const data = localStorage.getItem(this.MCQ_DATA_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  static deleteMCQData(fileId: string): void {
    try {
      const allData = this.getStoredMCQData();
      const updatedData = allData.filter(d => d.id !== fileId);
      localStorage.setItem(this.MCQ_DATA_KEY, JSON.stringify(updatedData));
    } catch (error) {
      console.error('Failed to delete MCQ data:', error);
    }
  }

  // Utility Methods
  private static async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  }

  private static base64ToFile(base64Data: string, fileName: string, fileType: string): File {
    const byteCharacters = atob(base64Data.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new File([byteArray], fileName, { type: fileType });
  }

  private static async checkStorageCapacity(fileSize: number): Promise<void> {
    const currentUsage = this.getStorageUsage();
    
    if (currentUsage + fileSize > this.MAX_STORAGE_SIZE) {
      throw new Error(`File too large. Current usage: ${this.formatBytes(currentUsage)}, File size: ${this.formatBytes(fileSize)}, Limit: ${this.formatBytes(this.MAX_STORAGE_SIZE)}`);
    }
  }

  static getStorageUsage(): number {
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length;
      }
    }
    return total;
  }

  static getRemainingStorage(): number {
    return Math.max(0, this.MAX_STORAGE_SIZE - this.getStorageUsage());
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static exportMCQAsJSON(mcqs: any[], fileName: string): void {
    const dataStr = JSON.stringify({
      exportDate: new Date().toISOString(),
      fileName: fileName,
      totalQuestions: mcqs.length,
      mcqs: mcqs
    }, null, 2);
    
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName.replace('.pdf', '')}_mcqs_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  static exportMCQAsCSV(mcqs: any[], fileName: string): void {
    const headers = ['Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Option E', 'Correct Answer', 'Page'];
    const csvRows = [headers.join(',')];
    
    mcqs.forEach(mcq => {
      const row = [
        `"${mcq.question.replace(/"/g, '""')}"`,
        `"${(mcq.options[0] || '').replace(/"/g, '""')}"`,
        `"${(mcq.options[1] || '').replace(/"/g, '""')}"`,
        `"${(mcq.options[2] || '').replace(/"/g, '""')}"`,
        `"${(mcq.options[3] || '').replace(/"/g, '""')}"`,
        `"${(mcq.options[4] || '').replace(/"/g, '""')}"`,
        `"${(mcq.correct_answer || '').replace(/"/g, '""')}"`,
        mcq.page
      ];
      csvRows.push(row.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    const dataBlob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName.replace('.pdf', '')}_mcqs_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Clean up old files to free space
  static cleanupOldFiles(daysOld: number = 7): void {
    const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    
    const files = this.getStoredFiles();
    const filesToDelete = files.filter(f => f.timestamp < cutoffTime);
    
    filesToDelete.forEach(file => {
      this.deleteFile(file.id);
    });
    
    console.log(`Cleaned up ${filesToDelete.length} old files`);
  }
}