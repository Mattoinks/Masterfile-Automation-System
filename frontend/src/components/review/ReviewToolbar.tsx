import { Undo2, Redo2, RotateCcw, Save, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useApp } from '@/context/AppContext';
import { useState } from 'react';
export function ReviewToolbar() {
  const {
    canUndo,
    canRedo,
    undo,
    redo,
    resetToSuggested,
    saveDraft,
    bulkApplyField,
    selectedRowIds,
    records,
  } = useApp();

  const [bulkOwner, setBulkOwner] = useState('');
  const selectedCount = Object.values(selectedRowIds).filter(Boolean).length;

  return (
    <Card>
      <CardContent className="p-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={undo} disabled={!canUndo}>
            <Undo2 className="h-4 w-4" /> Undo
          </Button>
          <Button variant="outline" size="sm" onClick={redo} disabled={!canRedo}>
            <Redo2 className="h-4 w-4" /> Redo
          </Button>
          <Button variant="outline" size="sm" onClick={resetToSuggested}>
            <RotateCcw className="h-4 w-4" /> Reset to Suggested
          </Button>
        </div>

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

        <div className="flex items-center gap-2 flex-wrap">
          <Users className="h-4 w-4 text-slate-500" />
          <span className="text-xs text-slate-500">Bulk Owner ({selectedCount || records.length} rows):</span>
          <input
            type="text"
            value={bulkOwner}
            onChange={(e) => setBulkOwner(e.target.value)}
            placeholder="Owner name"
            className="h-8 w-32 rounded-lg border px-2 text-xs dark:bg-slate-900 dark:border-slate-700"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => bulkApplyField('owner', bulkOwner)}
            disabled={!records.length || !bulkOwner.trim()}
          >
            Apply
          </Button>
        </div>

        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={saveDraft}>
            <Save className="h-4 w-4" /> Save Draft
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
