import type { DatasourceDialect, DatasourceType } from '@graflare/shared/schemas/datasource';
import type {
  FieldMatcherId,
  FieldOverride,
  FieldOverrideProperty,
  FieldOverridePropertyId,
  MappingResult,
  ValueMapping,
  ValueMappingType,
} from '@graflare/shared/schemas/field-config';
import type { Panel, PanelQuery } from '@graflare/shared/schemas/panel';

import { UNIT_CATALOG } from '@graflare/shared/format/value-format';
import { FIELD_OVERRIDE_MATCHER_IDS, FIELD_OVERRIDE_PROPERTY_IDS, makeFieldOverrideProperty, makeValueMapping } from '@graflare/shared/schemas/field-config';
import { Button } from '@graflare/ui/components/button';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@graflare/ui/components/sheet';
import { Textarea } from '@graflare/ui/components/textarea';
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
  { value: 'state-timeline', label: 'State Timeline' },
  { value: 'status-history', label: 'Status History' },
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

// Field-override matcher kinds (field-config fieldMatcherSchema). The id SET is single-sourced
// from FIELD_OVERRIDE_MATCHER_IDS — only the per-kind copy lives here: `label` names the kind in
// the type Select; `optionLabel`/`placeholder` adapt the single string-options input per matcher,
// so the same `options: string` field reads naturally whether it holds a name, regex, type, or
// refId. The Record is keyed by FieldMatcherId, so a new matcher id forces a copy entry here.
const MATCHER_META: Record<FieldMatcherId, { label: string; optionLabel: string; placeholder: string }> = {
  byName: { label: 'By name', optionLabel: 'Field name', placeholder: 'cpu_usage' },
  byRegexp: { label: 'By regex', optionLabel: 'Regex', placeholder: '/cpu.*/' },
  byType: { label: 'By type', optionLabel: 'Type', placeholder: 'number' },
  byFrameRefID: { label: 'By query', optionLabel: 'Query refId', placeholder: 'A' },
};

const MATCHER_TYPE_OPTIONS = FIELD_OVERRIDE_MATCHER_IDS.map(id => ({ value: id, ...MATCHER_META[id] }));

// Overridable field-config properties (field-config fieldOverridePropertySchema). The id SET is
// single-sourced from FIELD_OVERRIDE_PROPERTY_IDS; only the human labels live here (keyed by id,
// so a new property forces a label). Drives the "Add property" Select; each picked id builds the
// right-typed property via makeFieldOverrideProperty.
const PROPERTY_LABELS: Record<FieldOverridePropertyId, string> = {
  unit: 'Unit',
  decimals: 'Decimals',
  min: 'Min',
  max: 'Max',
  mappings: 'Value mappings',
};

const PROPERTY_ID_OPTIONS = FIELD_OVERRIDE_PROPERTY_IDS.map(id => ({ value: id, label: PROPERTY_LABELS[id] }));

const isMatcherId = (v: string | null): v is FieldMatcherId => FIELD_OVERRIDE_MATCHER_IDS.some(id => id === v);
const isPropertyId = (v: string | null): v is FieldOverridePropertyId => FIELD_OVERRIDE_PROPERTY_IDS.some(id => id === v);

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
        val === 'state-timeline' ||
        val === 'status-history' ||
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

  // The generalized NumericOption reports just the raw string; these bind the field so each
  // Standard-options input keeps a stable callback (the codebase wires callbacks explicitly).
  const handleDecimalsChange = useCallback(
    (raw: string) => {
      handleNumericOptionChange('decimals', raw);
    },
    [handleNumericOptionChange],
  );
  const handleMinChange = useCallback(
    (raw: string) => {
      handleNumericOptionChange('min', raw);
    },
    [handleNumericOptionChange],
  );
  const handleMaxChange = useCallback(
    (raw: string) => {
      handleNumericOptionChange('max', raw);
    },
    [handleNumericOptionChange],
  );

  const setMappings = useCallback(
    (mappings: ValueMapping[]) => {
      setDefaults({ ...draft.fieldConfig.defaults, mappings });
    },
    [draft.fieldConfig.defaults, setDefaults],
  );

  // Field overrides live under fieldConfig.overrides, parallel to defaults. Replace the whole
  // array immutably through the existing setter (same pattern as setDefaults / setMappings) — the
  // FieldOverridesEditor owns its own add/update/remove on top of this, like MappingsEditor does.
  const setOverrides = useCallback(
    (overrides: FieldOverride[]) => {
      updateField('fieldConfig', { ...draft.fieldConfig, overrides });
    },
    [draft.fieldConfig, updateField],
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className='overflow-y-auto sm:max-w-[600px]'>
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

              <Textarea
                id='panel-text-content'
                aria-label='Panel content'
                value={draft.displayOptions.text?.content ?? ''}
                onChange={handleTextContentChange}
                rows={10}
                placeholder={draft.displayOptions.text?.mode === 'html' ? 'HTML…' : 'Markdown…'}
                className='font-mono'
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
              <UnitSelect id='panel-unit' value={draft.fieldConfig.defaults.unit} onValueChange={handleUnitChange} />
            </div>

            <div className='grid grid-cols-3 gap-2'>
              <NumericOption
                id='panel-decimals'
                label='Decimals'
                kind='decimals'
                value={draft.fieldConfig.defaults.decimals}
                placeholder='auto'
                onValueChange={handleDecimalsChange}
              />
              <NumericOption
                id='panel-min'
                label='Min'
                kind='minmax'
                value={draft.fieldConfig.defaults.min}
                placeholder='auto'
                onValueChange={handleMinChange}
              />
              <NumericOption
                id='panel-max'
                label='Max'
                kind='minmax'
                value={draft.fieldConfig.defaults.max}
                placeholder='auto'
                onValueChange={handleMaxChange}
              />
            </div>
          </div>

          <div className='space-y-3'>
            <MappingsEditor mappings={draft.fieldConfig.defaults.mappings} onChange={setMappings} labelPrefix='Mapping' addLabel='Add value mapping' />
          </div>

          <FieldOverridesEditor overrides={draft.fieldConfig.overrides} onChange={setOverrides} />

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

// A single labelled numeric input, shared by Standard options and the override property rows.
// Presentational only: it reports the raw input string and lets the caller decide how to parse
// (Standard options treats empty as "auto"/omit; an override property treats empty as 0, since
// its schema value is required). `kind` selects the keypad/step: 'decimals' is a non-negative
// integer count (numeric keypad), 'minmax' may be negative (default keyboard keeps the minus key)
// and fractional (wider step). `id` is passed in so each instance is unique — reusing this across
// overrides must not collide with the Standard-options ids.
const NumericOption = ({
  id,
  label,
  kind,
  value,
  placeholder,
  onValueChange,
}: {
  id: string;
  label: string;
  kind: 'decimals' | 'minmax';
  value: number | undefined;
  placeholder?: string;
  onValueChange: (raw: string) => void;
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onValueChange(e.target.value);
    },
    [onValueChange],
  );

  return (
    <div className='space-y-1'>
      <Label htmlFor={id} className='text-muted-foreground text-xs font-normal'>
        {label}
      </Label>
      <Input
        id={id}
        type='number'
        step={kind === 'decimals' ? '1' : 'any'}
        inputMode={kind === 'decimals' ? 'numeric' : undefined}
        placeholder={placeholder}
        value={value === undefined ? '' : String(value)}
        onChange={handleChange}
        className='text-sm'
      />
    </div>
  );
};

// The grouped unit Select (UNIT_CATALOG), shared by Standard options and the override unit
// property. `id` is passed in so each trigger is unique across overrides. `items={UNIT_ITEMS}`
// is required for the trigger to render the selected unit's label (base-ui-select rule).
const UnitSelect = ({ id, value, onValueChange }: { id: string; value: string; onValueChange: (val: string | null) => void }) => (
  <Select value={value} onValueChange={onValueChange} items={UNIT_ITEMS}>
    <SelectTrigger id={id}>
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
);

const MappingRow = ({
  mapping,
  index,
  onUpdate,
  onRemove,
  labelPrefix = 'Mapping',
}: {
  mapping: ValueMapping;
  index: number;
  onUpdate: (index: number, next: ValueMapping) => void;
  onRemove: (index: number) => void;
  // Disambiguates the row's aria-labels so a nested mappings editor (inside a field override)
  // doesn't collide with the Standard-options mappings. Defaults to the standalone "Mapping".
  labelPrefix?: string;
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

  // One accessible-name stem per row; `labelPrefix` keeps nested editors distinct.
  const rowLabel = `${labelPrefix} ${String(index + 1)}`;

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
          <Input placeholder='Match value' value={mapping.value} onChange={handleValueChange} className='flex-1 text-sm' aria-label={`${rowLabel} value`} />
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
              aria-label={`${rowLabel} from`}
            />
            <Input
              type='number'
              step='any'
              placeholder='To'
              value={mapping.to}
              onChange={handleToChange}
              className='w-20 text-sm'
              aria-label={`${rowLabel} to`}
            />
          </>
        )}

        {mapping.type === 'regex' && (
          <Input placeholder='Pattern' value={mapping.pattern} onChange={handlePatternChange} className='flex-1 text-sm' aria-label={`${rowLabel} pattern`} />
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

        <Button variant='ghost' size='icon' className='h-8 w-8 shrink-0' onClick={handleRemove} aria-label={`Remove ${rowLabel}`}>
          <Trash2 className='h-3.5 w-3.5' />
        </Button>
      </div>

      <div className='flex items-center gap-2'>
        <input
          type='color'
          value={mapping.result.color ?? '#000000'}
          onChange={handleResultColorChange}
          className='h-8 w-8 shrink-0 cursor-pointer rounded border-0'
          aria-label={`${rowLabel} color`}
        />
        {/* Mirror the swatch's hex as text so the value is legible without relying on
            color perception. */}
        <span className='text-muted-foreground w-16 shrink-0 font-mono text-xs uppercase tabular-nums'>{mapping.result.color ?? '#000000'}</span>
        <Input
          placeholder='Display text (optional)'
          value={mapping.result.text ?? ''}
          onChange={handleResultTextChange}
          className='flex-1 text-sm'
          aria-label={`${rowLabel} display text`}
        />
      </div>
    </div>
  );
};

// The add-button header + editable list of value-mapping rows. Shared by Standard options and
// the override "Value mappings" property. Owns the immutable add/remove/update of the array and
// reports the next array through `onChange`; the caller decides where it lives (fieldConfig
// defaults, or a single override property's value). `labelPrefix` + `addLabel` keep the row
// aria-labels and the Add button's accessible name unique when more than one editor is on screen.
const MappingsEditor = ({
  mappings,
  onChange,
  labelPrefix,
  addLabel,
}: {
  mappings: ValueMapping[];
  onChange: (next: ValueMapping[]) => void;
  labelPrefix: string;
  addLabel: string;
}) => {
  const handleAdd = useCallback(() => {
    onChange([...mappings, makeValueMapping('value', {})]);
  }, [mappings, onChange]);

  const handleRemove = useCallback(
    (index: number) => {
      onChange(mappings.filter((_, i) => i !== index));
    },
    [mappings, onChange],
  );

  const handleUpdate = useCallback(
    (index: number, next: ValueMapping) => {
      onChange(mappings.map((m, i) => (i === index ? next : m)));
    },
    [mappings, onChange],
  );

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between'>
        <Label>Value mappings</Label>
        <Button variant='ghost' size='xs' onClick={handleAdd} aria-label={addLabel}>
          <Plus className='mr-1 h-3 w-3' />
          Add
        </Button>
      </div>

      {mappings.map((m, i) => (
        <MappingRow key={String(i)} mapping={m} index={i} onUpdate={handleUpdate} onRemove={handleRemove} labelPrefix={labelPrefix} />
      ))}
    </div>
  );
};

// Parse a numeric override-property input. Unlike Standard options (where empty omits the key),
// a property's numeric value is required by the schema, so empty / non-numeric falls back to 0
// rather than producing `undefined` — no `!`/cast needed downstream.
const parseRequiredNumber = (raw: string): number => {
  const n = Number(raw);
  return raw.trim() === '' || Number.isNaN(n) ? 0 : n;
};

// One property row inside an override. The control matches the property kind, reusing the exact
// Standard-options controls (UnitSelect / NumericOption / MappingsEditor). Type safety: every
// handler narrows on `property.id` first, then spreads `{ ...property, value }` so `value` keeps
// the branch's type — the same no-cast discriminated-union edit MappingRow uses. The property's
// id never changes here (only the Add-property Select picks an id), so we never rebuild a
// discriminant. `ids` namespaces the DOM ids / aria-labels per override+property so reusing these
// controls across rows can't collide.
const OverridePropertyRow = ({
  property,
  index,
  overrideLabel,
  idPrefix,
  onChange,
  onRemove,
}: {
  property: FieldOverrideProperty;
  index: number;
  overrideLabel: string;
  idPrefix: string;
  onChange: (index: number, next: FieldOverrideProperty) => void;
  onRemove: (index: number) => void;
}) => {
  const handleUnitChange = useCallback(
    (val: string | null) => {
      if (property.id === 'unit') onChange(index, { ...property, value: val ?? '' });
    },
    [index, property, onChange],
  );

  // decimals/min/max share one handler: the guard narrows `property` to those three branches,
  // whose `value` is `number` in every case, so the `{ ...property, value }` spread stays a valid
  // member with no cast (verified type-safe). `kind` (decimals vs minmax) still differs inline at
  // each NumericOption render — only the change-handling is shared.
  const handleNumericChange = useCallback(
    (raw: string) => {
      if (property.id === 'decimals' || property.id === 'min' || property.id === 'max') {
        onChange(index, { ...property, value: parseRequiredNumber(raw) });
      }
    },
    [index, property, onChange],
  );

  const handleMappingsChange = useCallback(
    (next: ValueMapping[]) => {
      if (property.id === 'mappings') onChange(index, { ...property, value: next });
    },
    [index, property, onChange],
  );

  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);

  // The human label for this property id — single-sourced label table (PROPERTY_LABELS is keyed
  // by FieldOverridePropertyId, so it's always present for a valid property).
  const propLabel = PROPERTY_LABELS[property.id];
  const rowLabel = `${overrideLabel} ${propLabel}`;

  return (
    // fieldset+legend exposes a `group` named by the (sr-only) legend, so AT and tests can scope to
    // this property without the duplicate-name collisions reusing the inner controls would cause.
    <fieldset className='bg-muted/30 space-y-2 rounded-md border p-3'>
      <legend className='sr-only'>{rowLabel}</legend>
      <div className='flex items-center justify-between'>
        <span className='text-xs font-medium'>{propLabel}</span>
        <Button variant='ghost' size='icon' className='h-6 w-6 shrink-0' onClick={handleRemove} aria-label={`Remove ${rowLabel}`}>
          <X className='h-3 w-3' />
        </Button>
      </div>

      {property.id === 'unit' && <UnitSelect id={`${idPrefix}-unit`} value={property.value} onValueChange={handleUnitChange} />}
      {property.id === 'decimals' && (
        <NumericOption id={`${idPrefix}-decimals`} label='Decimals' kind='decimals' value={property.value} onValueChange={handleNumericChange} />
      )}
      {property.id === 'min' && <NumericOption id={`${idPrefix}-min`} label='Min' kind='minmax' value={property.value} onValueChange={handleNumericChange} />}
      {property.id === 'max' && <NumericOption id={`${idPrefix}-max`} label='Max' kind='minmax' value={property.value} onValueChange={handleNumericChange} />}
      {property.id === 'mappings' && (
        <MappingsEditor mappings={property.value} onChange={handleMappingsChange} labelPrefix={`${rowLabel} mapping`} addLabel={`Add ${rowLabel} mapping`} />
      )}
    </fieldset>
  );
};

// One override entry: a matcher (kind Select + adaptive single string-options input) plus its
// list of property rows, each addable/removable. Matcher edits are plain spreads — `options` is a
// string in every matcher branch (field-config fieldMatcherSchema), so changing `id` never
// rebuilds a discriminant; the options input's label/placeholder is the only thing that adapts.
// `<add property>` builds the right-typed property via makeFieldOverrideProperty. The fieldset's
// (sr-only) legend gives each override a stable `Override N` group name, so assistive tech and
// tests scope to one override and the reused inner controls keep their natural visible labels.
const OverrideRow = ({
  override,
  index,
  onUpdate,
  onRemove,
}: {
  override: FieldOverride;
  index: number;
  onUpdate: (index: number, next: FieldOverride) => void;
  onRemove: (index: number) => void;
}) => {
  const overrideLabel = `Override ${String(index + 1)}`;
  const idPrefix = `override-${String(index)}`;
  // The matcher's option-input copy, indexed straight off the keyed meta table — always present
  // for a valid matcher id, so no find/fallback (and no possibly-undefined access).
  const matcherKind = MATCHER_META[override.matcher.id];

  const handleMatcherIdChange = useCallback(
    (val: string | null) => {
      // options is a string in every matcher branch, so the id swap is a plain spread —
      // no factory, no discriminant rebuild. The kept options string just reads under a new label.
      if (isMatcherId(val)) onUpdate(index, { ...override, matcher: { ...override.matcher, id: val } });
    },
    [index, override, onUpdate],
  );

  const handleMatcherOptionsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(index, { ...override, matcher: { ...override.matcher, options: e.target.value } });
    },
    [index, override, onUpdate],
  );

  const handleAddProperty = useCallback(
    (val: string | null) => {
      if (isPropertyId(val)) onUpdate(index, { ...override, properties: [...override.properties, makeFieldOverrideProperty(val)] });
    },
    [index, override, onUpdate],
  );

  const handlePropertyChange = useCallback(
    (propIndex: number, next: FieldOverrideProperty) => {
      onUpdate(index, { ...override, properties: override.properties.map((p, i) => (i === propIndex ? next : p)) });
    },
    [index, override, onUpdate],
  );

  const handlePropertyRemove = useCallback(
    (propIndex: number) => {
      onUpdate(index, { ...override, properties: override.properties.filter((_, i) => i !== propIndex) });
    },
    [index, override, onUpdate],
  );

  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);

  return (
    // fieldset+legend names the whole override as a `group`; tests/AT scope to "Override N" so the
    // reused matcher/property controls keep their natural labels without colliding across overrides.
    <fieldset className='space-y-3 rounded-md border p-3'>
      <legend className='sr-only'>{overrideLabel}</legend>
      <div className='flex items-center justify-between'>
        <span className='text-xs font-medium'>{overrideLabel}</span>
        <Button variant='ghost' size='icon' className='h-6 w-6 shrink-0' onClick={handleRemove} aria-label={`Remove ${overrideLabel}`}>
          <X className='h-3 w-3' />
        </Button>
      </div>

      <div className='space-y-2'>
        <Label htmlFor={`${idPrefix}-matcher`} className='text-muted-foreground text-xs font-normal'>
          Matcher
        </Label>
        <Select value={override.matcher.id} onValueChange={handleMatcherIdChange} items={MATCHER_TYPE_OPTIONS}>
          <SelectTrigger id={`${idPrefix}-matcher`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MATCHER_TYPE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-2'>
        <Label htmlFor={`${idPrefix}-options`} className='text-muted-foreground text-xs font-normal'>
          {matcherKind.optionLabel}
        </Label>
        <Input
          id={`${idPrefix}-options`}
          value={override.matcher.options}
          onChange={handleMatcherOptionsChange}
          placeholder={matcherKind.placeholder}
          className='text-sm'
        />
      </div>

      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <Label className='text-muted-foreground text-xs font-normal'>Properties</Label>
          {/* An action menu, not a value picker: the trigger renders fixed children (not
              SelectValue), and `value` stays null so every pick is a null→id change that fires
              onValueChange — even picking the same id twice (verified against Base UI 1.5 in
              jsdom). `items` is still passed per the base-ui-select rule; the trigger-label half
              of that rule doesn't apply because there's no SelectValue to label. */}
          <Select value={null} onValueChange={handleAddProperty} items={PROPERTY_ID_OPTIONS}>
            <SelectTrigger id={`${idPrefix}-add-property`} size='sm' aria-label={`Add property to ${overrideLabel}`} className='w-auto gap-1'>
              <Plus className='h-3 w-3' />
              <span className='text-xs'>Add property</span>
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_ID_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {override.properties.length === 0 ? (
          <p className='text-muted-foreground text-xs'>No properties yet — matching fields use the panel defaults. Add one above.</p>
        ) : (
          override.properties.map((p, i) => (
            <OverridePropertyRow
              key={`${p.id}-${String(i)}`}
              property={p}
              index={i}
              overrideLabel={overrideLabel}
              idPrefix={`${idPrefix}-prop-${String(i)}`}
              onChange={handlePropertyChange}
              onRemove={handlePropertyRemove}
            />
          ))
        )}
      </div>
    </fieldset>
  );
};

// The "Field overrides" section: a header with an Add button, then one OverrideRow per entry (or
// an empty-state hint). Owns the immutable add/update/remove of the override array and reports the
// next array through `onChange` (same shape as MappingsEditor) — the caller passes only the array
// and the setter. Each override's matcher selects fields by name/regex/type/refId and layers its
// properties over fieldConfig.defaults at render time (see resolveFieldConfig); array order is
// precedence (later wins), matching the data layer.
const FieldOverridesEditor = ({ overrides, onChange }: { overrides: FieldOverride[]; onChange: (next: FieldOverride[]) => void }) => {
  const handleAdd = useCallback(() => {
    // byName is the default matcher with an empty options string (Grafana's defaultOptions), and
    // no properties yet — the user adds them per-row.
    onChange([...overrides, { matcher: { id: 'byName', options: '' }, properties: [] }]);
  }, [overrides, onChange]);

  const handleUpdate = useCallback(
    (index: number, next: FieldOverride) => {
      onChange(overrides.map((o, i) => (i === index ? next : o)));
    },
    [overrides, onChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onChange(overrides.filter((_, i) => i !== index));
    },
    [overrides, onChange],
  );

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <Label>Field overrides</Label>
        <Button variant='ghost' size='xs' onClick={handleAdd} aria-label='Add field override'>
          <Plus className='mr-1 h-3 w-3' />
          Add
        </Button>
      </div>

      {overrides.length === 0 ? (
        <p className='text-muted-foreground text-xs'>No field overrides. Add one to style specific fields differently from the panel defaults.</p>
      ) : (
        overrides.map((o, i) => <OverrideRow key={String(i)} override={o} index={i} onUpdate={handleUpdate} onRemove={handleRemove} />)
      )}
    </div>
  );
};
