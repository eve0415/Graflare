import type { Panel, PanelQuery } from '@graflare/shared/schemas/panel';

import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@graflare/ui/components/sheet';
import { Plus, Trash2, X } from 'lucide-react';
import { useCallback, useState } from 'react';

interface PanelEditorProps {
  panel: Panel;
  open: boolean;
  onClose: () => void;
  onSave: (panel: Panel) => void;
}

export const PanelEditor = ({ panel, open, onClose, onSave }: PanelEditorProps) => {
  const [draft, setDraft] = useState<Panel>(panel);

  const updateField = useCallback(<K extends keyof Panel>(key: K, value: Panel[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateField('title', e.target.value);
  }, [updateField]);

  const handleTypeChange = useCallback((val: string) => {
    if (val === 'timeseries' || val === 'stat' || val === 'table' || val === 'gauge') {
      updateField('type', val);
    }
  }, [updateField]);

  const addQuery = useCallback(() => {
    const refId = String.fromCodePoint(65 + draft.queries.length);
    const newQuery: PanelQuery = { refId, expr: '', legendFormat: '' };
    updateField('queries', [...draft.queries, newQuery]);
  }, [draft.queries, updateField]);

  const removeQuery = useCallback((index: number) => {
    updateField('queries', draft.queries.filter((_, i) => i !== index));
  }, [draft.queries, updateField]);

  const updateQuery = useCallback((index: number, field: keyof PanelQuery, value: string) => {
    const updated = draft.queries.map((q, i) =>
      i === index ? { ...q, [field]: value } : q,
    );
    updateField('queries', updated);
  }, [draft.queries, updateField]);

  const addThreshold = useCallback(() => {
    updateField('thresholds', [...draft.thresholds, { value: 0, color: '#ef4444' }]);
  }, [draft.thresholds, updateField]);

  const removeThreshold = useCallback((index: number) => {
    updateField('thresholds', draft.thresholds.filter((_, i) => i !== index));
  }, [draft.thresholds, updateField]);

  const handleSave = useCallback(() => {
    onSave(draft);
    onClose();
  }, [draft, onSave, onClose]);

  const handleOpenChange = useCallback((isOpen: boolean) => { if (!isOpen) onClose(); }, [onClose]);

  const handleThresholdChange = useCallback((index: number, field: 'value' | 'color', value: string) => {
    const updated = draft.thresholds.map((th, j) =>
      j === index ? Object.assign(th, { [field]: field === 'value' ? Number(value) : value }) : th,
    );
    updateField('thresholds', updated);
  }, [draft.thresholds, updateField]);

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className='w-[600px] overflow-y-auto sm:max-w-[600px]'>
        <SheetHeader>
          <SheetTitle>Edit Panel</SheetTitle>
        </SheetHeader>

        <div className='space-y-6 py-4'>
          <div className='space-y-2'>
            <Label htmlFor='panel-title'>Title</Label>
            <Input id='panel-title' value={draft.title} onChange={handleTitleChange} />
          </div>

          <div className='space-y-2'>
            <Label>Panel Type</Label>
            <Select value={draft.type} onValueChange={handleTypeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='timeseries'>Time Series</SelectItem>
                <SelectItem value='stat'>Stat</SelectItem>
                <SelectItem value='table'>Table</SelectItem>
                <SelectItem value='gauge'>Gauge</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <Label>Queries</Label>
              <Button variant='ghost' size='xs' onClick={addQuery}>
                <Plus className='mr-1 h-3 w-3' />
                Add
              </Button>
            </div>

            {draft.queries.map((q, i) => (
              <QueryRow
                key={q.refId}
                query={q}
                index={i}
                onUpdate={updateQuery}
                onRemove={removeQuery}
              />
            ))}
          </div>

          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <Label>Thresholds</Label>
              <Button variant='ghost' size='xs' onClick={addThreshold}>
                <Plus className='mr-1 h-3 w-3' />
                Add
              </Button>
            </div>

            {draft.thresholds.map((t, i) => (
              <ThresholdRow
                key={String(i)}
                threshold={t}
                index={i}
                onRemove={removeThreshold}
                onChange={handleThresholdChange}
              />
            ))}
          </div>

          <div className='flex justify-end gap-2'>
            <Button variant='outline' onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave}>Apply</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const QueryRow = ({
  query,
  index,
  onUpdate,
  onRemove,
}: {
  query: PanelQuery;
  index: number;
  onUpdate: (index: number, field: keyof PanelQuery, value: string) => void;
  onRemove: (index: number) => void;
}) => {
  const handleExprChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate(index, 'expr', e.target.value);
  }, [index, onUpdate]);

  const handleLegendChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate(index, 'legendFormat', e.target.value);
  }, [index, onUpdate]);

  const handleRemove = useCallback(() => { onRemove(index); }, [index, onRemove]);

  return (
    <div className='space-y-1.5 rounded-md border p-3'>
      <div className='flex items-center justify-between'>
        <span className='text-xs font-medium'>{query.refId}</span>
        <Button variant='ghost' size='icon' className='h-6 w-6' onClick={handleRemove} aria-label={`Remove query ${query.refId}`}>
          <X className='h-3 w-3' />
        </Button>
      </div>
      <Input
        placeholder='Query expression'
        value={query.expr}
        onChange={handleExprChange}
        className='font-mono text-sm'
      />
      <Input
        placeholder='Legend format (optional)'
        value={query.legendFormat}
        onChange={handleLegendChange}
        className='text-sm'
      />
    </div>
  );
};

const ThresholdRow = ({
  threshold,
  index,
  onRemove,
  onChange,
}: {
  threshold: { value: number; color: string };
  index: number;
  onRemove: (index: number) => void;
  onChange: (index: number, field: 'value' | 'color', value: string) => void;
}) => {
  const handleValueChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(index, 'value', e.target.value);
  }, [index, onChange]);

  const handleColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(index, 'color', e.target.value);
  }, [index, onChange]);

  const handleRemove = useCallback(() => { onRemove(index); }, [index, onRemove]);

  return (
    <div className='flex items-center gap-2'>
      <input
        type='color'
        value={threshold.color}
        onChange={handleColorChange}
        className='h-8 w-8 cursor-pointer rounded border-0'
        aria-label={`Threshold ${String(index + 1)} color`}
      />
      <Input
        type='number'
        value={threshold.value}
        onChange={handleValueChange}
        className='w-24 text-sm'
        aria-label={`Threshold ${String(index + 1)} value`}
      />
      <Button variant='ghost' size='icon' className='h-8 w-8' onClick={handleRemove} aria-label={`Remove threshold ${String(index + 1)}`}>
        <Trash2 className='h-3.5 w-3.5' />
      </Button>
    </div>
  );
};
