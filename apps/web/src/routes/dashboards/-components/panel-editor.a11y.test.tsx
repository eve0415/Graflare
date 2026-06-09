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
});

describe('panel-editor field-overrides a11y', () => {
  it('has no axe violations with multiple populated overrides (labelled controls, unique groups)', async () => {
    const { container } = renderEditor(populatedPanel());
    await expectNoA11yViolations(container);
  });
});
