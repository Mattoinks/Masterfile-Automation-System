import { useState } from 'react';
import { Loader2, Play, Save, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  processLot2526Pdfs,
  saveLot2526Records,
  uploadLot2526Pdfs,
  type Lot2526BreakdownRecord,
} from '@/api';

const EMPTY_RECORD: Lot2526BreakdownRecord = {
  case_no: null,
  record_id: null,
  test_bau: '',
  original_label_lot_no: '',
  date_code: '',
  return_qty_from_dc: '',
  created_lot_no: '',
  disposition_or_ss_plan_name: '',
  date_attached_ss_plan: '',
  lw: '',
  date_created: '',
  created_date_code: '',
  physical_lot_qty: '',
  lot_code: '',
  filename: '',
};

const FIELD_LABELS: { key: keyof Lot2526BreakdownRecord; label: string }[] = [
  { key: 'test_bau', label: 'Test Bau' },
  { key: 'original_label_lot_no', label: 'Original Label Lot no.' },
  { key: 'date_code', label: 'Date code' },
  { key: 'return_qty_from_dc', label: 'Return Qty from DC' },
  { key: 'created_lot_no', label: 'Created Lot#' },
  { key: 'date_created', label: 'Date Created' },
  { key: 'created_date_code', label: 'Date Code (Created Lot#)' },
  { key: 'physical_lot_qty', label: 'Physical Lot Qty' },
  { key: 'lot_code', label: 'Lot Code' },
  { key: 'disposition_or_ss_plan_name', label: 'Disposition or SS Plan Name' },
  { key: 'date_attached_ss_plan', label: 'Date attached SS Plan' },
  { key: 'lw', label: 'LW' },
];

export function Lot2526Page() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [drafts, setDrafts] = useState<Lot2526BreakdownRecord[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedCaseNumbers, setSavedCaseNumbers] = useState<number[] | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const onChooseFiles = (files: FileList | null) => {
    if (!files) return;
    setSelectedFiles(Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.pdf')));
    setSavedCaseNumbers(null);
  };

  const onUploadAndProcess = async () => {
    if (!selectedFiles.length) return;
    setErrors([]);
    setSavedCaseNumbers(null);
    try {
      setIsUploading(true);
      await uploadLot2526Pdfs(selectedFiles);
      setIsUploading(false);

      setIsProcessing(true);
      const result = await processLot2526Pdfs();
      setDrafts(result.drafts);
      setErrors(result.errors);
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setIsUploading(false);
      setIsProcessing(false);
    }
  };

  const updateDraft = (index: number, key: keyof Lot2526BreakdownRecord, value: string) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, [key]: value } : d)));
  };

  const onSave = async () => {
    if (!drafts.length) return;
    setIsSaving(true);
    setErrors([]);
    try {
      const result = await saveLot2526Records(drafts);
      setSavedCaseNumbers(result.saved_case_numbers);
      setErrors(result.errors);
      if (!result.errors.length) {
        setDrafts([]);
        setSelectedFiles([]);
      }
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-2xl font-bold">2526 — DN Breakdown</h2>
        <p className="text-sm text-slate-500">
          Upload DN PDFs to append breakdown rows (Test Bau, Original Label Lot no., Date code,
          Return Qty from DC) to the 2526 worksheet. Disposition/SS Plan, Date Attached, and LW are
          filled in later by engineers.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload DN PDF(s)</CardTitle>
          <CardDescription>Only fields actually present in the PDF are extracted; nothing is guessed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 hover:border-brand-700 dark:border-slate-700">
            <UploadCloud className="h-6 w-6" />
            {selectedFiles.length
              ? `${selectedFiles.length} file(s) selected`
              : 'Click to choose DN PDF files'}
            <input
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => onChooseFiles(e.target.files)}
            />
          </label>

          <Button
            size="lg"
            onClick={onUploadAndProcess}
            disabled={!selectedFiles.length || isUploading || isProcessing}
          >
            {isUploading || isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {isUploading ? 'Uploading…' : isProcessing ? 'Extracting…' : 'Upload & Extract'}
          </Button>
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="pt-6 text-sm text-red-600">
            {errors.map((e, i) => (
              <p key={i}>{e}</p>
            ))}
          </CardContent>
        </Card>
      )}

      {savedCaseNumbers && savedCaseNumbers.length > 0 && (
        <Card className="border-emerald-200 dark:border-emerald-900">
          <CardContent className="pt-6 text-sm text-emerald-700 dark:text-emerald-400">
            Saved case number(s): {savedCaseNumbers.join(', ')}
          </CardContent>
        </Card>
      )}

      {drafts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Review before saving</CardTitle>
            <CardDescription>Blank fields stay blank unless you fill them in manually.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {drafts.map((draft, index) => (
              <div key={index} className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs font-medium text-slate-500">{draft.filename || EMPTY_RECORD.filename}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {FIELD_LABELS.map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs font-medium text-slate-500">{label}</label>
                      <Input
                        value={draft[key] as string}
                        onChange={(e) => updateDraft(index, key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Button size="lg" onClick={onSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? 'Saving…' : 'Save to 2526 worksheet'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
