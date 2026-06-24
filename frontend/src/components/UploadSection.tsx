import { useCallback, useRef, useState } from 'react';

interface UploadSectionProps {
  uploadedFiles: string[];
  onFilesSelected: (files: File[]) => Promise<void>;
  uploadProgress: number | null;
  isUploading: boolean;
}

export function UploadSection({
  uploadedFiles,
  onFilesSelected,
  uploadProgress,
  isUploading,
}: UploadSectionProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) return;
      const pdfs = Array.from(fileList).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
      if (pdfs.length) await onFilesSelected(pdfs);
    },
    [onFilesSelected]
  );

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      await handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Upload DN PDF Files</h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-slate-300 bg-slate-50 hover:border-slate-400'
        }`}
      >
        <p className="text-slate-600 mb-2">Drag PDF Files Here</p>
        <p className="text-slate-400 text-sm mb-4">or</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          Choose Files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {isUploading && uploadProgress !== null && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-slate-500 mb-1">
            <span>Uploading...</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {uploadedFiles.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-slate-700 mb-2">Uploaded Files</p>
          <ul className="space-y-1">
            {uploadedFiles.map((name) => (
              <li key={name} className="text-sm text-slate-600 bg-slate-100 rounded px-3 py-1.5">
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
