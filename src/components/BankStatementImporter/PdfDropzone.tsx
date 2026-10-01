import React, { useRef, useState } from 'react';
import { UploadCloud, FileText, AlertCircle, RefreshCw } from 'lucide-react';

interface PdfDropzoneProps {
  onFileLoaded: (file: File) => void;
  isLoading?: boolean;
}

export const PdfDropzone: React.FC<PdfDropzoneProps> = ({ onFileLoaded, isLoading = false }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndProcessFile = (file: File) => {
    setErrorMessage(null);
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorMessage('Please select a valid PDF file.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('File size exceeds 20MB limit.');
      return;
    }
    onFileLoaded(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcessFile(e.target.files[0]);
    }
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isLoading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center ${
          isDragOver
            ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500 bg-gray-50/50 dark:bg-gray-800/40'
        } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileInputChange}
          className="hidden"
        />

        {isLoading ? (
          <div className="flex flex-col items-center">
            <RefreshCw className="h-12 w-12 text-indigo-500 animate-spin mb-3" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Extracting and decrypting statement...
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="h-14 w-14 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-4 shadow-sm">
              <UploadCloud className="h-7 w-7" />
            </div>
            <h4 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-1">
              Drop your bank statement PDF here
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-sm">
              Supports Mandiri and Jenius e-statements. Processed 100% locally in your browser.
            </p>
            <span className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 shadow-sm">
              <FileText className="h-3.5 w-3.5 mr-1.5 text-gray-500" />
              Browse PDF file
            </span>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="mt-3 flex items-center text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-2.5 rounded-lg border border-red-200 dark:border-red-900/50">
          <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
