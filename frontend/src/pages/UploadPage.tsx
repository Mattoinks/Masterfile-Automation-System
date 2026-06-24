import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { UploadZone } from '@/components/dashboard/UploadZone';
import { ProcessingProgressCard } from '@/components/dashboard/ProcessingProgressCard';
import { ProcessingPipeline } from '@/components/dashboard/ProcessingPipeline';
import { useApp } from '@/context/AppContext';
import { Loader2, Play } from 'lucide-react';

export function UploadPage() {
  const { handleProcess, isProcessing, uploadedFiles } = useApp();
  const navigate = useNavigate();

  const onProcess = async () => {
    await handleProcess();
    navigate('/preview');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">Upload DN</h2>
        <p className="text-sm text-slate-500">Upload delivery note PDFs for OCR extraction and validation</p>
      </div>
      <UploadZone />
      <ProcessingProgressCard />
      <ProcessingPipeline />
      <div className="flex gap-3">
        <Button size="lg" onClick={onProcess} disabled={isProcessing || !uploadedFiles.length}>
          {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Extract & Validate
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link to="/preview">Continue to Preview</Link>
        </Button>
      </div>
    </div>
  );
}
