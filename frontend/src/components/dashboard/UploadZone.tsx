import { useCallback, useMemo, useRef, useState } from 'react';
import { FileText, Loader2, Upload, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useApp } from '@/context/AppContext';
import { cn, formatFileSize } from '@/lib/utils';
import type { ExtractedRecord } from '@/api';

function fileStatus(
  record: ExtractedRecord | undefined,
  isProcessing: boolean
): { label: string; variant: 'secondary' | 'success' | 'required' | 'history' | 'default' } {
  if (isProcessing && !record) {
    return { label: 'Processing', variant: 'default' };
  }
  if (!record) {
    return { label: 'Queued', variant: 'secondary' };
  }
  if (record.status === 'Invalid') {
    return { label: 'Invalid', variant: 'required' };
  }
  if (record.status === 'Duplicate') {
    return { label: 'Duplicate', variant: 'history' };
  }
  if (record.status === 'New') {
    return { label: 'Ready', variant: 'success' };
  }
  return { label: record.status, variant: 'secondary' };
}

export function UploadZone() {
  const {
    uploadedFiles,
    records,
    onFilesSelected,
    onRemoveFile,
    onRemoveAllFiles,
    isUploading,
    uploadProgress,
    isProcessing,
  } = useUploadProps();

  const recordByFile = useMemo(() => {
    const map = new Map<string, ExtractedRecord>();
    records.forEach((r) => {
      if (r.filename) map.set(r.filename, r);
    });
    return map;
  }, [records]);

  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removingAll, setRemovingAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return;
      const pdfs = Array.from(list).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
      if (pdfs.length) await onFilesSelected(pdfs);
    },
    [onFilesSelected]
  );

  const handleRemove = async (filename: string) => {
    setRemoving(filename);
    try {
      await onRemoveFile(filename);
    } finally {
      setRemoving(null);
    }
  };

  const handleRemoveAll = async () => {
    setRemovingAll(true);
    try {
      await onRemoveAllFiles();
    } finally {
      setRemovingAll(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>DN PDF Upload</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={async (e) => { e.preventDefault(); setDragging(false); await handleFiles(e.dataTransfer.files); }}
          className={cn(
            'rounded-xl border-2 border-dashed p-12 text-center transition-all',
            dragging ? 'border-brand-700 bg-brand-50 dark:bg-brand-950/30' : 'border-slate-300 dark:border-slate-600'
          )}
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900">
            <FileText className="h-7 w-7 text-brand-700" />
          </div>
          <p className="text-lg font-medium text-slate-800 dark:text-slate-100">Drop DN PDFs Here</p>
          <p className="mt-1 text-sm text-slate-500">Supports multiple delivery note files</p>
          <p className="my-4 text-xs text-slate-400">or</p>
          <Button onClick={() => inputRef.current?.click()} disabled={isUploading} size="lg">
            <Upload className="h-4 w-4" />
            Choose Files
          </Button>
          <input ref={inputRef} type="file" accept=".pdf" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </div>

        {isUploading && uploadProgress !== null && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Uploading...</span><span>{uploadProgress}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-2 rounded-full bg-brand-700 transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
        )}

        {uploadedFiles.length > 0 && (
          <div className="mt-4 flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">{uploadedFiles.length} file(s) queued</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
              disabled={isUploading || isProcessing || removingAll}
              onClick={handleRemoveAll}
            >
              {removingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Remove All
            </Button>
          </div>
        )}

        {uploadedFiles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {uploadedFiles.map((f) => {
              const record = recordByFile.get(f.name);
              const status = fileStatus(record, isProcessing);
              const dn = record?.dn_number;
              const qty = record?.quantity;
              const metaParts = [
                formatFileSize(f.size),
                dn ? `DN ${dn}` : null,
                qty ? `Qty ${qty}` : null,
              ].filter(Boolean);

              return (
                <div
                  key={f.name}
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1.5 pl-3 pr-1.5 text-sm dark:border-slate-700 dark:bg-slate-900/80"
                  title={f.name}
                >
                  {isProcessing && !record ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-700" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0 text-brand-700" />
                  )}
                  <span className="max-w-[140px] truncate font-medium text-slate-800 dark:text-slate-100">
                    {f.name}
                  </span>
                  <span className="hidden sm:inline text-xs text-slate-500 truncate max-w-[180px]">
                    {metaParts.join(' · ')}
                  </span>
                  <Badge variant={status.variant} className="text-[10px] px-2 py-0 shrink-0">
                    {status.label}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    disabled={isUploading || isProcessing || removing === f.name}
                    onClick={() => handleRemove(f.name)}
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function useUploadProps() {
  const {
    uploadedFiles,
    records,
    handleFilesSelected,
    removeUploadedFile,
    removeAllUploadedFiles,
    isUploading,
    uploadProgress,
    isProcessing,
  } = useApp();
  return {
    uploadedFiles,
    records,
    onFilesSelected: handleFilesSelected,
    onRemoveFile: removeUploadedFile,
    onRemoveAllFiles: removeAllUploadedFiles,
    isUploading,
    uploadProgress,
    isProcessing,
  };
}
