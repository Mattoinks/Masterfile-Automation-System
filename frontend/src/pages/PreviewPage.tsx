import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExcelRowPreview } from '@/components/dashboard/ExcelRowPreview';
import { SpreadsheetReview } from '@/components/review/SpreadsheetReview';
import { FieldComparison } from '@/components/review/FieldComparison';
import { RecordFullViewModal } from '@/components/review/RecordFullViewModal';
import { ReviewToolbar } from '@/components/review/ReviewToolbar';
import { ApprovalPanel } from '@/components/review/ApprovalPanel';
import { Lot2526ReviewSection } from '@/components/review/Lot2526ReviewSection';
import { Lot2526CaseBrowser } from '@/components/review/Lot2526CaseBrowser';
import { DuplicateModal } from '@/components/duplicate/DuplicateModal';
import { ExcelChangePreview } from '@/components/duplicate/ExcelChangePreview';
import { useApp } from '@/context/AppContext';
import { downloadMasterfile } from '@/api';
import { useAuth } from '@/context/AuthContext';
import { Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FileSpreadsheet, Layers } from 'lucide-react';
import type { DuplicateAction } from '@/api';

export function PreviewPage() {
  const {
    lastSaveResult,
    lastCaseId,
    reviewMode,
    records,
    selectedRecordId,
    duplicateModalRecordId,
    duplicateActions,
    closeDuplicateModal,
    confirmDuplicateAction,
    exactDuplicateCount,
    possibleDuplicateCount,
    activeWorksheet,
    lot2526Drafts,
  } = useApp();
  const { can } = useAuth();
  const [modalAction, setModalAction] = useState<DuplicateAction>('skip');
  const [fullViewRecordId, setFullViewRecordId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'fy2526' | '2526'>('fy2526');

  const fullViewRecord = records.find((r) => r.record_id === fullViewRecordId);
  const fullViewIndex = fullViewRecord
    ? Math.max(0, records.findIndex((r) => r.record_id === fullViewRecord.record_id))
    : 0;

  const modalRecord = records.find((r) => r.record_id === duplicateModalRecordId);

  useEffect(() => {
    if (duplicateModalRecordId) {
      setModalAction(duplicateActions[duplicateModalRecordId] || 'skip');
    }
  }, [duplicateModalRecordId, duplicateActions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold">Review & Edit</h2>
            {reviewMode && <Badge variant="history">Review Mode</Badge>}
            {exactDuplicateCount > 0 && (
              <Badge variant="required">{exactDuplicateCount} Exact Duplicate(s)</Badge>
            )}
            {possibleDuplicateCount > 0 && (
              <Badge variant="secondary">{possibleDuplicateCount} Possible</Badge>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            AI extracts and suggests — you verify and adjust before FY2526 insertion
          </p>
        </div>
        <Button variant="outline" onClick={() => downloadMasterfile().catch(alert)}>
          <Download className="h-4 w-4" /> Export Excel
        </Button>
      </div>

      {lastSaveResult && (lastSaveResult.inserted > 0 || lastSaveResult.replaced > 0) && (
        <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30">
          <CardContent className="p-4 text-sm">
            <strong>
              Inserted {lastSaveResult.inserted}, replaced {lastSaveResult.replaced}
              {lastSaveResult.revised ? `, revised ${lastSaveResult.revised}` : ''}.
            </strong>
            {lastSaveResult.backup_file && (
              <p className="text-slate-600 dark:text-slate-300 mt-1">
                Backup saved: {lastSaveResult.backup_file}
              </p>
            )}
            {lastSaveResult.inserted > 0 && (
              <p className="text-slate-600 dark:text-slate-300 mt-1">
                Case IDs: {lastCaseId - lastSaveResult.inserted + 1}–{lastCaseId}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {records.length > 0 && (
        <>
          <ReviewToolbar />
          <ApprovalPanel />
        </>
      )}

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {(
          [
            { key: 'fy2526' as const, label: 'FY2526', icon: FileSpreadsheet, count: records.length },
            { key: '2526' as const, label: '2526', icon: Layers, count: lot2526Drafts.length },
          ]
        ).map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center gap-2 rounded-t-lg border border-b-0 px-4 py-2 text-sm font-medium transition-colors -mb-px',
              activeTab === key
                ? 'border-slate-200 bg-white text-brand-700 dark:border-slate-800 dark:bg-slate-950 dark:text-brand-500'
                : 'border-transparent text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/50'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {count > 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'fy2526' && (
        records.length > 0 ? (
          <>
            <ExcelChangePreview duplicateAction={modalAction} />
            <ExcelRowPreview onExpand={() => {
              const id = selectedRecordId || records[0]?.record_id;
              if (id) setFullViewRecordId(id);
            }} />
            <SpreadsheetReview onExpandRecord={setFullViewRecordId} />
            <FieldComparison />
          </>
        ) : (
          <Card>
            <CardContent className="py-16 text-center text-slate-500">
              <p>No records in review.</p>
              <p className="text-sm mt-2">Upload DN PDFs and run Extract & Validate to enter Review Mode.</p>
            </CardContent>
          </Card>
        )
      )}

      {activeTab === '2526' && (
        <>
          <Lot2526ReviewSection />
          <Lot2526CaseBrowser />
        </>
      )}

      {fullViewRecord?.record_id && (
        <RecordFullViewModal
          record={fullViewRecord}
          assignedCaseId={lastCaseId + 1 + fullViewIndex}
          activeWorksheet={activeWorksheet}
          onClose={() => setFullViewRecordId(null)}
        />
      )}

      {modalRecord && duplicateModalRecordId && (
        <DuplicateModal
          record={modalRecord}
          selectedAction={modalAction}
          onActionChange={setModalAction}
          onConfirm={() => confirmDuplicateAction(modalAction)}
          onClose={closeDuplicateModal}
          canForceInsert={can('force_insert')}
        />
      )}
    </div>
  );
}
