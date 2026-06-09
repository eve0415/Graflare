import type { Panel } from '@graflare/shared/schemas/panel';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, it } from 'vitest';

import { expectNoA11yViolations } from '../../../../tests/a11y';

import { PanelEditor } from './panel-editor';

afterEach(cleanup);

const noop = (): void => {};

const renderEditor = (panel: Panel) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PanelEditor panel={panel} open onClose={noop} onSave={noop} />
    </QueryClientProvider>,
  );
};

// A populated editor — multiple overrides, each carrying several property kinds (unit, the two
// numeric kinds, and a nested mappings sub-editor) — so axe exercises the real collision surface:
// the reused Standard-options controls (unit Select / numeric inputs / mappings rows) appear many
// times over, and a per-override fieldset/legend must keep their accessible names unambiguous and
// their label/control associations and DOM ids unique. An empty-overrides render would pass
// trivially and prove nothing.
const populatedPanel = (): Panel => ({
  id: 'p1',
  type: 'table',
  title: 'Populated',
  description: '',
  queries: [],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [{ value: 10, color: '#ef4444' }],
  displayOptions: {},
  fieldConfig: {
    defaults: { unit: 'percent', decimals: 1, min: 0, max: 100, mappings: [{ type: 'value', value: 'up', result: { text: 'Up', color: '#22c55e' } }] },
    overrides: [
      {
        matcher: { id: 'byName', options: 'cpu' },
        properties: [
          { id: 'unit', value: 'bytes' },
          { id: 'decimals', value: 2 },
          { id: 'min', value: 0 },
        ],
      },
      {
        matcher: { id: 'byRegexp', options: '/mem.*/' },
        properties: [
          { id: 'max', value: 1000 },
          { id: 'mappings', value: [{ type: 'range', from: 0, to: 9, result: { text: 'low' } }] },
        ],
      },
    ],
  },
  // A full transformation pipeline: every transform type at least once, plus a SECOND reduce so the
  // index-based "Transformation N" group names (not type-based) are exercised against the collision
  // axe would catch — two same-type cards, reused per-type controls (calc Select, organize's nested
  // rename/exclude rows, the desc Checkbox), move-up/down + remove buttons must all keep unique
  // accessible names and DOM ids. An empty list would pass trivially.
  transformations: [
    { id: 'reduce', options: { calc: 'mean' } },
    { id: 'filterFieldsByName', options: { mode: 'exclude', match: 'byRegexp', value: '/cpu.*/' } },
    { id: 'organize', options: { excludeByName: { mem: true }, renameByName: { cpu: 'CPU' }, indexByName: {} } },
    { id: 'sortBy', options: { by: 'value', desc: true } },
    { id: 'limit', options: { count: 5 } },
    { id: 'reduce', options: { calc: 'last' } },
  ],
});

describe('panel-editor field-overrides + transformations a11y', () => {
  it('has no axe violations with multiple populated overrides + a full transform pipeline (labelled controls, unique index-named groups)', async () => {
    const { container } = renderEditor(populatedPanel());
    await expectNoA11yViolations(container);
  });
});
