import type { Annotation } from '@graflare/shared/schemas/annotation';
import type { Panel } from '@graflare/shared/schemas/panel';
import type { Variable } from '@graflare/shared/schemas/variable';

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PanelRenderer } from './panel-renderer';
import { TablePanel } from './table-panel';

// Mock the leaf panel so we can inspect exactly which queries PanelRenderer hands it.
vi.mock('./table-panel', () => ({ TablePanel: vi.fn<() => null>(() => null) }));

const PROM_DS = '11111111-1111-4111-8111-111111111111';

const tablePanel = (expr: string, datasourceId?: string): Panel => ({
  id: 'p1',
  type: 'table',
  title: 'T',
  description: '',
  datasourceId,
  queries: [{ refId: 'A', expr, legendFormat: '', format: 'time_series' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  thresholds: [],
  displayOptions: {},
  fieldConfig: { defaults: { unit: '', mappings: [] }, overrides: [] },
  transformations: [],
  repeatDirection: 'h',
  maxPerRow: 4,
});

const titledPanel = (title: string): Panel => ({ ...tablePanel('up'), title });

const adhocVar = (datasourceId: string, filters: Variable['filters']): Variable => ({
  name: 'f',
  type: 'adhoc',
  label: '',
  datasourceId,
  query: '',
  regex: '',
  sort: 'disabled',
  multi: false,
  includeAll: false,
  current: '',
  allValue: '',
  options: [],
  filters,
});

const timeRange = { from: 'now-1h', to: 'now' };
const noAnnotations: Annotation[] = [];
const noAdhoc: readonly Variable[] = [];
const jobVars = new Map<string, string | string[]>([['job', 'node']]);
// Hoisted so the array/map props keep a stable identity (react-perf lint).
const adhocMatching: readonly Variable[] = [adhocVar(PROM_DS, [{ key: 'env', operator: '=', value: 'prod' }])];
const adhocOtherDs: readonly Variable[] = [adhocVar('99999999-9999-4999-8999-999999999999', [{ key: 'env', operator: '=', value: 'prod' }])];

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
        variables={jobVars}
        adhocVariables={noAdhoc}
        annotations={noAnnotations}
      />,
    );
    const props = vi.mocked(TablePanel).mock.calls[0]?.[0];
    expect(props?.panel.queries[0]?.expr).toBe('up{job="node"}');
  });

  it('interpolates the displayed panel title against the same values map', () => {
    render(
      <PanelRenderer
        panel={titledPanel('CPU $job')}
        timeRange={timeRange}
        refetchInterval={false}
        width={100}
        height={100}
        variables={jobVars}
        adhocVariables={noAdhoc}
        annotations={noAnnotations}
      />,
    );
    const props = vi.mocked(TablePanel).mock.calls[0]?.[0];
    expect(props?.panel.title).toBe('CPU node');
  });

  it('leaves the original panel title raw (display-only interpolation)', () => {
    const panel = titledPanel('CPU $job');
    render(
      <PanelRenderer
        panel={panel}
        timeRange={timeRange}
        refetchInterval={false}
        width={100}
        height={100}
        variables={jobVars}
        adhocVariables={noAdhoc}
        annotations={noAnnotations}
      />,
    );
    expect(panel.title).toBe('CPU $job');
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
        variables={jobVars}
        adhocVariables={noAdhoc}
        annotations={noAnnotations}
      />,
    );
    expect(panel.queries[0]?.expr).toBe('up{job="$job"}');
  });

  it('injects an adhoc filter scoped to the panel datasource after interpolation', () => {
    render(
      <PanelRenderer
        panel={tablePanel('up{job="$job"}', PROM_DS)}
        timeRange={timeRange}
        refetchInterval={false}
        width={100}
        height={100}
        variables={jobVars}
        adhocVariables={adhocMatching}
        annotations={noAnnotations}
      />,
    );
    const props = vi.mocked(TablePanel).mock.calls[0]?.[0];
    expect(props?.panel.queries[0]?.expr).toBe('up{job="node",env="prod"}');
  });

  it('does NOT inject an adhoc filter scoped to a different datasource (byte-identical query)', () => {
    render(
      <PanelRenderer
        panel={tablePanel('up{job="$job"}', PROM_DS)}
        timeRange={timeRange}
        refetchInterval={false}
        width={100}
        height={100}
        variables={jobVars}
        adhocVariables={adhocOtherDs}
        annotations={noAnnotations}
      />,
    );
    const props = vi.mocked(TablePanel).mock.calls[0]?.[0];
    // The filter targets a different datasource → the query is exactly the interpolation-only result.
    expect(props?.panel.queries[0]?.expr).toBe('up{job="node"}');
  });
});
