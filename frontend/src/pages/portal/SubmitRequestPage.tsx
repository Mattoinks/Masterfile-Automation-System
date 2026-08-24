import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { submitRequest } from '@/api';
import { REQUEST_FORM_FIELDS } from '@/lib/requestFormFields';

export function SubmitRequestPage() {
  const { userName } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<string, string>>({ priority: 'Normal' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);

  const setField = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const missing = REQUEST_FORM_FIELDS.filter((f) => f.required && !(values[f.key] || '').trim());
    if (missing.length) {
      setError(`Please fill in: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }

    setSubmitting(true);
    try {
      const record = await submitRequest(values);
      setSubmittedCode(record.request_code);
      setValues({ priority: 'Normal' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedCode) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <div>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">Request submitted</p>
            <p className="text-sm text-slate-500">
              Your request <span className="font-mono font-semibold">{submittedCode}</span> has been sent to the team.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setSubmittedCode(null)}>
              Submit another
            </Button>
            <Button onClick={() => navigate('/portal/my-requests')}>View My Requests</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submit RMA Request</CardTitle>
        <CardDescription>Fill in the details below and the team will be notified.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500">Requested by</label>
            <Input value={userName} disabled />
          </div>

          {REQUEST_FORM_FIELDS.map((field) => (
            <div key={field.key} className="space-y-1">
              <label className="text-xs font-medium text-slate-500">
                {field.label}
                {field.required && <span className="text-red-500"> *</span>}
              </label>
              {field.type === 'textarea' ? (
                <Textarea
                  value={values[field.key] || ''}
                  onChange={(e) => setField(field.key, e.target.value)}
                />
              ) : field.type === 'select' ? (
                <select
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 dark:border-slate-700 dark:bg-slate-900 dark:ring-offset-slate-950"
                  value={values[field.key] || ''}
                  onChange={(e) => setField(field.key, e.target.value)}
                >
                  {(field.options || []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <Input
                  type={field.type === 'date' ? 'date' : 'text'}
                  value={values[field.key] || ''}
                  onChange={(e) => setField(field.key, e.target.value)}
                />
              )}
            </div>
          ))}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </p>
          )}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
