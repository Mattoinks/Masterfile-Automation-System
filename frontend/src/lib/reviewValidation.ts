import type { ExtractedRecord } from '@/api';
import { REQUIRED_REVIEW_FIELDS, type ReviewFieldKey } from './reviewFields';

export interface FieldValidationIssue {
  recordId: string;
  dnNumber: string;
  field: ReviewFieldKey;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: FieldValidationIssue[];
  byRecord: Record<string, FieldValidationIssue[]>;
}

export function validateRecordFields(
  record: ExtractedRecord,
  getValue: (record: ExtractedRecord, field: string) => string
): FieldValidationIssue[] {
  const issues: FieldValidationIssue[] = [];
  const id = record.record_id || '';

  for (const field of REQUIRED_REVIEW_FIELDS) {
    const val = getValue(record, field).trim();
    if (!val) {
      issues.push({
        recordId: id,
        dnNumber: getValue(record, 'dn_number') || record.filename,
        field,
        message: `${field.replace(/_/g, ' ')} is empty`,
      });
    }
  }

  const qty = getValue(record, 'quantity').replace(/,/g, '');
  if (qty && !/^\d+(\.\d+)?$/.test(qty)) {
    issues.push({
      recordId: id,
      dnNumber: getValue(record, 'dn_number'),
      field: 'quantity',
      message: 'Quantity must be numeric',
    });
  }

  const rework = getValue(record, 'rework_flow_procedure').trim();
  const engineer = getValue(record, 'cause_owner').trim();
  if (rework && !engineer) {
    issues.push({
      recordId: id,
      dnNumber: getValue(record, 'dn_number'),
      field: 'cause_owner',
      message: 'Engineer name is required when Rework Flow is filled',
    });
  }

  return issues;
}

export function validateAllRecords(
  records: ExtractedRecord[],
  getValue: (record: ExtractedRecord, field: string) => string
): ValidationResult {
  const issues: FieldValidationIssue[] = [];
  const byRecord: Record<string, FieldValidationIssue[]> = {};

  for (const record of records) {
    if (record.status === 'Invalid') continue;
    const recordIssues = validateRecordFields(record, getValue);
    issues.push(...recordIssues);
    if (record.record_id) byRecord[record.record_id] = recordIssues;
  }

  return { valid: issues.length === 0, issues, byRecord };
}
