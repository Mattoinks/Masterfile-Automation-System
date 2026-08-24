// Frontend mirror of backend/app/models/request_schemas.py's REQUEST_FIELDS.
// Provisional field list -- when the reference Excel arrives, this array and
// its backend counterpart are the only two files that need editing.

export interface RequestFieldConfig {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select';
  required: boolean;
  options?: string[];
}

export const REQUEST_FORM_FIELDS: RequestFieldConfig[] = [
  { key: 'customer_name', label: 'Name of Customer', type: 'text', required: true },
  { key: 'priority', label: 'Priority', type: 'select', required: true, options: ['Normal', 'High', 'Critical'] },
  { key: 'problem_description', label: 'Problem Description', type: 'textarea', required: true },
  { key: 'lot_qty', label: 'How many lots / qty', type: 'text', required: true },
  { key: 'test_flow', label: 'Recommended Rework Flow', type: 'text', required: true },
  { key: 'date_of_return', label: 'Date of Return', type: 'date', required: true },
  { key: 'expected_finish_date', label: 'Expected Finish Date', type: 'date', required: true },
];
