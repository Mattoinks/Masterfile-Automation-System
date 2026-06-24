import { useState } from 'react';
import { updateMasterfileRecord, type IndexedRecord } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { useAuth } from '@/context/AuthContext';

const EDITABLE = ['owner', 'quantity', 'device', 'package', 'case_title', 'gf', 'dc', 'date_code', 'rework_flow_procedure', 'cause_owner'];

const FIELD_LABELS: Record<string, string> = {
  rework_flow_procedure: 'Rework Flow',
  cause_owner: 'Engineer (who entered Rework Flow)',
};

interface RecordEditModalProps {
  record: IndexedRecord;
  onClose: () => void;
  onSaved: () => void;
}

export function RecordEditModal({ record, onClose, onSaved }: RecordEditModalProps) {
  const { userName } = useAuth();
  const [fields, setFields] = useState<Record<string, string>>(() => {
    const src = record.fields || record;
    const init: Record<string, string> = {};
    EDITABLE.forEach((k) => { init[k] = String(src[k as keyof typeof src] ?? ''); });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const showEngineer = Boolean(fields.rework_flow_procedure?.trim());

  const updateField = (key: string, value: string) => {
    setFields((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'rework_flow_procedure' && value.trim() && !next.cause_owner?.trim()) {
        next.cause_owner = userName;
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMasterfileRecord(record.case_id, fields);
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-2xl border p-6">
        <h2 className="text-lg font-bold">Edit Case {record.case_id}</h2>
        <p className="text-sm text-slate-500 mb-4">Changes save immediately to masterfile</p>
        <div className="space-y-3">
          {EDITABLE.map((key) => {
            if (key === 'cause_owner' && !showEngineer) return null;
            return (
            <div key={key}>
              <label className="text-xs text-slate-500">{FIELD_LABELS[key] || key.replace(/_/g, ' ')}</label>
              <Input
                value={fields[key] || ''}
                onChange={(e) => updateField(key, e.target.value)}
                placeholder={key === 'cause_owner' ? 'Engineer name' : undefined}
                className="mt-1"
              />
            </div>
            );
          })}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>
    </div>
  );
}
