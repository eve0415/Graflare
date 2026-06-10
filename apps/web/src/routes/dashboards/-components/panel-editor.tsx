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
import type { FilterFieldsMatch, ReduceCalc, Transformation, TransformationId } from '@graflare/shared/schemas/transformation';
import type { Variable } from '@graflare/shared/schemas/variable';

import { UNIT_CATALOG } from '@graflare/shared/format/value-format';
import { FIELD_OVERRIDE_MATCHER_IDS, FIELD_OVERRIDE_PROPERTY_IDS, makeFieldOverrideProperty, makeValueMapping } from '@graflare/shared/schemas/field-config';
import { FILTER_FIELDS_MATCH_KINDS, REDUCE_CALCS, TRANSFORMATION_IDS, makeTransformation } from '@graflare/shared/schemas/transformation';
import { Button } from '@graflare/ui/components/button';
import { Checkbox } from '@graflare/ui/components/checkbox';
import { Input } from '@graflare/ui/components/input';
import { Label } from '@graflare/ui/components/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@graflare/ui/components/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@graflare/ui/components/sheet';
import { Skeleton } from '@graflare/ui/components/skeleton';
import { Textarea } from '@graflare/ui/components/textarea';
import { ToggleGroup, ToggleGroupItem } from '@graflare/ui/components/toggle-group';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import { Suspense, lazy, useCallback, useMemo, useState } from 'react';

import { databaseSchemaQueryOptions } from '../../-root/introspection-queries';
import { datasourcesQueryOptions } from '../../datasources/-queries';

// Lazy so the dashboard view route's chunk doesn't eagerly pull the CodeMirror + PromQL stack
// (~640 KB raw) the editor top-level-imports — it loads on first edit-sheet open. The explore
// route imports the module statically and keeps its own eager path.
const QueryCodeEditor = lazy(() => import('../../explore/-components/query-code-editor').then(m => ({ default: m.QueryCodeEditor })));

// Sized to the editor's single-line shell (36px content box) so the swap doesn't jump.
const EDITOR_FALLBACK = <Skeleton className='h-9 w-full rounded-md' />;

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

// Human labels for each transform id (transformation transformationSchema). The id SET is
// single-sourced from TRANSFORMATION_IDS; only the labels live here (keyed by id, so a new
// transform forces a label). Drives the "Add transformation" menu and each card's title. The
// transform's value editor is dispatched per id below — each picked id builds the right-typed
// transform via makeTransformation, mirroring the override "Add property" flow.
const TRANSFORMATION_LABELS: Record<TransformationId, string> = {
  reduce: 'Reduce',
  filterFieldsByName: 'Filter by name',
  organize: 'Organize fields',
  sortBy: 'Sort by',
  limit: 'Limit',
};

const TRANSFORMATION_ID_OPTIONS = TRANSFORMATION_IDS.map(id => ({ value: id, label: TRANSFORMATION_LABELS[id] }));

// reduce.calc — single-sourced off the exported REDUCE_CALCS so the dropdown items and the
// narrowing guard never drift. Labels are inline copy keyed by the canonical calc id.
const REDUCE_CALC_LABELS: Record<ReduceCalc, string> = {
  last: 'Last',
  first: 'First',
  min: 'Min',
  max: 'Max',
  mean: 'Mean',
  sum: 'Sum',
  count: 'Count',
};
const REDUCE_CALC_OPTIONS = REDUCE_CALCS.map(calc => ({ value: calc, label: REDUCE_CALC_LABELS[calc] }));
const isReduceCalc = (v: string | null): v is ReduceCalc => REDUCE_CALCS.some(c => c === v);

// filterFieldsByName.match — single-sourced off the exported FILTER_FIELDS_MATCH_KINDS (byName /
// byRegexp), same guard+items pattern as the reduce calc.
const FILTER_MATCH_LABELS: Record<FilterFieldsMatch, string> = {
  byName: 'By name',
  byRegexp: 'By regex',
};
const FILTER_MATCH_OPTIONS = FILTER_FIELDS_MATCH_KINDS.map(match => ({ value: match, label: FILTER_MATCH_LABELS[match] }));
const isFilterMatch = (v: string | null): v is FilterFieldsMatch => FILTER_FIELDS_MATCH_KINDS.some(m => m === v);

// filterFieldsByName.mode and sortBy.by are inline z.enums in the schema (not exported), so their
// option arrays + guards live here (same as the text-mode/mapping-type locals above).
const FILTER_MODE_OPTIONS = [
  { value: 'include', label: 'Include' },
  { value: 'exclude', label: 'Exclude' },
] as const;
const isFilterMode = (v: string | null): v is 'include' | 'exclude' => v === 'include' || v === 'exclude';

const SORT_BY_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'value', label: 'Value' },
] as const;
const isSortBy = (v: string | null): v is 'name' | 'value' => v === 'name' || v === 'value';

const isTransformationId = (v: string | null): v is TransformationId => TRANSFORMATION_IDS.some(id => id === v);

// maxPerRow choices for a horizontal repeat — the even 24-column divisors Grafana offers. The
// Select carries string values; the handler parses back to the schema's int.
const MAX_PER_ROW_OPTIONS = [
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '6', label: '6' },
  { value: '8', label: '8' },
  { value: '12', label: '12' },
] as const;

interface PanelEditorProps {
  panel: Panel;
  /** The dashboard's saved variables — the candidates a panel can repeat by. */
  variables: readonly Variable[];
  open: boolean;
  onClose: () => void;
  onSave: (panel: Panel) => void;
}

const VALID_DIALECTS = new Set<string>(['postgres', 'sqlite']);
const isValidDialect = (value: string | null | undefined): value is DatasourceDialect => typeof value === 'string' && VALID_DIALECTS.has(value);

export const PanelEditor = ({ panel, variables, open, onClose, onSave }: PanelEditorProps) => {
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
      const updated = draft.thresholds.map((th, j) => (j === index ? { ...th, [field]: field === 'value' ? Number(value) : value } : th));
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

  // Transformations are a top-level Panel field (not nested under fieldConfig), so the setter is a
  // plain updateField — the TransformationsEditor owns its own add/update/remove/reorder on top of
  // this array, same shape as FieldOverridesEditor.
  const setTransformations = useCallback(
    (transformations: Transformation[]) => {
      updateField('transformations', transformations);
    },
    [updateField],
  );

  // "None" + the dashboard's variable names. None uses the empty-string sentinel — it can never
  // collide with a real variable (the schema requires names of length ≥ 1), and '' is the
  // codebase's established no-selection Select value (unit select, SQL builder).
  const repeatItems = useMemo(() => [{ value: '', label: 'None' }, ...variables.map(v => ({ value: v.name, label: v.name }))], [variables]);

  const handleRepeatChange = useCallback(
    (val: string | null) => {
      if (val === null) return;
      if (val === '') {
        // None — drop the key entirely (exactOptionalPropertyTypes forbids writing `undefined`;
        // the rest-destructure keeps the removal static, no dynamic delete).
        setDraft(prev => {
          const { repeat: _repeat, ...rest } = prev;
          return rest;
        });
        return;
      }
      updateField('repeat', val);
    },
    [updateField],
  );

  const repeatDirectionValue = useMemo(() => [draft.repeatDirection], [draft.repeatDirection]);

  const handleRepeatDirectionChange = useCallback(
    (values: string[]) => {
      // Single-select ToggleGroup: Base UI hands back an array and lets the active item deselect
      // to an empty one. Direction always has a value, so ignore empty/invalid results.
      const [next] = values;
      if (next === 'h' || next === 'v') updateField('repeatDirection', next);
    },
    [updateField],
  );

  const handleMaxPerRowChange = useCallback(
    (val: string | null) => {
      if (val === null) return;
      const parsed = Number(val);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 24) updateField('maxPerRow', parsed);
    },
    [updateField],
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

          <TransformationsEditor transformations={draft.transformations} onChange={setTransformations} />

          <div className='space-y-3'>
            <Label>Repeat options</Label>

            <div className='space-y-2'>
              <Label htmlFor='panel-repeat' className='text-muted-foreground text-xs font-normal'>
                Repeat by variable
              </Label>
              <Select value={draft.repeat ?? ''} onValueChange={handleRepeatChange} items={repeatItems}>
                <SelectTrigger id='panel-repeat'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {repeatItems.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {draft.repeat !== undefined && (
              <div className='space-y-2'>
                <Label className='text-muted-foreground text-xs font-normal'>Direction</Label>
                <ToggleGroup size='sm' value={repeatDirectionValue} onValueChange={handleRepeatDirectionChange} aria-label='Repeat direction'>
                  <ToggleGroupItem value='h'>Horizontal</ToggleGroupItem>
                  <ToggleGroupItem value='v'>Vertical</ToggleGroupItem>
                </ToggleGroup>
              </div>
            )}

            {draft.repeat !== undefined && draft.repeatDirection === 'h' && (
              <div className='space-y-2'>
                <Label htmlFor='panel-repeat-max-per-row' className='text-muted-foreground text-xs font-normal'>
                  Max per row
                </Label>
                <Select value={String(draft.maxPerRow)} onValueChange={handleMaxPerRowChange} items={MAX_PER_ROW_OPTIONS}>
                  <SelectTrigger id='panel-repeat-max-per-row'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAX_PER_ROW_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <p className='text-muted-foreground text-xs'>Repeats render in view mode — edit mode shows only the source panel.</p>
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
      <Suspense fallback={EDITOR_FALLBACK}>
        <QueryCodeEditor
          datasourceType={datasourceType}
          dialect={dialect}
          schema={schema}
          value={query.expr}
          onChange={handleExprChange}
          onRun={handleRun}
          placeholder={datasourceType === 'sql' ? 'SQL query...' : 'PromQL expression...'}
        />
      </Suspense>
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

// ── Transformations ──────────────────────────────────────────────────────────────────────────
// Panel data transformations (transformation transformationSchema): an ORDERED pipeline edited as
// draft.transformations. Each transform runs in array order, feeding the next (see transform/
// apply.ts), so the editor exposes move-up / move-down per card alongside remove. Each per-type
// options editor narrows on the discriminant `t.id` then spreads `{ ...t, options: { ...t.options,
// … } }`, so the edited value keeps its branch's type — the same no-cast union edit the override
// property rows use; a new transform id forces a new dispatch branch below.

// organize keys rename/exclude by each series' CURRENT derived label, which the editor can't know
// (labels come from query results, absent in the panel draft) — so the source label is free-text.
// The editor owns local row state (the keys are user-typed and may be blank/duplicate mid-edit, so
// re-deriving the record each change avoids a rekey-by-delete) and projects it back to the two
// records on every change. `indexByName` has no UI yet (reorder-by-index is a future iteration); it
// is preserved untouched on the spread so an imported organize round-trips unchanged.
const OrganizeOptionsEditor = ({
  options,
  idPrefix,
  cardLabel,
  onChange,
}: {
  options: Extract<Transformation, { id: 'organize' }>['options'];
  idPrefix: string;
  cardLabel: string;
  onChange: (next: Extract<Transformation, { id: 'organize' }>['options']) => void;
}) => {
  // Seed editable rows once from the incoming records (imported organize → editable rows). The
  // records are the source of truth on save; this local state only backs the in-progress text so a
  // blank or temporarily-duplicate source label stays typeable without churning the parent.
  //
  // KNOWN MVP LIMITATION (organize reorder): rows seed ONCE and the cards key by index, so if a panel
  // has two+ organize transforms and they are reordered relative to each other (move up/down), each
  // organize's rename/exclude rows stay with their old card position until the editor is reopened —
  // the DISPLAY goes stale. The pipeline DATA order is always correct (handleMove swaps the array, so
  // reorder→Apply with no further edit saves correctly); only editing a stale-displayed organize
  // right after such a reorder can mis-apply. Rare (two organize in one panel + reorder + edit) and
  // recoverable (reopen). Deferred per the simpler-organize MVP scope; the clean fix is to re-seed
  // rows from props on a deep-diff against the last emitted value.
  const [renameRows, setRenameRows] = useState<{ from: string; to: string }[]>(() => Object.entries(options.renameByName).map(([from, to]) => ({ from, to })));
  const [excludeRows, setExcludeRows] = useState<string[]>(() => Object.keys(options.excludeByName).filter(label => options.excludeByName[label] === true));

  // Project current rows → the two records, carrying indexByName through untouched. Last write wins
  // for duplicate keys; blank source labels are dropped (they can't match a real series).
  const emit = useCallback(
    (rename: { from: string; to: string }[], exclude: string[]) => {
      const renameByName: Record<string, string> = {};
      for (const row of rename) {
        if (row.from !== '') renameByName[row.from] = row.to;
      }
      const excludeByName: Record<string, boolean> = {};
      for (const label of exclude) {
        if (label !== '') excludeByName[label] = true;
      }
      onChange({ ...options, renameByName, excludeByName });
    },
    [options, onChange],
  );

  const handleAddRename = useCallback(() => {
    setRenameRows(prev => {
      const next = [...prev, { from: '', to: '' }];
      emit(next, excludeRows);
      return next;
    });
  }, [emit, excludeRows]);

  const handleRenameFrom = useCallback(
    (index: number, value: string) => {
      setRenameRows(prev => {
        const next = prev.map((r, i) => (i === index ? { ...r, from: value } : r));
        emit(next, excludeRows);
        return next;
      });
    },
    [emit, excludeRows],
  );

  const handleRenameTo = useCallback(
    (index: number, value: string) => {
      setRenameRows(prev => {
        const next = prev.map((r, i) => (i === index ? { ...r, to: value } : r));
        emit(next, excludeRows);
        return next;
      });
    },
    [emit, excludeRows],
  );

  const handleRemoveRename = useCallback(
    (index: number) => {
      setRenameRows(prev => {
        const next = prev.filter((_, i) => i !== index);
        emit(next, excludeRows);
        return next;
      });
    },
    [emit, excludeRows],
  );

  const handleAddExclude = useCallback(() => {
    setExcludeRows(prev => {
      const next = [...prev, ''];
      emit(renameRows, next);
      return next;
    });
  }, [emit, renameRows]);

  const handleExcludeChange = useCallback(
    (index: number, value: string) => {
      setExcludeRows(prev => {
        const next = prev.map((label, i) => (i === index ? value : label));
        emit(renameRows, next);
        return next;
      });
    },
    [emit, renameRows],
  );

  const handleRemoveExclude = useCallback(
    (index: number) => {
      setExcludeRows(prev => {
        const next = prev.filter((_, i) => i !== index);
        emit(renameRows, next);
        return next;
      });
    },
    [emit, renameRows],
  );

  return (
    <div className='space-y-3'>
      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <Label className='text-muted-foreground text-xs font-normal'>Rename fields</Label>
          <Button variant='ghost' size='xs' onClick={handleAddRename} aria-label={`Add rename to ${cardLabel}`}>
            <Plus className='mr-1 h-3 w-3' />
            Add
          </Button>
        </div>
        {renameRows.length === 0 ? (
          <p className='text-muted-foreground text-xs'>No renames. Add a row to relabel a field by its current name.</p>
        ) : (
          renameRows.map((row, i) => (
            <OrganizeRenameRow
              key={String(i)}
              row={row}
              index={i}
              idPrefix={`${idPrefix}-rename-${String(i)}`}
              cardLabel={cardLabel}
              onFromChange={handleRenameFrom}
              onToChange={handleRenameTo}
              onRemove={handleRemoveRename}
            />
          ))
        )}
      </div>

      <div className='space-y-2'>
        <div className='flex items-center justify-between'>
          <Label className='text-muted-foreground text-xs font-normal'>Exclude fields</Label>
          <Button variant='ghost' size='xs' onClick={handleAddExclude} aria-label={`Add exclude to ${cardLabel}`}>
            <Plus className='mr-1 h-3 w-3' />
            Add
          </Button>
        </div>
        {excludeRows.length === 0 ? (
          <p className='text-muted-foreground text-xs'>No exclusions. Add a field name to drop it from the result.</p>
        ) : (
          excludeRows.map((label, i) => (
            <OrganizeExcludeRow
              key={String(i)}
              value={label}
              index={i}
              idPrefix={`${idPrefix}-exclude-${String(i)}`}
              cardLabel={cardLabel}
              onChange={handleExcludeChange}
              onRemove={handleRemoveExclude}
            />
          ))
        )}
      </div>
    </div>
  );
};

const OrganizeRenameRow = ({
  row,
  index,
  idPrefix,
  cardLabel,
  onFromChange,
  onToChange,
  onRemove,
}: {
  row: { from: string; to: string };
  index: number;
  idPrefix: string;
  cardLabel: string;
  onFromChange: (index: number, value: string) => void;
  onToChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) => {
  const handleFrom = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFromChange(index, e.target.value);
    },
    [index, onFromChange],
  );
  const handleTo = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onToChange(index, e.target.value);
    },
    [index, onToChange],
  );
  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);
  const rowLabel = `${cardLabel} rename ${String(index + 1)}`;

  return (
    <div className='flex items-center gap-2'>
      <Input
        id={`${idPrefix}-from`}
        placeholder='Field name'
        value={row.from}
        onChange={handleFrom}
        className='flex-1 text-sm'
        aria-label={`${rowLabel} field`}
      />
      <span className='text-muted-foreground text-xs' aria-hidden>
        →
      </span>
      <Input id={`${idPrefix}-to`} placeholder='New name' value={row.to} onChange={handleTo} className='flex-1 text-sm' aria-label={`${rowLabel} new name`} />
      <Button variant='ghost' size='icon' className='h-8 w-8 shrink-0' onClick={handleRemove} aria-label={`Remove ${rowLabel}`}>
        <Trash2 className='h-3.5 w-3.5' />
      </Button>
    </div>
  );
};

const OrganizeExcludeRow = ({
  value,
  index,
  idPrefix,
  cardLabel,
  onChange,
  onRemove,
}: {
  value: string;
  index: number;
  idPrefix: string;
  cardLabel: string;
  onChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
}) => {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(index, e.target.value);
    },
    [index, onChange],
  );
  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);
  const rowLabel = `${cardLabel} exclude ${String(index + 1)}`;

  return (
    <div className='flex items-center gap-2'>
      <Input
        id={`${idPrefix}-name`}
        placeholder='Field name'
        value={value}
        onChange={handleChange}
        className='flex-1 text-sm'
        aria-label={`${rowLabel} field`}
      />
      <Button variant='ghost' size='icon' className='h-8 w-8 shrink-0' onClick={handleRemove} aria-label={`Remove ${rowLabel}`}>
        <Trash2 className='h-3.5 w-3.5' />
      </Button>
    </div>
  );
};

// The per-type options editor: dispatches on the discriminant and renders only that branch's
// controls. Every handler narrows on `t.id` first, then spreads `{ ...t, options: { ...t.options,
// … } }` so the edited transform stays a valid member of its branch — no cast, no `any` (the same
// discriminated-union edit OverridePropertyRow uses). `idPrefix`/`cardLabel` namespace the DOM ids
// and accessible names per card so two transforms of the same type never collide.
const TransformationOptions = ({
  transformation,
  idPrefix,
  cardLabel,
  onChange,
}: {
  transformation: Transformation;
  idPrefix: string;
  cardLabel: string;
  onChange: (next: Transformation) => void;
}) => {
  const t = transformation;

  const handleReduceCalc = useCallback(
    (val: string | null) => {
      if (t.id === 'reduce' && isReduceCalc(val)) onChange({ ...t, options: { ...t.options, calc: val } });
    },
    [t, onChange],
  );

  const handleFilterMode = useCallback(
    (val: string | null) => {
      if (t.id === 'filterFieldsByName' && isFilterMode(val)) onChange({ ...t, options: { ...t.options, mode: val } });
    },
    [t, onChange],
  );

  const handleFilterMatch = useCallback(
    (val: string | null) => {
      if (t.id === 'filterFieldsByName' && isFilterMatch(val)) onChange({ ...t, options: { ...t.options, match: val } });
    },
    [t, onChange],
  );

  const handleFilterValue = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (t.id === 'filterFieldsByName') onChange({ ...t, options: { ...t.options, value: e.target.value } });
    },
    [t, onChange],
  );

  const handleOrganizeChange = useCallback(
    (next: Extract<Transformation, { id: 'organize' }>['options']) => {
      if (t.id === 'organize') onChange({ ...t, options: next });
    },
    [t, onChange],
  );

  const handleSortByBy = useCallback(
    (val: string | null) => {
      if (t.id === 'sortBy' && isSortBy(val)) onChange({ ...t, options: { ...t.options, by: val } });
    },
    [t, onChange],
  );

  const handleSortByDesc = useCallback(
    (checked: boolean) => {
      if (t.id === 'sortBy') onChange({ ...t, options: { ...t.options, desc: checked } });
    },
    [t, onChange],
  );

  const handleLimitCount = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (t.id === 'limit') {
        const n = Number(e.target.value);
        onChange({ ...t, options: { ...t.options, count: e.target.value.trim() === '' || Number.isNaN(n) ? 0 : Math.trunc(n) } });
      }
    },
    [t, onChange],
  );

  if (t.id === 'reduce') {
    return (
      <div className='space-y-2'>
        <Label htmlFor={`${idPrefix}-calc`} className='text-muted-foreground text-xs font-normal'>
          Calculation
        </Label>
        <Select value={t.options.calc} onValueChange={handleReduceCalc} items={REDUCE_CALC_OPTIONS}>
          <SelectTrigger id={`${idPrefix}-calc`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REDUCE_CALC_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (t.id === 'filterFieldsByName') {
    return (
      <div className='space-y-2'>
        <div className='grid grid-cols-2 gap-2'>
          <div className='space-y-1'>
            <Label htmlFor={`${idPrefix}-mode`} className='text-muted-foreground text-xs font-normal'>
              Mode
            </Label>
            <Select value={t.options.mode} onValueChange={handleFilterMode} items={FILTER_MODE_OPTIONS}>
              <SelectTrigger id={`${idPrefix}-mode`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER_MODE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1'>
            <Label htmlFor={`${idPrefix}-match`} className='text-muted-foreground text-xs font-normal'>
              Match
            </Label>
            <Select value={t.options.match} onValueChange={handleFilterMatch} items={FILTER_MATCH_OPTIONS}>
              <SelectTrigger id={`${idPrefix}-match`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER_MATCH_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className='space-y-1'>
          <Label htmlFor={`${idPrefix}-value`} className='text-muted-foreground text-xs font-normal'>
            {t.options.match === 'byRegexp' ? 'Pattern' : 'Field name'}
          </Label>
          <Input
            id={`${idPrefix}-value`}
            value={t.options.value}
            onChange={handleFilterValue}
            placeholder={t.options.match === 'byRegexp' ? '/cpu.*/' : 'cpu_usage'}
            className='text-sm'
          />
        </div>
      </div>
    );
  }

  if (t.id === 'organize') {
    return <OrganizeOptionsEditor options={t.options} idPrefix={idPrefix} cardLabel={cardLabel} onChange={handleOrganizeChange} />;
  }

  if (t.id === 'sortBy') {
    return (
      <div className='space-y-3'>
        <div className='space-y-1'>
          <Label htmlFor={`${idPrefix}-by`} className='text-muted-foreground text-xs font-normal'>
            Sort by
          </Label>
          <Select value={t.options.by} onValueChange={handleSortByBy} items={SORT_BY_OPTIONS}>
            <SelectTrigger id={`${idPrefix}-by`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_BY_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='flex items-center gap-2'>
          {/* The visible <Label htmlFor> is the checkbox's accessible name (a single labelling path,
              so getByLabelText resolves to exactly the control); no aria-label, which would duplicate it. */}
          <Checkbox id={`${idPrefix}-desc`} checked={t.options.desc} onCheckedChange={handleSortByDesc} />
          <Label htmlFor={`${idPrefix}-desc`} className='text-muted-foreground cursor-pointer text-xs font-normal'>
            Descending
          </Label>
        </div>
      </div>
    );
  }

  // limit — the remaining branch; the union is exhausted, so `t` narrows to the limit transform
  // here and `t.options.count` is its number. No default/cast needed.
  return (
    <div className='space-y-1'>
      <Label htmlFor={`${idPrefix}-count`} className='text-muted-foreground text-xs font-normal'>
        Limit
      </Label>
      <Input
        id={`${idPrefix}-count`}
        type='number'
        inputMode='numeric'
        step='1'
        min='0'
        value={String(t.options.count)}
        onChange={handleLimitCount}
        className='text-sm'
      />
    </div>
  );
};

// One transform card: a header (index-numbered group name + visible type badge, then move-up /
// move-down / remove icon buttons) over the per-type options editor. The group is named by INDEX
// ("Transformation N"), not by type, so two same-type transforms keep unambiguous accessible names
// (axe + getByRole('group',{name})); the type is shown as visible content inside. move-up/down keep
// the pipeline order (execution order); first-up / last-down are disabled (not hidden) so the
// header layout doesn't jump (matches the field-override card style + the action-group placement).
const TransformationCard = ({
  transformation,
  index,
  count,
  onUpdate,
  onRemove,
  onMove,
}: {
  transformation: Transformation;
  index: number;
  count: number;
  onUpdate: (index: number, next: Transformation) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}) => {
  const cardLabel = `Transformation ${String(index + 1)}`;
  const idPrefix = `transform-${String(index)}`;
  const typeLabel = TRANSFORMATION_LABELS[transformation.id];

  const handleChange = useCallback(
    (next: Transformation) => {
      onUpdate(index, next);
    },
    [index, onUpdate],
  );
  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);
  const handleUp = useCallback(() => {
    onMove(index, -1);
  }, [index, onMove]);
  const handleDown = useCallback(() => {
    onMove(index, 1);
  }, [index, onMove]);

  return (
    // fieldset+legend names the card as a `group` scoped to AT/tests by "Transformation N"; the
    // reused inner controls keep their natural labels without colliding across cards.
    <fieldset className='space-y-3 rounded-md border p-3'>
      <legend className='sr-only'>{cardLabel}</legend>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <span
            className='bg-muted text-muted-foreground inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-xs font-medium tabular-nums'
            aria-hidden
          >
            {index + 1}
          </span>
          <span className='text-xs font-medium'>{typeLabel}</span>
        </div>
        <div className='flex items-center gap-1'>
          <Button variant='ghost' size='icon' className='h-6 w-6 shrink-0' onClick={handleUp} disabled={index === 0} aria-label={`Move ${cardLabel} up`}>
            <ChevronUp className='h-3.5 w-3.5' />
          </Button>
          <Button
            variant='ghost'
            size='icon'
            className='h-6 w-6 shrink-0'
            onClick={handleDown}
            disabled={index === count - 1}
            aria-label={`Move ${cardLabel} down`}
          >
            <ChevronDown className='h-3.5 w-3.5' />
          </Button>
          <Button variant='ghost' size='icon' className='h-6 w-6 shrink-0' onClick={handleRemove} aria-label={`Remove ${cardLabel}`}>
            <X className='h-3 w-3' />
          </Button>
        </div>
      </div>

      <TransformationOptions transformation={transformation} idPrefix={idPrefix} cardLabel={cardLabel} onChange={handleChange} />
    </fieldset>
  );
};

// The "Transformations" section: a header with an "Add transformation" action-menu (a value={null}
// Select of the transform ids, like the override "Add property" menu — appends a fresh transform
// via makeTransformation), then one ordered TransformationCard per entry (or an empty-state hint).
// Owns the immutable add / update / remove / reorder of the array and reports the next array through
// `onChange` (same shape as FieldOverridesEditor) — array order IS execution order (see
// transform/apply.ts), which the move controls edit.
const TransformationsEditor = ({ transformations, onChange }: { transformations: Transformation[]; onChange: (next: Transformation[]) => void }) => {
  const handleAdd = useCallback(
    (val: string | null) => {
      if (isTransformationId(val)) onChange([...transformations, makeTransformation(val)]);
    },
    [transformations, onChange],
  );

  const handleUpdate = useCallback(
    (index: number, next: Transformation) => {
      onChange(transformations.map((t, i) => (i === index ? next : t)));
    },
    [transformations, onChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      onChange(transformations.filter((_, i) => i !== index));
    },
    [transformations, onChange],
  );

  // Swap with the neighbour in `direction`. Read both ends and guard (noUncheckedIndexedAccess —
  // no `!`/cast), then map-swap immutably; an out-of-range target (first-up / last-down) is a
  // no-op, though the buttons are already disabled there.
  const handleMove = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      const current = transformations[index];
      const neighbour = transformations[target];
      if (current === undefined || neighbour === undefined) return;
      onChange(transformations.map((t, i) => (i === index ? neighbour : i === target ? current : t)));
    },
    [transformations, onChange],
  );

  return (
    <div className='space-y-3'>
      <div className='flex items-center justify-between'>
        <Label>Transformations</Label>
        {/* An action menu, not a value picker (same as the override "Add property"): the trigger
            renders fixed children and `value` stays null, so every pick is a null→id change that
            fires onValueChange. `items` is passed per the base-ui-select rule; there's no
            SelectValue to label. */}
        <Select value={null} onValueChange={handleAdd} items={TRANSFORMATION_ID_OPTIONS}>
          <SelectTrigger id='add-transformation' size='sm' aria-label='Add transformation' className='w-auto gap-1'>
            <Plus className='h-3 w-3' />
            <span className='text-xs'>Add transformation</span>
          </SelectTrigger>
          <SelectContent>
            {TRANSFORMATION_ID_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {transformations.length === 0 ? (
        <p className='text-muted-foreground text-xs'>No transformations. Add one to reshape the query results before they render — they run top to bottom.</p>
      ) : (
        transformations.map((t, i) => (
          <TransformationCard
            key={String(i)}
            transformation={t}
            index={i}
            count={transformations.length}
            onUpdate={handleUpdate}
            onRemove={handleRemove}
            onMove={handleMove}
          />
        ))
      )}
    </div>
  );
};
