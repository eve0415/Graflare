import type { DatasourceDialect, DatasourceType } from '@graflare/shared/schemas/datasource';
import type { MappingResult, ValueMapping, ValueMappingType } from '@graflare/shared/schemas/field-config';
import type { Panel, PanelQuery } from '@graflare/shared/schemas/panel';

import { UNIT_CATALOG } from '@graflare/shared/format/value-format';
import { makeValueMapping } from '@graflare/shared/schemas/field-config';
import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@graflare/ui/components/sheet';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { databaseSchemaQueryOptions } from '../../-root/introspection-queries';
import { datasourcesQueryOptions } from '../../datasources/-queries';
import { QueryCodeEditor } from '../../explore/-components/query-code-editor';

const PANEL_TYPE_OPTIONS = [
  { value: 'timeseries', label: 'Time Series' },
  { value: 'stat', label: 'Stat' },
  { value: 'table', label: 'Table' },
  { value: 'gauge', label: 'Gauge' },
  { value: 'bargauge', label: 'Bar Gauge' },
  { value: 'barchart', label: 'Bar Chart' },
  { value: 'pie', label: 'Pie Chart' },
  { value: 'histogram', label: 'Histogram' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'text', label: 'Text' },
] as const;

// Render mode for the text panel's content editor. Single source feeds both the
// Select's `items` (trigger label) and the dropdown options (base-ui-select rule).
const TEXT_MODE_OPTIONS = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'html', label: 'HTML' },
] as const;

const isTextMode = (v: string | null): v is 'markdown' | 'html' => v === 'markdown' || v === 'html';

// Flat {value,label} array for the unit Select's `items` (trigger label resolution);
// the dropdown is rendered grouped from UNIT_CATALOG. Single source = the catalog.
const UNIT_ITEMS = UNIT_CATALOG.flatMap(g => g.options.map(o => ({ value: o.id, label: o.label })));

const MAPPING_TYPE_OPTIONS = [
  { value: 'value', label: 'Value' },
  { value: 'range', label: 'Range' },
  { value: 'regex', label: 'Regex' },
  { value: 'special', label: 'Special' },
] as const;

const SPECIAL_MATCH_OPTIONS = [
  { value: 'null', label: 'Null' },
  { value: 'nan', label: 'NaN' },
  { value: 'empty', label: 'Empty' },
] as const;

const isMappingType = (v: string | null): v is ValueMappingType => v === 'value' || v === 'range' || v === 'regex' || v === 'special';
const isSpecialMatch = (v: string | null): v is 'null' | 'nan' | 'empty' => v === 'null' || v === 'nan' || v === 'empty';

interface PanelEditorProps {
  panel: Panel;
  open: boolean;
  onClose: () => void;
  onSave: (panel: Panel) => void;
}

const VALID_DIALECTS = new Set<string>(['postgres', 'sqlite']);
const isValidDialect = (value: string | null | undefined): value is DatasourceDialect => typeof value === 'string' && VALID_DIALECTS.has(value);

export const PanelEditor = ({ panel, open, onClose, onSave }: PanelEditorProps) => {
  const [draft, setDraft] = useState<Panel>(panel);
  const dsQuery = useQuery(datasourcesQueryOptions());
  const selectedDs = dsQuery.data?.find(d => d.id === draft.datasourceId);
  const rawType = selectedDs?.type ?? 'prometheus';
  const dsType: DatasourceType = rawType === 'sql' ? 'sql' : 'prometheus';
  const dsDialect = isValidDialect(selectedDs?.dialect) ? selectedDs.dialect : undefined;
  const dbSchemaQuery = useQuery(databaseSchemaQueryOptions(dsType === 'sql' && draft.datasourceId !== undefined ? draft.datasourceId : ''));
  const codeSchema = dsType === 'sql' ? dbSchemaQuery.data?.tables : undefined;

  const updateField = useCallback(<K extends keyof Panel>(key: K, value: Panel[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateField('title', e.target.value);
    },
    [updateField],
  );

  const handleTypeChange = useCallback(
    (val: string | null) => {
      if (
        val === 'timeseries' ||
        val === 'stat' ||
        val === 'table' ||
        val === 'gauge' ||
        val === 'bargauge' ||
        val === 'barchart' ||
        val === 'pie' ||
        val === 'histogram' ||
        val === 'heatmap' ||
        val === 'text'
      ) {
        updateField('type', val);
      }
    },
    [updateField],
  );

  const addQuery = useCallback(() => {
    const refId = String.fromCodePoint(65 + draft.queries.length);
    const newQuery: PanelQuery = { refId, expr: '', legendFormat: '', format: 'time_series' };
    updateField('queries', [...draft.queries, newQuery]);
  }, [draft.queries, updateField]);

  const removeQuery = useCallback(
    (index: number) => {
      updateField(
        'queries',
        draft.queries.filter((_, i) => i !== index),
      );
    },
    [draft.queries, updateField],
  );

  const updateQuery = useCallback(
    (index: number, field: keyof PanelQuery, value: string) => {
      const updated = draft.queries.map((q, i) => (i === index ? { ...q, [field]: value } : q));
      updateField('queries', updated);
    },
    [draft.queries, updateField],
  );

  const addThreshold = useCallback(() => {
    updateField('thresholds', [...draft.thresholds, { value: 0, color: '#ef4444' }]);
  }, [draft.thresholds, updateField]);

  const removeThreshold = useCallback(
    (index: number) => {
      updateField(
        'thresholds',
        draft.thresholds.filter((_, i) => i !== index),
      );
    },
    [draft.thresholds, updateField],
  );

  const handleSave = useCallback(() => {
    onSave(draft);
    onClose();
  }, [draft, onSave, onClose]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) onClose();
    },
    [onClose],
  );

  const handleThresholdChange = useCallback(
    (index: number, field: 'value' | 'color', value: string) => {
      const updated = draft.thresholds.map((th, j) => (j === index ? Object.assign(th, { [field]: field === 'value' ? Number(value) : value }) : th));
      updateField('thresholds', updated);
    },
    [draft.thresholds, updateField],
  );

  // Text panel content lives under displayOptions.text. Merge onto the current value
  // so changing one field (content/mode) preserves the other; fall back to the schema
  // defaults ('' / 'markdown') the first time either is set.
  const handleTextContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const current = draft.displayOptions.text;
      updateField('displayOptions', { ...draft.displayOptions, text: { content: e.target.value, mode: current?.mode ?? 'markdown' } });
    },
    [draft.displayOptions, updateField],
  );

  const handleTextModeChange = useCallback(
    (val: string | null) => {
      if (!isTextMode(val)) return;
      const current = draft.displayOptions.text;
      updateField('displayOptions', { ...draft.displayOptions, text: { content: current?.content ?? '', mode: val } });
    },
    [draft.displayOptions, updateField],
  );

  // Standard options + value mappings all live under fieldConfig.defaults. Replace
  // the whole defaults object immutably through the existing setter — no new state.
  const setDefaults = useCallback(
    (defaults: Panel['fieldConfig']['defaults']) => {
      updateField('fieldConfig', { ...draft.fieldConfig, defaults });
    },
    [draft.fieldConfig, updateField],
  );

  const handleUnitChange = useCallback(
    (val: string | null) => {
      setDefaults({ ...draft.fieldConfig.defaults, unit: val ?? '' });
    },
    [draft.fieldConfig.defaults, setDefaults],
  );

  // decimals/min/max are optional: an empty input omits the key entirely
  // (exactOptionalPropertyTypes forbids writing `undefined`). Rebuild the three
  // optional keys explicitly so the changed one is set or dropped without a
  // dynamic delete, and the other two carry through untouched.
  const handleNumericOptionChange = useCallback(
    (field: 'decimals' | 'min' | 'max', raw: string) => {
      const { decimals, min, max, ...rest } = draft.fieldConfig.defaults;
      const current = { decimals, min, max };
      const parsed = raw.trim() === '' ? undefined : Number(raw);
      const nextOptional = { ...current, [field]: parsed };
      const result: Panel['fieldConfig']['defaults'] = { ...rest };
      if (nextOptional.decimals !== undefined) result.decimals = nextOptional.decimals;
      if (nextOptional.min !== undefined) result.min = nextOptional.min;
      if (nextOptional.max !== undefined) result.max = nextOptional.max;
      setDefaults(result);
    },
    [draft.fieldConfig.defaults, setDefaults],
  );

  const setMappings = useCallback(
    (mappings: ValueMapping[]) => {
      setDefaults({ ...draft.fieldConfig.defaults, mappings });
    },
    [draft.fieldConfig.defaults, setDefaults],
  );

  const addMapping = useCallback(() => {
    setMappings([...draft.fieldConfig.defaults.mappings, makeValueMapping('value', {})]);
  }, [draft.fieldConfig.defaults.mappings, setMappings]);

  const removeMapping = useCallback(
    (index: number) => {
      setMappings(draft.fieldConfig.defaults.mappings.filter((_, i) => i !== index));
    },
    [draft.fieldConfig.defaults.mappings, setMappings],
  );

  const updateMapping = useCallback(
    (index: number, next: ValueMapping) => {
      setMappings(draft.fieldConfig.defaults.mappings.map((m, i) => (i === index ? next : m)));
    },
    [draft.fieldConfig.defaults.mappings, setMappings],
  );

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
            <Select value={draft.type} onValueChange={handleTypeChange} items={PANEL_TYPE_OPTIONS}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PANEL_TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {draft.type === 'text' && (
            <div className='space-y-3'>
              <Label>Content</Label>

              <div className='space-y-2'>
                <Label htmlFor='panel-text-mode' className='text-muted-foreground text-xs font-normal'>
                  Mode
                </Label>
                <Select value={draft.displayOptions.text?.mode ?? 'markdown'} onValueChange={handleTextModeChange} items={TEXT_MODE_OPTIONS}>
                  <SelectTrigger id='panel-text-mode'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEXT_MODE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <textarea
                id='panel-text-content'
                aria-label='Panel content'
                value={draft.displayOptions.text?.content ?? ''}
                onChange={handleTextContentChange}
                rows={10}
                placeholder={draft.displayOptions.text?.mode === 'html' ? 'HTML…' : 'Markdown…'}
                className='border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 font-mono text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
              />
            </div>
          )}

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
                datasourceType={dsType}
                dialect={dsDialect}
                schema={codeSchema}
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
              <ThresholdRow key={String(i)} threshold={t} index={i} onRemove={removeThreshold} onChange={handleThresholdChange} />
            ))}
          </div>

          <div className='space-y-3'>
            <Label>Standard options</Label>

            <div className='space-y-2'>
              <Label htmlFor='panel-unit' className='text-muted-foreground text-xs font-normal'>
                Unit
              </Label>
              <Select value={draft.fieldConfig.defaults.unit} onValueChange={handleUnitChange} items={UNIT_ITEMS}>
                <SelectTrigger id='panel-unit'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_CATALOG.map(group => (
                    <SelectGroup key={group.group}>
                      <SelectLabel>{group.group}</SelectLabel>
                      {group.options.map(o => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='grid grid-cols-3 gap-2'>
              <NumericOption field='decimals' label='Decimals' value={draft.fieldConfig.defaults.decimals} onChange={handleNumericOptionChange} />
              <NumericOption field='min' label='Min' value={draft.fieldConfig.defaults.min} onChange={handleNumericOptionChange} />
              <NumericOption field='max' label='Max' value={draft.fieldConfig.defaults.max} onChange={handleNumericOptionChange} />
            </div>
          </div>

          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <Label>Value mappings</Label>
              <Button variant='ghost' size='xs' onClick={addMapping} aria-label='Add value mapping'>
                <Plus className='mr-1 h-3 w-3' />
                Add
              </Button>
            </div>

            {draft.fieldConfig.defaults.mappings.map((m, i) => (
              <MappingRow key={String(i)} mapping={m} index={i} onUpdate={updateMapping} onRemove={removeMapping} />
            ))}
          </div>

          <div className='flex justify-end gap-2'>
            <Button variant='outline' onClick={onClose}>
              Cancel
            </Button>
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
  datasourceType,
  dialect,
  schema,
}: {
  query: PanelQuery;
  index: number;
  onUpdate: (index: number, field: keyof PanelQuery, value: string) => void;
  onRemove: (index: number) => void;
  datasourceType: DatasourceType;
  dialect: DatasourceDialect | undefined;
  schema: Record<string, { name: string; type: string; nullable: boolean }[]> | undefined;
}) => {
  const handleExprChange = useCallback(
    (value: string) => {
      onUpdate(index, 'expr', value);
    },
    [index, onUpdate],
  );

  const handleLegendChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(index, 'legendFormat', e.target.value);
    },
    [index, onUpdate],
  );

  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);

  const handleRun = useCallback(() => {
    // no-op in panel editor — queries run on dashboard save/refresh
  }, []);

  return (
    <div className='space-y-1.5 rounded-md border p-3'>
      <div className='flex items-center justify-between'>
        <span className='text-xs font-medium'>{query.refId}</span>
        <Button variant='ghost' size='icon' className='h-6 w-6' onClick={handleRemove} aria-label={`Remove query ${query.refId}`}>
          <X className='h-3 w-3' />
        </Button>
      </div>
      <QueryCodeEditor
        datasourceType={datasourceType}
        dialect={dialect}
        schema={schema}
        value={query.expr}
        onChange={handleExprChange}
        onRun={handleRun}
        placeholder={datasourceType === 'sql' ? 'SQL query...' : 'PromQL expression...'}
      />
      <Input placeholder='Legend format (optional)' value={query.legendFormat} onChange={handleLegendChange} className='text-sm' />
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
  const handleValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(index, 'value', e.target.value);
    },
    [index, onChange],
  );

  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(index, 'color', e.target.value);
    },
    [index, onChange],
  );

  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);

  return (
    <div className='flex items-center gap-2'>
      <input
        type='color'
        value={threshold.color}
        onChange={handleColorChange}
        className='h-8 w-8 cursor-pointer rounded border-0'
        aria-label={`Threshold ${String(index + 1)} color`}
      />
      {/* The swatch alone is unreadable for color-blind / high-contrast users, so
          surface the hex value as text too. */}
      <span className='text-muted-foreground w-16 font-mono text-xs uppercase tabular-nums'>{threshold.color}</span>
      <Input
        type='number'
        step='any'
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

const NumericOption = ({
  field,
  label,
  value,
  onChange,
}: {
  field: 'decimals' | 'min' | 'max';
  label: string;
  value: number | undefined;
  onChange: (field: 'decimals' | 'min' | 'max', raw: string) => void;
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(field, e.target.value);
    },
    [field, onChange],
  );

  return (
    <div className='space-y-1'>
      <Label htmlFor={`panel-${field}`} className='text-muted-foreground text-xs font-normal'>
        {label}
      </Label>
      {/* `decimals` is a non-negative integer count, so a numeric mobile keypad fits;
          `min`/`max` may be negative, so we leave the default keyboard (which keeps the
          minus key) and only widen the step to allow fractional bounds. */}
      <Input
        id={`panel-${field}`}
        type='number'
        step={field === 'decimals' ? '1' : 'any'}
        inputMode={field === 'decimals' ? 'numeric' : undefined}
        placeholder='auto'
        value={value === undefined ? '' : String(value)}
        onChange={handleChange}
        className='text-sm'
      />
    </div>
  );
};

const MappingRow = ({
  mapping,
  index,
  onUpdate,
  onRemove,
}: {
  mapping: ValueMapping;
  index: number;
  onUpdate: (index: number, next: ValueMapping) => void;
  onRemove: (index: number) => void;
}) => {
  // Type change rebuilds a fresh variant, carrying the result across.
  const handleTypeChange = useCallback(
    (val: string | null) => {
      if (isMappingType(val)) onUpdate(index, makeValueMapping(val, mapping.result));
    },
    [index, mapping.result, onUpdate],
  );

  const handleValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (mapping.type === 'value') onUpdate(index, { ...mapping, value: e.target.value });
    },
    [index, mapping, onUpdate],
  );

  const handleFromChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (mapping.type === 'range') onUpdate(index, { ...mapping, from: Number(e.target.value) });
    },
    [index, mapping, onUpdate],
  );

  const handleToChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (mapping.type === 'range') onUpdate(index, { ...mapping, to: Number(e.target.value) });
    },
    [index, mapping, onUpdate],
  );

  const handlePatternChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (mapping.type === 'regex') onUpdate(index, { ...mapping, pattern: e.target.value });
    },
    [index, mapping, onUpdate],
  );

  const handleMatchChange = useCallback(
    (val: string | null) => {
      if (mapping.type === 'special' && isSpecialMatch(val)) onUpdate(index, { ...mapping, match: val });
    },
    [index, mapping, onUpdate],
  );

  // result.text / result.color are optional — omit the key when cleared.
  const handleResultTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      const { color } = mapping.result;
      const result: MappingResult = text === '' ? (color === undefined ? {} : { color }) : color === undefined ? { text } : { text, color };
      onUpdate(index, { ...mapping, result });
    },
    [index, mapping, onUpdate],
  );

  const handleResultColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { text } = mapping.result;
      const color = e.target.value;
      const result: MappingResult = text === undefined ? { color } : { text, color };
      onUpdate(index, { ...mapping, result });
    },
    [index, mapping, onUpdate],
  );

  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);

  return (
    <div className='space-y-2 rounded-md border p-3'>
      <div className='flex items-center gap-2'>
        <Select value={mapping.type} onValueChange={handleTypeChange} items={MAPPING_TYPE_OPTIONS}>
          <SelectTrigger className='w-28'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MAPPING_TYPE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {mapping.type === 'value' && (
          <Input
            placeholder='Match value'
            value={mapping.value}
            onChange={handleValueChange}
            className='flex-1 text-sm'
            aria-label={`Mapping ${String(index + 1)} value`}
          />
        )}

        {mapping.type === 'range' && (
          <>
            <Input
              type='number'
              step='any'
              placeholder='From'
              value={mapping.from}
              onChange={handleFromChange}
              className='w-20 text-sm'
              aria-label={`Mapping ${String(index + 1)} from`}
            />
            <Input
              type='number'
              step='any'
              placeholder='To'
              value={mapping.to}
              onChange={handleToChange}
              className='w-20 text-sm'
              aria-label={`Mapping ${String(index + 1)} to`}
            />
          </>
        )}

        {mapping.type === 'regex' && (
          <Input
            placeholder='Pattern'
            value={mapping.pattern}
            onChange={handlePatternChange}
            className='flex-1 text-sm'
            aria-label={`Mapping ${String(index + 1)} pattern`}
          />
        )}

        {mapping.type === 'special' && (
          <Select value={mapping.match} onValueChange={handleMatchChange} items={SPECIAL_MATCH_OPTIONS}>
            <SelectTrigger className='flex-1'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPECIAL_MATCH_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button variant='ghost' size='icon' className='h-8 w-8 shrink-0' onClick={handleRemove} aria-label={`Remove mapping ${String(index + 1)}`}>
          <Trash2 className='h-3.5 w-3.5' />
        </Button>
      </div>

      <div className='flex items-center gap-2'>
        <input
          type='color'
          value={mapping.result.color ?? '#000000'}
          onChange={handleResultColorChange}
          className='h-8 w-8 shrink-0 cursor-pointer rounded border-0'
          aria-label={`Mapping ${String(index + 1)} color`}
        />
        {/* Mirror the swatch's hex as text so the value is legible without relying on
            color perception. */}
        <span className='text-muted-foreground w-16 shrink-0 font-mono text-xs uppercase tabular-nums'>{mapping.result.color ?? '#000000'}</span>
        <Input
          placeholder='Display text (optional)'
          value={mapping.result.text ?? ''}
          onChange={handleResultTextChange}
          className='flex-1 text-sm'
          aria-label={`Mapping ${String(index + 1)} display text`}
        />
      </div>
    </div>
  );
};
