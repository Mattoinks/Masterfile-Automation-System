export const REVIEW_FIELDS = [
  { key: 'dn_number', label: 'DN Number', width: 120 },
  { key: 'device', label: 'Device', width: 160 },
  { key: 'package', label: 'Package', width: 140 },
  { key: 'quantity', label: 'Qty', width: 80 },
  { key: 'owner', label: 'Owner', width: 100 },
  { key: 'gf', label: 'GF', width: 60 },
  { key: 'type_of_return', label: 'Type', width: 80, dropdown: true },
  { key: 'dc', label: 'DC', width: 70 },
  { key: 'store_received', label: 'STORE Received', width: 120 },
  { key: 'recd_mth', label: 'Recd Mth', width: 90 },
  { key: 'recd_lw', label: 'Recd LW', width: 80 },
  { key: 'date_code', label: 'Date Code', width: 160 },
  { key: 'dc_bau', label: 'DC Bau', width: 140 },
  { key: 'test_bau', label: 'Test Bau', width: 140 },
  { key: 'case_title', label: 'Case Title', width: 200 },
  { key: 'rework_flow_procedure', label: 'Rework Flow', width: 160 },
  { key: 'cause_owner', label: 'Engineer', width: 120, linkedTo: 'rework_flow_procedure' },
  { key: 'rma_number', label: 'RMA', width: 130 },
] as const;

export type ReviewFieldKey = (typeof REVIEW_FIELDS)[number]['key'];

export const REQUIRED_REVIEW_FIELDS: ReviewFieldKey[] = [
  'dn_number',
  'device',
  'quantity',
  'owner',
  'case_title',
];

export const DROPDOWN_OPTIONS: Record<string, string[]> = {
  type_of_return: ['SAP', 'Jira', 'Manual'],
};

export type ReviewStatusType = 'Draft' | 'Pending Review' | 'Ready to Insert' | 'Inserted';

export type FieldDisplaySource = 'pdf' | 'suggested' | 'manual' | 'missing';

export function resolveFieldSource(
  field: string,
  record: { field_sources?: Record<string, string>; pdf_values?: Record<string, string> },
  hasEdit: boolean,
  finalValue: string
): FieldDisplaySource {
  if (!finalValue.trim()) return 'missing';
  if (hasEdit) return 'manual';
  if (record.field_sources?.[field] === 'pdf' || record.pdf_values?.[field]) return 'pdf';
  return 'suggested';
}

export const SOURCE_STYLES: Record<FieldDisplaySource, string> = {
  pdf: 'bg-emerald-50 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-700',
  suggested: 'bg-blue-50 border-blue-300 dark:bg-blue-950/40 dark:border-blue-700',
  manual: 'bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:border-amber-700',
  missing: 'bg-red-50 border-red-300 dark:bg-red-950/40 dark:border-red-700',
};

export const SOURCE_LABELS: Record<FieldDisplaySource, string> = {
  pdf: 'Extracted from PDF',
  suggested: 'Auto-filled',
  manual: 'Edited by User',
  missing: 'Missing value',
};
