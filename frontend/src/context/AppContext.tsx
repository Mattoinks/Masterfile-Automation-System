import {
  downloadMasterfile,
  fetchLockStatus,
  fetchLogs,
  fetchMasterfileMeta,
  fetchStats,
  fetchWorksheetConfig,
  processPdfs,
  fetchProcessStatus,
  type ProcessProgress,
  saveToMasterfile,
  uploadPdfs,
  removeUploadedFile as removeUploadedFileApi,
  clearUploads as clearUploadsApi,
  removeReviewRecords as removeReviewRecordsApi,
  type DuplicateAction,
  type ExtractedRecord,
  type LockStatus,
  type LogEntry,
  type Lot2526BreakdownRecord,
  type SaveResponse,
  type Stats,
} from '@/api';
import { useAuth } from '@/context/AuthContext';
import { validateAllRecords, type ValidationResult } from '@/lib/reviewValidation';
import type { ReviewStatusType } from '@/lib/reviewFields';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const DRAFT_STORAGE_KEY = 'rma-review-draft';

export interface UploadedFileInfo {
  name: string;
  size: number;
}

export interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'error';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface ActiveCell {
  recordId: string;
  field: string;
}

interface AppContextValue {
  stats: Stats;
  logs: LogEntry[];
  records: ExtractedRecord[];
  uploadedFiles: UploadedFileInfo[];
  uploadProgress: number | null;
  isUploading: boolean;
  isProcessing: boolean;
  processingProgress: ProcessProgress | null;
  isSaving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
  recordEdits: Record<string, Record<string, string>>;
  duplicateActions: Record<string, DuplicateAction>;
  selectedRecordId: string | null;
  selectedRowIds: Record<string, boolean>;
  activeCell: ActiveCell | null;
  lastSaveResult: SaveResponse | null;
  activeWorksheet: string;
  lastCaseId: number;
  reviewMode: boolean;
  notifications: AppNotification[];
  validationResult: ValidationResult;
  reviewedCount: number;
  manuallyEditedCount: number;
  readyCount: number;
  pendingReviewCount: number;
  canUndo: boolean;
  canRedo: boolean;
  refreshDashboard: () => Promise<void>;
  handleFilesSelected: (files: File[]) => Promise<void>;
  removeUploadedFile: (filename: string) => Promise<void>;
  removeAllUploadedFiles: () => Promise<void>;
  removeReviewRecords: (recordIds: string[]) => Promise<void>;
  handleProcess: () => Promise<void>;
  handleSave: () => Promise<void>;
  setRecordEdits: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
  setDuplicateActions: React.Dispatch<React.SetStateAction<Record<string, DuplicateAction>>>;
  setSelectedRecordId: (id: string | null) => void;
  setActiveCell: (cell: ActiveCell | null) => void;
  toggleRowSelection: (id: string) => void;
  toggleAllRows: () => void;
  clearMessage: () => void;
  clearNotifications: () => void;
  getRecordField: (record: ExtractedRecord, field: string) => string;
  getFieldSource: (record: ExtractedRecord, field: string) => string;
  getPdfValue: (record: ExtractedRecord, field: string) => string;
  getSuggestedValue: (record: ExtractedRecord, field: string) => string;
  getReviewStatus: (record: ExtractedRecord) => ReviewStatusType;
  setFieldValue: (recordId: string, field: string, value: string) => void;
  undo: () => void;
  redo: () => void;
  resetToSuggested: () => void;
  bulkApplyField: (field: string, value: string) => void;
  saveDraft: () => void;
  duplicateModalRecordId: string | null;
  openDuplicateModal: (recordId: string) => void;
  closeDuplicateModal: () => void;
  confirmDuplicateAction: (action: DuplicateAction) => void;
  lockStatus: LockStatus | null;
  exactDuplicateCount: number;
  possibleDuplicateCount: number;
  lot2526Drafts: Lot2526BreakdownRecord[];
  updateLot2526Draft: (index: number, field: keyof Lot2526BreakdownRecord, value: string) => void;
}

const defaultStats: Stats = {
  total_records: 0,
  todays_uploads: 0,
  duplicates_found: 0,
  successful_inserts: 0,
};

const emptyValidation: ValidationResult = { valid: true, issues: [], byRecord: {} };

const AppContext = createContext<AppContextValue | null>(null);

function makeNotification(type: AppNotification['type'], title: string, message: string): AppNotification {
  return {
    id: `${Date.now()}-${Math.random()}`,
    type,
    title,
    message,
    read: false,
    createdAt: new Date().toISOString(),
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { isReadOnly, user, isAuthenticated } = useAuth();
  const [stats, setStats] = useState<Stats>(defaultStats);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [records, setRecords] = useState<ExtractedRecord[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFileInfo[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<ProcessProgress | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [recordEdits, setRecordEdits] = useState<Record<string, Record<string, string>>>({});
  const [editHistory, setEditHistory] = useState<Record<string, Record<string, string>>[]>([{}]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [duplicateActions, setDuplicateActions] = useState<Record<string, DuplicateAction>>({});
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Record<string, boolean>>({});
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const [lastSaveResult, setLastSaveResult] = useState<SaveResponse | null>(null);
  const [activeWorksheet, setActiveWorksheet] = useState('FY2526');
  const [lastCaseId, setLastCaseId] = useState(0);
  const [reviewMode, setReviewMode] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [duplicateModalRecordId, setDuplicateModalRecordId] = useState<string | null>(null);
  const [lockStatus, setLockStatus] = useState<LockStatus | null>(null);
  const [exactDuplicateCount, setExactDuplicateCount] = useState(0);
  const [possibleDuplicateCount, setPossibleDuplicateCount] = useState(0);
  const [lot2526Drafts, setLot2526Drafts] = useState<Lot2526BreakdownRecord[]>([]);

  const pushNotification = useCallback((n: AppNotification) => {
    setNotifications((prev) => [n, ...prev].slice(0, 20));
  }, []);

  const refreshDashboard = useCallback(async () => {
    try {
      const [newStats, newLogs, wsConfig, masterRows, lock] = await Promise.all([
        fetchStats(),
        fetchLogs(200),
        fetchWorksheetConfig(),
        fetchMasterfileMeta(),
        fetchLockStatus(),
      ]);
      setStats(newStats);
      setLogs(newLogs);
      setActiveWorksheet((wsConfig.active_worksheet as string) || 'FY2526');
      setLastCaseId(masterRows.last_case_id || 0);
      setLockStatus(lock);
    } catch {
      /* backend offline */
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshDashboard();
    const draft = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        if (parsed.records?.length) {
          setRecords(parsed.records);
          setRecordEdits(parsed.recordEdits || {});
          setDuplicateActions(parsed.duplicateActions || {});
          setUploadedFiles(parsed.uploadedFiles || []);
          setLot2526Drafts(parsed.lot2526Drafts || []);
          setReviewMode(true);
          pushNotification(makeNotification('info', 'Draft restored', 'Incomplete review loaded from last session.'));
        }
      } catch {
        /* ignore */
      }
    }
  }, [isAuthenticated, refreshDashboard, pushNotification]);

  // Auto-save draft every 30 seconds when in review mode
  useEffect(() => {
    if (!reviewMode || !records.length) return;
    const interval = setInterval(() => {
      localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          records,
          recordEdits,
          duplicateActions,
          uploadedFiles,
          lot2526Drafts,
          savedAt: new Date().toISOString(),
        })
      );
    }, 30000);
    return () => clearInterval(interval);
  }, [reviewMode, records, recordEdits, duplicateActions, uploadedFiles, lot2526Drafts]);

  const openDuplicateModal = useCallback((recordId: string) => {
    setDuplicateModalRecordId(recordId);
  }, []);

  const closeDuplicateModal = useCallback(() => {
    setDuplicateModalRecordId(null);
  }, []);

  const confirmDuplicateAction = useCallback((action: DuplicateAction) => {
    if (!duplicateModalRecordId) return;
    setDuplicateActions((prev) => ({ ...prev, [duplicateModalRecordId]: action }));
    if (action === 'edit_existing') {
      setSelectedRecordId(duplicateModalRecordId);
    }
    setDuplicateModalRecordId(null);
    pushNotification(makeNotification('info', 'Duplicate resolved', `Action: ${action}`));
  }, [duplicateModalRecordId, pushNotification]);

  const getRecordField = useCallback(
    (record: ExtractedRecord, field: string) => {
      const id = record.record_id || '';
      if (recordEdits[id]?.[field] !== undefined) return recordEdits[id][field];
      const val = record[field as keyof ExtractedRecord];
      return val === undefined || val === null ? '' : String(val);
    },
    [recordEdits]
  );

  const getPdfValue = useCallback((record: ExtractedRecord, field: string) => {
    return record.pdf_values?.[field] || '';
  }, []);

  const getSuggestedValue = useCallback((record: ExtractedRecord, field: string) => {
    return record.suggested_values?.[field] || getRecordField(record, field);
  }, [getRecordField]);

  const getFieldSource = useCallback(
    (record: ExtractedRecord, field: string) => {
      const id = record.record_id || '';
      if (recordEdits[id]?.[field] !== undefined) return 'manual';
      return record.field_sources?.[field] || (getRecordField(record, field) ? 'default' : 'required');
    },
    [recordEdits, getRecordField]
  );

  const validationResult = useMemo(
    () => (records.length ? validateAllRecords(records, getRecordField) : emptyValidation),
    [records, getRecordField]
  );

  const getReviewStatus = useCallback(
    (record: ExtractedRecord): ReviewStatusType => {
      if (record.status === 'Inserted') return 'Inserted';
      const id = record.record_id || '';
      const issues = validationResult.byRecord[id] || [];
      const hasEdits = !!recordEdits[id] && Object.keys(recordEdits[id]).length > 0;
      if (issues.length > 0) return hasEdits ? 'Draft' : 'Pending Review';
      return 'Ready to Insert';
    },
    [validationResult, recordEdits]
  );

  const commitEdits = useCallback((next: Record<string, Record<string, string>>) => {
    setRecordEdits(next);
    setEditHistory((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      return [...trimmed, next];
    });
    setHistoryIndex((i) => i + 1);
  }, [historyIndex]);

  const setFieldValue = useCallback(
    (recordId: string, field: string, value: string) => {
      const next = {
        ...recordEdits,
        [recordId]: { ...recordEdits[recordId], [field]: value },
      };
      commitEdits(next);
    },
    [recordEdits, commitEdits],
  );

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setRecordEdits(editHistory[newIndex] || {});
  }, [historyIndex, editHistory]);

  const redo = useCallback(() => {
    if (historyIndex >= editHistory.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setRecordEdits(editHistory[newIndex] || {});
  }, [historyIndex, editHistory]);

  const resetToSuggested = useCallback(() => {
    commitEdits({});
    pushNotification(makeNotification('info', 'Reset', 'All fields restored to suggested values.'));
  }, [commitEdits, pushNotification]);

  const bulkApplyField = useCallback(
    (field: string, value: string) => {
      const targets = records.filter((r) => {
        if (!r.record_id) return false;
        const selected = Object.values(selectedRowIds).some(Boolean);
        return selected ? selectedRowIds[r.record_id] : true;
      });
      const next = { ...recordEdits };
      targets.forEach((r) => {
        if (r.record_id) {
          next[r.record_id] = { ...next[r.record_id], [field]: value };
        }
      });
      commitEdits(next);
    },
    [records, recordEdits, selectedRowIds, commitEdits]
  );

  const saveDraft = useCallback(() => {
    localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({
        records,
        recordEdits,
        duplicateActions,
        uploadedFiles,
        lot2526Drafts,
        savedAt: new Date().toISOString(),
      })
    );
    setMessage({ type: 'success', text: 'Draft saved. You can continue review later.' });
    pushNotification(makeNotification('success', 'Draft saved', `${records.length} record(s) saved locally.`));
  }, [records, recordEdits, duplicateActions, uploadedFiles, lot2526Drafts, pushNotification]);

  const toggleRowSelection = useCallback((id: string) => {
    setSelectedRowIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleAllRows = useCallback(() => {
    const allSelected = records.every((r) => r.record_id && selectedRowIds[r.record_id]);
    if (allSelected) {
      setSelectedRowIds({});
    } else {
      const next: Record<string, boolean> = {};
      records.forEach((r) => { if (r.record_id) next[r.record_id] = true; });
      setSelectedRowIds(next);
    }
  }, [records, selectedRowIds]);

  const clearNotifications = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const handleFilesSelected = async (files: File[]) => {
    if (isReadOnly) {
      setMessage({ type: 'error', text: 'Viewer role cannot upload files.' });
      return;
    }
    setIsUploading(true);
    setUploadProgress(0);
    setMessage(null);
    try {
      const result = await uploadPdfs(files, setUploadProgress);
      const infos = files
        .filter((f) => result.uploaded.includes(f.name))
        .map((f) => ({ name: f.name, size: f.size }));
      setUploadedFiles((prev) => {
        const names = new Set(prev.map((p) => p.name));
        return [...prev, ...infos.filter((i) => !names.has(i.name))];
      });
      setMessage({ type: 'success', text: `Uploaded ${result.count} file(s).` });
      pushNotification(makeNotification('success', 'Upload complete', `${result.count} PDF(s) ready for processing.`));
      await refreshDashboard();
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Upload failed';
      setMessage({ type: 'error', text });
      pushNotification(makeNotification('error', 'Upload failed', text));
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const purgeRecordIds = useCallback((removedIds: Set<string>, nextRecords: ExtractedRecord[]) => {
    if (!removedIds.size) return;
    setLot2526Drafts((drafts) => drafts.filter((d) => !d.record_id || !removedIds.has(d.record_id)));
    setRecordEdits((edits) => {
      const copy = { ...edits };
      removedIds.forEach((id) => delete copy[id]);
      return copy;
    });
    setDuplicateActions((actions) => {
      const copy = { ...actions };
      removedIds.forEach((id) => delete copy[id]);
      return copy;
    });
    setSelectedRowIds((rows) => {
      const copy = { ...rows };
      removedIds.forEach((id) => delete copy[id]);
      return copy;
    });
    if (selectedRecordId && removedIds.has(selectedRecordId)) {
      setSelectedRecordId(nextRecords[0]?.record_id ?? null);
    }
    if (duplicateModalRecordId && removedIds.has(duplicateModalRecordId)) {
      setDuplicateModalRecordId(null);
    }
    if (nextRecords.length === 0) {
      setReviewMode(false);
      setRecordEdits({});
      setDuplicateActions({});
      setSelectedRowIds({});
      setSelectedRecordId(null);
      setLot2526Drafts([]);
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, [selectedRecordId, duplicateModalRecordId]);

  const removeUploadedFile = useCallback(async (filename: string) => {
    if (isReadOnly) return;
    try {
      await removeUploadedFileApi(filename);
      setUploadedFiles((prev) => prev.filter((f) => f.name !== filename));
      setRecords((prev) => {
        const removedIds = new Set(
          prev.filter((r) => r.filename === filename).map((r) => r.record_id).filter(Boolean) as string[]
        );
        const next = prev.filter((r) => r.filename !== filename);
        purgeRecordIds(removedIds, next);
        return next;
      });
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Could not remove file';
      setMessage({ type: 'error', text });
    }
  }, [isReadOnly, purgeRecordIds]);

  const removeAllUploadedFiles = useCallback(async () => {
    if (isReadOnly || !uploadedFiles.length) return;
    try {
      await clearUploadsApi();
      const filenames = new Set(uploadedFiles.map((f) => f.name));
      setUploadedFiles([]);
      setRecords((prev) => {
        const removedIds = new Set(
          prev.filter((r) => filenames.has(r.filename)).map((r) => r.record_id).filter(Boolean) as string[]
        );
        const next = prev.filter((r) => !filenames.has(r.filename));
        purgeRecordIds(removedIds, next);
        return next;
      });
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Could not remove files';
      setMessage({ type: 'error', text });
    }
  }, [isReadOnly, uploadedFiles, purgeRecordIds]);

  const removeReviewRecords = useCallback(async (recordIds: string[]) => {
    if (isReadOnly || !recordIds.length) return;
    const label = recordIds.length === 1 ? 'this record' : `${recordIds.length} records`;
    if (!confirm(`Remove ${label} from review? This cannot be undone.`)) return;
    try {
      await removeReviewRecordsApi(recordIds);
      const idSet = new Set(recordIds);
      setRecords((prev) => {
        const next = prev.filter((r) => r.record_id && !idSet.has(r.record_id));
        purgeRecordIds(idSet, next);
        return next;
      });
      setMessage({ type: 'success', text: `Removed ${recordIds.length} record(s) from review.` });
      pushNotification(makeNotification('info', 'Record removed', `${recordIds.length} record(s) removed from review.`));
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Could not remove record(s)';
      setMessage({ type: 'error', text });
    }
  }, [isReadOnly, purgeRecordIds, pushNotification]);

  const handleProcess = async () => {
    if (uploadedFiles.length === 0) {
      setMessage({ type: 'error', text: 'Upload DN PDFs first.' });
      return;
    }
    setIsProcessing(true);
    setMessage(null);
    setProcessingProgress({
      active: true,
      total: uploadedFiles.length,
      completed: 0,
      percent: 0,
      stage: 'preparing',
      message: 'Starting extraction…',
      current_file: '',
    });

    const poll = window.setInterval(async () => {
      try {
        const status = await fetchProcessStatus();
        setProcessingProgress(status);
      } catch {
        /* ignore polling errors */
      }
    }, 400);

    try {
      const result = await processPdfs();
      setRecords(result.records);
      setLot2526Drafts(result.lot2526_drafts || []);
      setExactDuplicateCount(result.exact_duplicates);
      setPossibleDuplicateCount(result.possible_duplicates);
      setRecordEdits({});
      setEditHistory([{}]);
      setHistoryIndex(0);
      setReviewMode(true);
      const actions: Record<string, DuplicateAction> = {};
      const rowSel: Record<string, boolean> = {};
      result.records.forEach((r) => {
        if (r.record_id) {
          rowSel[r.record_id] = true;
          if (r.status === 'Duplicate' && r.duplicate_status === 'Possible Duplicate') {
            actions[r.record_id] = 'skip';
          }
        }
      });
      setDuplicateActions(actions);
      setSelectedRowIds(rowSel);
      if (result.records[0]?.record_id) setSelectedRecordId(result.records[0].record_id);

      const firstExact = result.records.find(
        (r) => r.duplicate_status === 'Exact Duplicate' && r.record_id
      );
      if (firstExact?.record_id) {
        setDuplicateModalRecordId(firstExact.record_id);
      }

      if (result.exact_duplicates > 0) {
        pushNotification(makeNotification('error', 'Exact duplicates found', `${result.exact_duplicates} exact duplicate(s) require review.`));
      }
      if (result.possible_duplicates > 0) {
        pushNotification(makeNotification('info', 'Possible duplicates', `${result.possible_duplicates} possible duplicate(s) detected.`));
      }
      if (result.valid > 0) {
        pushNotification(makeNotification('success', 'New records ready', `${result.valid} new record(s) ready to insert.`));
      }
      setMessage({
        type: 'success',
        text: `Review Mode: ${result.total} record(s) ready for verification.`,
      });
      pushNotification(makeNotification('info', 'Review Mode', 'Verify and edit fields before insertion.'));
      await refreshDashboard();
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Processing failed';
      setMessage({ type: 'error', text });
      pushNotification(makeNotification('error', 'Processing failed', text));
    } finally {
      window.clearInterval(poll);
      try {
        const finalStatus = await fetchProcessStatus();
        setProcessingProgress(finalStatus);
      } catch {
        setProcessingProgress(null);
      }
      setIsProcessing(false);
    }
  };

  const handleSave = async () => {
    if (isReadOnly) {
      setMessage({ type: 'error', text: 'Viewer role cannot insert records.' });
      return;
    }
    if (lockStatus?.read_only && lockStatus.user !== user?.username) {
      setMessage({ type: 'error', text: `Masterfile is being edited by ${lockStatus.user}. Read-only mode enabled.` });
      return;
    }

    const unresolvedDuplicates = records.filter(
      (r) => r.status === 'Duplicate' && r.record_id && !duplicateActions[r.record_id]
    );
    if (unresolvedDuplicates.length) {
      setDuplicateModalRecordId(unresolvedDuplicates[0].record_id!);
      setMessage({ type: 'error', text: 'Resolve all duplicate records before insertion.' });
      return;
    }

    if (!validationResult.valid) {
      setMessage({
        type: 'error',
        text: `${validationResult.issues.length} field(s) require attention before insertion.`,
      });
      pushNotification(makeNotification('error', 'Validation failed', 'Fix missing fields before inserting.'));
      return;
    }

    const saveable = records.filter(
      (r) => r.record_id && (r.status === 'New' || r.status === 'Duplicate')
    );
    if (!saveable.length) {
      setMessage({ type: 'error', text: 'No records ready to insert.' });
      return;
    }

    setIsSaving(true);
    setMessage(null);
    try {
      const payload = saveable.map((r) => ({
        record_id: r.record_id!,
        duplicate_action: duplicateActions[r.record_id!] || 'skip',
        overrides: recordEdits[r.record_id!] || {},
      }));
      const payloadIds = new Set(payload.map((p) => p.record_id));
      const matchedDrafts = lot2526Drafts
        .filter((d) => d.record_id && payloadIds.has(d.record_id))
        .map((d) => {
          const linkedRecord = records.find((r) => r.record_id === d.record_id);
          if (!linkedRecord) return d;
          // Test Bau and Disposition/SS Plan mirror the FY2526 record's
          // Test Bau / Rework Flow Procedure at save time, regardless of
          // whatever the draft itself was extracted with - the review UI
          // only ever shows these read-only from the FY2526 record, so
          // what's saved must match what was actually shown.
          return {
            ...d,
            test_bau: getRecordField(linkedRecord, 'test_bau'),
            disposition_or_ss_plan_name: getRecordField(linkedRecord, 'rework_flow_procedure'),
          };
        });
      const result = await saveToMasterfile(payload, matchedDrafts);
      setLastSaveResult(result);
      let text = `Inserted ${result.inserted}, skipped ${result.skipped}, replaced ${result.replaced}`;
      if (result.revised) text += `, revised ${result.revised}`;
      if (result.force_inserted) text += `, force inserted ${result.force_inserted}`;
      text += '.';
      if (result.lot2526_saved_case_numbers.length) {
        text += ` 2526 rows saved: ${result.lot2526_saved_case_numbers.length}.`;
      }
      if (result.backup_file) text += ` Backup: ${result.backup_file}.`;
      if (result.errors.length) text += ` Errors: ${result.errors.join('; ')}`;
      if (result.lot2526_errors.length) text += ` 2526 errors: ${result.lot2526_errors.join('; ')}`;
      const hasErrors = result.errors.length > 0 || result.lot2526_errors.length > 0;
      setMessage({ type: hasErrors ? 'error' : 'success', text });
      pushNotification(makeNotification(hasErrors ? 'error' : 'success', 'Insertion complete', text));
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      setRecords([]);
      setRecordEdits({});
      setReviewMode(false);
      setUploadedFiles([]);
      setSelectedRecordId(null);
      setLot2526Drafts([]);
      await refreshDashboard();
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Save failed';
      setMessage({ type: 'error', text });
      pushNotification(makeNotification('error', 'Save failed', text));
    } finally {
      setIsSaving(false);
    }
  };

  const updateLot2526Draft = useCallback(
    (index: number, field: keyof Lot2526BreakdownRecord, value: string) => {
      setLot2526Drafts((prev) =>
        prev.map((d, i) => (i === index ? { ...d, [field]: value } : d))
      );
    },
    []
  );

  const manuallyEditedCount = useMemo(
    () => records.filter((r) => r.record_id && recordEdits[r.record_id] && Object.keys(recordEdits[r.record_id]).length > 0).length,
    [records, recordEdits]
  );

  const reviewedCount = useMemo(
    () => records.filter((r) => getReviewStatus(r) === 'Ready to Insert' || getReviewStatus(r) === 'Draft').length,
    [records, getReviewStatus]
  );

  const readyCount = useMemo(
    () => records.filter((r) => r.status === 'New' || r.status === 'Duplicate').length,
    [records]
  );

  const pendingReviewCount = useMemo(
    () => records.filter((r) => getReviewStatus(r) === 'Pending Review').length,
    [records, getReviewStatus]
  );

  const value: AppContextValue = {
    stats,
    logs,
    records,
    uploadedFiles,
    uploadProgress,
    isUploading,
    isProcessing,
    processingProgress,
    isSaving,
    message,
    recordEdits,
    duplicateActions,
    selectedRecordId,
    selectedRowIds,
    activeCell,
    lastSaveResult,
    activeWorksheet,
    lastCaseId,
    reviewMode,
    notifications,
    validationResult,
    reviewedCount,
    manuallyEditedCount,
    readyCount,
    pendingReviewCount,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < editHistory.length - 1,
    refreshDashboard,
    handleFilesSelected,
    removeUploadedFile,
    removeAllUploadedFiles,
    removeReviewRecords,
    handleProcess,
    handleSave,
    setRecordEdits,
    setDuplicateActions,
    setSelectedRecordId,
    setActiveCell,
    toggleRowSelection,
    toggleAllRows,
    clearMessage: () => setMessage(null),
    clearNotifications,
    getRecordField,
    getFieldSource,
    getPdfValue,
    getSuggestedValue,
    getReviewStatus,
    setFieldValue,
    undo,
    redo,
    resetToSuggested,
    bulkApplyField,
    saveDraft,
    duplicateModalRecordId,
    openDuplicateModal,
    closeDuplicateModal,
    confirmDuplicateAction,
    lockStatus,
    exactDuplicateCount,
    possibleDuplicateCount,
    lot2526Drafts,
    updateLot2526Draft,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export { downloadMasterfile };
