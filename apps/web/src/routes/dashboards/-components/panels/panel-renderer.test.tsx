import type { Annotation } from '@graflare/shared/schemas/annotation';
import type { Panel } from '@graflare/shared/schemas/panel';

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PanelRenderer } from './panel-renderer';
import { TablePanel } from './table-panel';

// Mock the leaf panel so we can inspect exactly which queries PanelRenderer hands it.
vi.mock('./table-panel', () => ({ TablePanel: vi.fn<() => null>(() => null) }));

const tablePanel = (expr: string): Panel => ({
  id: 'p1',
  type: 'table',
  title: 'T',
  description: '',
  queries: [{ refId: 'A', expr, legendFormat: '', format: 'time_series' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: {},
  fieldConfig: { defaults: { unit: '', mappings: [] }, overrides: [] },
});

const timeRange = { from: 'now-1h', to: 'now' };
const noAnnotations: Annotation[] = [];

afterEach(() => {
  vi.mocked(TablePanel).mockClear();
});

describe('panel-renderer', () => {
  it('interpolates dashboard variables into the queries handed to the panel', () => {
    render(
      <PanelRenderer
        panel={tablePanel('up{job="$job"}')}
        timeRange={timeRange}
        refetchInterval={false}
        width={100}
        height={100}
        variables={new Map([['job', 'node']])}
        annotations={noAnnotations}
      />,
    );
    const props = vi.mocked(TablePanel).mock.calls[0]?.[0];
    expect(props?.panel.queries[0]?.expr).toBe('up{job="node"}');
  });

  it('leaves the original panel queries raw so editing/saving is unaffected', () => {
    const panel = tablePanel('up{job="$job"}');
    render(
      <PanelRenderer
        panel={panel}
        timeRange={timeRange}
        refetchInterval={false}
        width={100}
        height={100}
        variables={new Map([['job', 'node']])}
        annotations={noAnnotations}
      />,
    );
    expect(panel.queries[0]?.expr).toBe('up{job="$job"}');
  });
});
