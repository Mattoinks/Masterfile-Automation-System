export type RecordStatus =
  | 'New'
  | 'Duplicate'
  | 'Invalid'
  | 'Inserted'
  | 'Skipped'
  | 'Replaced'
  | 'Revision'
  | 'Force Inserted';

export type DuplicateStatusType = 'New' | 'Possible Duplicate' | 'Exact Duplicate';

export type DuplicateAction =
  | 'skip'
  | 'replace'
  | 'revision'
  | 'edit_existing'
  | 'force_insert';

export type UserRole = 'admin' | 'engineer' | 'viewer';

export interface ExistingMasterRecord {
  case_id: string;
  row_number: number;
  dn_number: string;
  rma_number: string;
  device: string;
  package: string;
  quantity: string;
  owner: string;
  date_code: string;
  store_received: string;
  case_title: string;
  type_of_return: string;
  gf: string;
  dc: string;
}

export interface DuplicateMatchInfo {
  duplicate_status: DuplicateStatusType;
  confidence_score: number;
  match_reasons: string[];
  existing_record: ExistingMasterRecord | null;
  matched_fields: string[];
  field_differences: Record<string, { existing: string; new: string }>;
}

export interface ExtractedRecord {
  filename: string;
  dn_number: string;
  dn_date: string;
  customer_name: string;
  device: string;
  package: string;
  quantity: string;
  lot_number: string;
  material_number: string;
  rma_number: string;
  plant_code: string;
  store_received: string;
  recd_lw: string;
  recd_mth: string;
  type_of_return: string;
  gf: string;
  date_code: string;
  dc_bau: string;
  test_bau: string;
  vkl_bau: string;
  dc: string;
  owner: string;
  rework_flow_procedure: string;
  cause_owner: string;
  case_title: string;
  store_lot_qty: string;
  data_source: string;
  matched_historical_dn: string;
  matched_historical_case_id: string;
  field_sources: Record<string, string>;
  pdf_values: Record<string, string>;
  suggested_values: Record<string, string>;
  field_diagnostics?: Record<string, FieldDiagnostic>;
  review_status?: string;
  status: RecordStatus;
  duplicate_status?: DuplicateStatusType;
  duplicate_match?: DuplicateMatchInfo | null;
  validation_errors: string[];
  duplicate_action?: DuplicateAction | null;
  record_id?: string | null;
}

export interface FieldDiagnostic {
  field: string;
  value: string;
  status: 'found' | 'missing' | 'suggested';
  confidence: number;
  source: string;
  reason: string;
  failure_category: string;
  attempted_labels: string[];
  labels_found: { label: string; page: number; line: number; value_after_label: string }[];
  found_on_page: number | null;
  historical_match: {
    value: string;
    confidence: number;
    case_id: string;
    dn_number: string;
    match_reason: string;
  } | null;
  suggested_value: string;
  suggestion_source: string;
  alternative_method: string;
}

export interface PdfAnalysisReport {
  filename: string;
  dn_number: string;
  page_count: number;
  extraction_method: string;
  field_sources: Record<string, string>;
  fields: FieldDiagnostic[];
  log_path: string;
  errors: string[];
}

export interface AnalysisRunResult {
  analyzed_at: string;
  directory: string;
  total_pdfs: number;
  reports: PdfAnalysisReport[];
  comparison: {
    common_labels: Record<string, string[]>;
    layout_variants: string[];
    missing_sections: string[];
    per_dn_summary: Record<string, Record<string, number>>;
  };
  summary: {
    total_pdfs: number;
    total_field_checks: number;
    missing_fields: number;
    low_confidence_fields: number;
    dns_analyzed: string[];
  };
}

export interface ProcessResponse {
  records: ExtractedRecord[];
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  exact_duplicates: number;
  possible_duplicates: number;
}

export interface Stats {
  total_records: number;
  todays_uploads: number;
  duplicates_found: number;
  successful_inserts: number;
}

export interface Analytics {
  total_cases: number;
  monthly_returns: Record<string, number>;
  top_devices: { device: string; count: number }[];
  duplicate_rate: number;
  common_failures: { issue: string; count: number }[];
  cases_per_owner: { owner: string; count: number }[];
}

export interface SaveResponse {
  inserted: number;
  skipped: number;
  replaced: number;
  revised: number;
  force_inserted: number;
  errors: string[];
  backup_file: string | null;
}

export interface LogEntry {
  timestamp: string;
  filename: string;
  dn_number: string;
  action: string;
  status: string;
  user: string;
  details: string;
}

export interface DuplicateHistoryEntry {
  date: string;
  case_id: string;
  dn_number: string;
  action: string;
  user: string;
  field_changes: Record<string, { existing: string; new: string }>;
}

export interface LockStatus {
  locked: boolean;
  user: string | null;
  since: string | null;
  read_only: boolean;
}

export interface SavePreview {
  before: Record<string, string> | null;
  after: Record<string, string>;
  differences: Record<string, { existing: string; new: string }>;
}

export interface BackupInfo {
  filename: string;
  path: string;
  size_bytes: string;
  created_at: string;
}

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const SESSION_KEY = 'rma-session-token';
const REMEMBER_KEY = 'rma-remember-me';

let sessionToken: string | null = localStorage.getItem(SESSION_KEY);

export interface AuthUser {
  id: number;
  username: string;
  display_name: string;
  role: UserRole;
  active: boolean;
  last_login?: string | null;
}

export function getSessionToken(): string | null {
  return sessionToken || localStorage.getItem(SESSION_KEY);
}

export function setSessionToken(token: string | null) {
  sessionToken = token;
  if (token) localStorage.setItem(SESSION_KEY, token);
  else localStorage.removeItem(SESSION_KEY);
}

function authHeaders(extra: HeadersInit = {}): HeadersInit {
  const token = getSessionToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function formatApiError(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg);
        }
        return null;
      })
      .filter(Boolean);
    if (parts.length) return parts.join('; ');
  }
  return fallback;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    setSessionToken(null);
    window.dispatchEvent(new Event('auth:logout'));
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(formatApiError(error.detail, 'Request failed'));
  }
  return response.json();
}

export async function login(
  username: string,
  password: string,
  rememberMe = false
): Promise<{ token: string; user: AuthUser }> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, remember_me: rememberMe }),
  });
  const data = await handleResponse<{ token: string; user: AuthUser }>(response);
  setSessionToken(data.token);
  if (rememberMe) localStorage.setItem(REMEMBER_KEY, '1');
  else localStorage.removeItem(REMEMBER_KEY);
  return data;
}

export async function logoutApi(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: authHeaders() });
  } finally {
    setSessionToken(null);
  }
}

export async function fetchMe(): Promise<{ user: AuthUser; permissions: string[] }> {
  const response = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function refreshSession(): Promise<string | null> {
  const response = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', headers: authHeaders() });
  if (!response.ok) return null;
  const data = await response.json();
  if (data.token) setSessionToken(data.token);
  return data.token;
}

export async function fetchUsers(): Promise<{ users: AuthUser[] }> {
  const response = await fetch(`${API_BASE}/auth/users`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function createUser(payload: {
  username: string;
  password: string;
  display_name: string;
  role: UserRole;
}) {
  const response = await fetch(`${API_BASE}/auth/users`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleResponse<AuthUser>(response);
}

export async function updateUser(userId: number, payload: Partial<{
  display_name: string;
  role: UserRole;
  active: boolean;
  password: string;
}>) {
  const response = await fetch(`${API_BASE}/auth/users/${userId}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return handleResponse<AuthUser>(response);
}

export async function fetchStats(): Promise<Stats> {
  const response = await fetch(`${API_BASE}/stats`, { headers: authHeaders() });
  return handleResponse<Stats>(response);
}

export async function fetchAnalytics(): Promise<Analytics> {
  const response = await fetch(`${API_BASE}/analytics`, { headers: authHeaders() });
  return handleResponse<Analytics>(response);
}

export async function fetchLogs(limit = 50): Promise<LogEntry[]> {
  const response = await fetch(`${API_BASE}/logs?limit=${limit}`, { headers: authHeaders() });
  return handleResponse<LogEntry[]>(response);
}

export async function fetchDuplicateHistory(limit = 50): Promise<DuplicateHistoryEntry[]> {
  const response = await fetch(`${API_BASE}/duplicate-history?limit=${limit}`, { headers: authHeaders() });
  return handleResponse<DuplicateHistoryEntry[]>(response);
}

export async function fetchLockStatus(): Promise<LockStatus> {
  const response = await fetch(`${API_BASE}/lock-status`, { headers: authHeaders() });
  return handleResponse<LockStatus>(response);
}

export async function fetchWorksheetConfig(): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/config/worksheet`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function fetchBusinessRules(): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/config/business-rules`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function fetchReferenceLookups(): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE}/config/reference-lookups`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function fetchMasterfileMeta(): Promise<{ last_case_id: number }> {
  const response = await fetch(`${API_BASE}/masterfile/rows?limit=1`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function fetchMasterfileRows(
  search = '',
  limit = 200,
): Promise<{
  worksheet: string;
  headers: { col: number; label: string }[];
  rows: Record<string, unknown>[];
  total: number;
  last_case_id: number;
}> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (search.trim()) params.set('search', search.trim());
  const response = await fetch(`${API_BASE}/masterfile/rows?${params}`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function fetchBackups(): Promise<{ backups: BackupInfo[] }> {
  const response = await fetch(`${API_BASE}/backups`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function restoreBackup(filename: string): Promise<void> {
  const response = await fetch(`${API_BASE}/backups/restore?filename=${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: authHeaders(),
  });
  await handleResponse(response);
}

export async function resetMasterfile(): Promise<{ removed_rows: number; backup_file: string | null }> {
  const response = await fetch(`${API_BASE}/masterfile/reset`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function advancedSearch(params: {
  case_id?: string;
  dn_number?: string;
  device?: string;
  owner?: string;
  package?: string;
  sap_number?: string;
  limit?: number;
}): Promise<{ results: Record<string, unknown>[]; total: number }> {
  const response = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(params),
  });
  return handleResponse(response);
}

export async function previewSave(
  recordId: string,
  duplicateAction: DuplicateAction,
  overrides: Record<string, string> = {}
): Promise<SavePreview> {
  const response = await fetch(`${API_BASE}/save/preview`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ record_id: recordId, duplicate_action: duplicateAction, overrides }),
  });
  return handleResponse<SavePreview>(response);
}

export async function uploadPdfs(
  files: File[],
  onProgress?: (percent: number) => void
): Promise<{ uploaded: string[]; count: number }> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  const token = getSessionToken();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/upload`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.detail || 'Upload failed'));
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
}

export async function removeUploadedFile(filename: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/uploads/${encodeURIComponent(filename)}`,
    { method: 'DELETE', headers: authHeaders() }
  );
  await handleResponse(response);
}

export interface ProcessProgress {
  active: boolean;
  total: number;
  completed: number;
  percent: number;
  stage: string;
  message: string;
  current_file: string;
}

export async function fetchProcessStatus(): Promise<ProcessProgress> {
  const response = await fetch(`${API_BASE}/process/status`, { headers: authHeaders() });
  return handleResponse<ProcessProgress>(response);
}

export async function processPdfs(): Promise<ProcessResponse> {
  const response = await fetch(`${API_BASE}/process`, { method: 'POST', headers: authHeaders() });
  return handleResponse<ProcessResponse>(response);
}

export async function removeReviewRecords(recordIds: string[]): Promise<{ removed: number; record_ids: string[] }> {
  const response = await fetch(`${API_BASE}/process/records/remove`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ record_ids: recordIds }),
  });
  return handleResponse(response);
}

export async function saveToMasterfile(
  records: { record_id: string; duplicate_action: DuplicateAction; overrides?: Record<string, string> }[]
): Promise<SaveResponse> {
  const response = await fetch(`${API_BASE}/save`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ records }),
  });
  return handleResponse<SaveResponse>(response);
}

export async function downloadMasterfile(): Promise<void> {
  const response = await fetch(`${API_BASE}/download`, { headers: authHeaders() });
  if (!response.ok) throw new Error('Download failed');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'RMA_MASTER.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

export interface IndexedRecord {
  case_id: string;
  dn_number: string;
  rma_number: string;
  device: string;
  package: string;
  owner: string;
  quantity: string;
  status: string;
  updated_at?: string;
  fields?: Record<string, string>;
}

export async function fastSearch(query: string, limit = 50): Promise<{ results: IndexedRecord[]; total: number }> {
  const response = await fetch(`${API_BASE}/search/fast`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ query, limit }),
  });
  return handleResponse(response);
}

export async function softDeleteRecords(caseIds: string[]) {
  const response = await fetch(`${API_BASE}/records/delete`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ case_ids: caseIds }),
  });
  return handleResponse<{ deleted: string[]; errors: string[]; backup_file: string | null }>(response);
}

export async function permanentDeleteRecords(caseIds: string[]) {
  const response = await fetch(`${API_BASE}/records/permanent-delete`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ case_ids: caseIds }),
  });
  return handleResponse<{ removed: string[]; errors: string[] }>(response);
}

export async function restoreRecords(caseIds: string[]) {
  const response = await fetch(`${API_BASE}/records/restore`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ case_ids: caseIds }),
  });
  return handleResponse<{ restored: string[]; errors: string[] }>(response);
}

export async function getRecycleBin(): Promise<{ records: IndexedRecord[] }> {
  const response = await fetch(`${API_BASE}/recycle-bin`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function updateMasterfileRecord(caseId: string, fields: Record<string, string>) {
  const response = await fetch(`${API_BASE}/records/${encodeURIComponent(caseId)}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fields }),
  });
  return handleResponse(response);
}

export async function listAnalyzeSamples(): Promise<{ pdfs: string[]; directory: string }> {
  const response = await fetch(`${API_BASE}/analyze/samples`, { headers: authHeaders() });
  return handleResponse(response);
}

export async function runPdfAnalysis(): Promise<AnalysisRunResult> {
  const response = await fetch(`${API_BASE}/analyze/run`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse<AnalysisRunResult>(response);
}

export async function analyzeSinglePdf(filename: string): Promise<PdfAnalysisReport> {
  const response = await fetch(
    `${API_BASE}/analyze/pdf?filename=${encodeURIComponent(filename)}`,
    { method: 'POST', headers: authHeaders() }
  );
  return handleResponse<PdfAnalysisReport>(response);
}

export async function fetchExtractionLog(dnNumber: string): Promise<{ dn_number: string; log: string }> {
  const response = await fetch(`${API_BASE}/analyze/logs/${encodeURIComponent(dnNumber)}`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export const DUPLICATE_ACTION_LABELS: Record<DuplicateAction, string> = {
  skip: 'Skip Upload',
  replace: 'Replace Existing Record',
  revision: 'Create New Revision',
  edit_existing: 'Edit Existing Record',
  force_insert: 'Force Insert New Record',
};

export const DUPLICATE_STATUS_COLORS: Record<DuplicateStatusType, string> = {
  New: 'text-emerald-600 bg-emerald-50',
  'Possible Duplicate': 'text-amber-600 bg-amber-50',
  'Exact Duplicate': 'text-red-600 bg-red-50',
};
