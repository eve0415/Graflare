import { describe, expect, it } from 'vitest';

import { importV2 } from './v2-adapter';

const validV2Dashboard = {
  apiVersion: 'dashboard.grafana.app/v2alpha1',
  metadata: {
    name: 'v2-dashboard',
    labels: { env: 'prod', team: 'infra' },
  },
  spec: {
    title: 'V2 Dashboard',
    description: 'A V2 test dashboard',
    elements: {
      cpu: {
        kind: 'Timeseries',
        spec: {
          title: 'CPU Usage',
          data: {
            queries: [{ refId: 'A', expr: 'rate(cpu[5m])', legendFormat: '{{instance}}' }],
          },
        },
      },
    },
    layout: {
      items: [{ element: 'cpu', x: 0, y: 0, width: 12, height: 8 }],
    },
    variables: [],
  },
};

describe('importV2', () => {
  describe('valid V2 dashboards', () => {
    it('imports a basic V2 dashboard', () => {
      const result = importV2(validV2Dashboard);

      expect(result.warnings).toEqual([]);
      expect(result.dashboard.title).toBe('V2 Dashboard');
      expect(result.dashboard.description).toBe('A V2 test dashboard');
      expect(result.dashboard.tags).toEqual(['env:prod', 'team:infra']);
      expect(result.dashboard.timeRange).toEqual({ from: 'now-1h', to: 'now', refresh: null });
      expect(result.dashboard.panels).toHaveLength(1);
    });

    it('returns correct panel properties', () => {
      const result = importV2(validV2Dashboard);
      const [panel] = result.dashboard.panels;

      expect(panel?.id).toBe('panel-0');
      expect(panel?.type).toBe('timeseries');
      expect(panel?.title).toBe('CPU Usage');
      expect(panel?.description).toBe('');
      expect(panel?.queries).toEqual([{ refId: 'A', expr: 'rate(cpu[5m])', legendFormat: '{{instance}}', format: 'time_series' }]);
      expect(panel?.gridPos).toEqual({ x: 0, y: 0, w: 12, h: 8 });
      expect(panel?.thresholds).toEqual([]);
      expect(panel?.displayOptions).toEqual({});
    });

    it('falls back to metadata.name when spec.title is empty', () => {
      const result = importV2({
        ...validV2Dashboard,
        spec: { ...validV2Dashboard.spec, title: '' },
      });

      expect(result.dashboard.title).toBe('v2-dashboard');
    });

    it('falls back to "Imported Dashboard" when both title and name are empty', () => {
      const result = importV2({
        ...validV2Dashboard,
        metadata: { name: '', labels: {} },
        spec: { ...validV2Dashboard.spec, title: '' },
      });

      expect(result.dashboard.title).toBe('Imported Dashboard');
    });

    it('uses spec.title over metadata.name', () => {
      const result = importV2({
        ...validV2Dashboard,
        metadata: { name: 'metadata-name', labels: {} },
        spec: { ...validV2Dashboard.spec, title: 'Spec Title' },
      });

      expect(result.dashboard.title).toBe('Spec Title');
    });
  });

  describe('panel type handling', () => {
    const makeV2 = (elements: Record<string, { kind: string }>) => ({
      ...validV2Dashboard,
      spec: {
        ...validV2Dashboard.spec,
        elements: Object.fromEntries(
          Object.entries(elements).map(([key, el]) => [
            key,
            {
              kind: el.kind,
              spec: { title: key, data: { queries: [{ refId: 'A', expr: 'up' }] } },
            },
          ]),
        ),
        layout: {
          items: Object.keys(elements).map((key, i) => ({
            element: key,
            x: 0,
            y: i * 8,
            width: 12,
            height: 8,
          })),
        },
      },
    });

    it('supports Timeseries panels (case-insensitive)', () => {
      const result = importV2(makeV2({ a: { kind: 'Timeseries' } }));
      expect(result.dashboard.panels[0]?.type).toBe('timeseries');
      expect(result.warnings).toEqual([]);
    });

    it('supports Stat panels', () => {
      const result = importV2(makeV2({ a: { kind: 'Stat' } }));
      expect(result.dashboard.panels[0]?.type).toBe('stat');
    });

    it('supports Table panels', () => {
      const result = importV2(makeV2({ a: { kind: 'Table' } }));
      expect(result.dashboard.panels[0]?.type).toBe('table');
    });

    it('supports Gauge panels', () => {
      const result = importV2(makeV2({ a: { kind: 'Gauge' } }));
      expect(result.dashboard.panels[0]?.type).toBe('gauge');
    });

    it('supports BarGauge panels (case-insensitive)', () => {
      const result = importV2(makeV2({ a: { kind: 'BarGauge' } }));
      expect(result.dashboard.panels[0]?.type).toBe('bargauge');
      expect(result.warnings).toEqual([]);
    });

    it('supports BarChart panels (case-insensitive)', () => {
      const result = importV2(makeV2({ a: { kind: 'BarChart' } }));
      expect(result.dashboard.panels[0]?.type).toBe('barchart');
      expect(result.warnings).toEqual([]);
    });

    it('maps PieChart panels to pie (case-insensitive)', () => {
      const result = importV2(makeV2({ a: { kind: 'PieChart' } }));
      expect(result.dashboard.panels[0]?.type).toBe('pie');
      expect(result.warnings).toEqual([]);
    });

    it('supports Histogram panels (case-insensitive)', () => {
      const result = importV2(makeV2({ a: { kind: 'Histogram' } }));
      expect(result.dashboard.panels[0]?.type).toBe('histogram');
      expect(result.warnings).toEqual([]);
    });

    it('converts unsupported type to stat with warning', () => {
      const result = importV2(makeV2({ hm: { kind: 'Heatmap' } }));

      expect(result.dashboard.panels).toHaveLength(1);
      expect(result.dashboard.panels[0]?.type).toBe('stat');
      expect(result.warnings).toEqual(['Unsupported panel type "Heatmap" (element "hm") — converted to placeholder stat panel']);
    });
  });

  describe('layout mapping', () => {
    it('applies layout positions from matching items', () => {
      const result = importV2({
        ...validV2Dashboard,
        spec: {
          ...validV2Dashboard.spec,
          elements: {
            panel1: {
              kind: 'Stat',
              spec: { title: 'Panel 1', data: { queries: [] } },
            },
          },
          layout: {
            items: [{ element: 'panel1', x: 6, y: 3, width: 18, height: 10 }],
          },
        },
      });

      expect(result.dashboard.panels[0]?.gridPos).toEqual({ x: 6, y: 3, w: 18, h: 10 });
    });

    it('uses defaults when no layout item matches an element', () => {
      const result = importV2({
        ...validV2Dashboard,
        spec: {
          ...validV2Dashboard.spec,
          elements: {
            orphan: {
              kind: 'Stat',
              spec: { title: 'Orphan', data: { queries: [] } },
            },
          },
          layout: { items: [] },
        },
      });

      expect(result.dashboard.panels[0]?.gridPos).toEqual({ x: 0, y: 0, w: 12, h: 8 });
    });

    it('uses panelIndex * 8 for y when layout item is missing', () => {
      const result = importV2({
        ...validV2Dashboard,
        spec: {
          ...validV2Dashboard.spec,
          elements: {
            first: {
              kind: 'Stat',
              spec: { title: 'First', data: { queries: [] } },
            },
            second: {
              kind: 'Timeseries',
              spec: { title: 'Second', data: { queries: [] } },
            },
          },
          layout: {
            items: [{ element: 'first', x: 0, y: 0, width: 12, height: 8 }],
          },
        },
      });

      expect(result.dashboard.panels[1]?.gridPos.y).toBe(8);
    });

    it('clamps grid positions', () => {
      const result = importV2({
        ...validV2Dashboard,
        spec: {
          ...validV2Dashboard.spec,
          elements: {
            clamped: {
              kind: 'Stat',
              spec: { title: 'Clamped', data: { queries: [] } },
            },
          },
          layout: {
            items: [{ element: 'clamped', x: -5, y: -3, width: 50, height: 200 }],
          },
        },
      });

      expect(result.dashboard.panels[0]?.gridPos).toEqual({ x: 0, y: 0, w: 24, h: 100 });
    });

    it('rounds fractional layout values', () => {
      const result = importV2({
        ...validV2Dashboard,
        spec: {
          ...validV2Dashboard.spec,
          elements: {
            rounded: {
              kind: 'Stat',
              spec: { title: 'Rounded', data: { queries: [] } },
            },
          },
          layout: {
            items: [{ element: 'rounded', x: 1.7, y: 2.3, width: 11.6, height: 7.4 }],
          },
        },
      });

      expect(result.dashboard.panels[0]?.gridPos).toEqual({ x: 2, y: 2, w: 12, h: 7 });
    });
  });

  describe('queries', () => {
    it('maps multiple queries', () => {
      const result = importV2({
        ...validV2Dashboard,
        spec: {
          ...validV2Dashboard.spec,
          elements: {
            multi: {
              kind: 'Timeseries',
              spec: {
                title: 'Multi',
                data: {
                  queries: [
                    { refId: 'A', expr: 'rate(cpu[5m])' },
                    { refId: 'B', expr: 'rate(mem[5m])', legendFormat: '{{pod}}' },
                  ],
                },
              },
            },
          },
        },
      });

      const queries = result.dashboard.panels[0]?.queries;
      expect(queries).toHaveLength(2);
      expect(queries?.[0]?.refId).toBe('A');
      expect(queries?.[1]?.refId).toBe('B');
      expect(queries?.[1]?.legendFormat).toBe('{{pod}}');
    });

    it('generates refId from code point when empty', () => {
      const result = importV2({
        ...validV2Dashboard,
        spec: {
          ...validV2Dashboard.spec,
          elements: {
            auto: {
              kind: 'Stat',
              spec: {
                title: 'Auto',
                data: {
                  queries: [{ expr: 'up' }, { expr: 'down' }],
                },
              },
            },
          },
        },
      });

      const queries = result.dashboard.panels[0]?.queries;
      expect(queries?.[0]?.refId).toBe('A');
      expect(queries?.[1]?.refId).toBe('B');
    });
  });

  describe('panel title fallback', () => {
    it('uses element key when spec.title is empty', () => {
      const result = importV2({
        ...validV2Dashboard,
        spec: {
          ...validV2Dashboard.spec,
          elements: {
            'my-element-key': {
              kind: 'Stat',
              spec: { title: '', data: { queries: [] } },
            },
          },
        },
      });

      expect(result.dashboard.panels[0]?.title).toBe('my-element-key');
    });
  });

  describe('tags from metadata labels', () => {
    it('generates tags from labels', () => {
      const result = importV2({
        ...validV2Dashboard,
        metadata: { name: 'test', labels: { env: 'prod', team: 'platform' } },
      });

      expect(result.dashboard.tags).toEqual(['env:prod', 'team:platform']);
    });

    it('returns empty tags when no labels', () => {
      const result = importV2({
        ...validV2Dashboard,
        metadata: { name: 'test', labels: {} },
      });

      expect(result.dashboard.tags).toEqual([]);
    });
  });

  describe('variables', () => {
    it('maps query-type variable', () => {
      const result = importV2({
        ...validV2Dashboard,
        spec: {
          ...validV2Dashboard.spec,
          variables: [
            {
              name: 'instance',
              type: 'query',
              label: 'Instance',
              query: 'label_values(up, instance)',
              multi: true,
              includeAll: true,
            },
          ],
        },
      });

      expect(result.dashboard.variables).toHaveLength(1);
      const [v] = result.dashboard.variables;
      expect(v?.name).toBe('instance');
      expect(v?.type).toBe('query');
      expect(v?.label).toBe('Instance');
      expect(v?.query).toBe('label_values(up, instance)');
      expect(v?.regex).toBe('');
      expect(v?.sort).toBe('disabled');
      expect(v?.multi).toBe(true);
      expect(v?.includeAll).toBe(true);
      expect(v?.current).toBe('');
      expect(v?.options).toEqual([]);
    });

    it('maps constant-type variable', () => {
      const result = importV2({
        ...validV2Dashboard,
        spec: {
          ...validV2Dashboard.spec,
          variables: [
            {
              name: 'env',
              type: 'constant',
              label: 'Environment',
              query: 'production',
            },
          ],
        },
      });

      expect(result.dashboard.variables[0]?.type).toBe('constant');
    });

    it('maps other types to custom', () => {
      const result = importV2({
        ...validV2Dashboard,
        spec: {
          ...validV2Dashboard.spec,
          variables: [
            {
              name: 'interval',
              type: 'interval',
              label: 'Interval',
              query: '1m,5m',
            },
          ],
        },
      });

      expect(result.dashboard.variables[0]?.type).toBe('custom');
    });

    it('skips variables with empty name', () => {
      const result = importV2({
        ...validV2Dashboard,
        spec: {
          ...validV2Dashboard.spec,
          variables: [{ name: '', type: 'query', label: 'Ghost', query: 'test' }],
        },
      });

      expect(result.dashboard.variables).toEqual([]);
    });
  });

  describe('parse failure', () => {
    it('returns fallback when JSON is invalid V2', () => {
      const result = importV2({});

      expect(result.dashboard.title).toBe('Imported Dashboard');
      expect(result.dashboard.description).toBe('');
      expect(result.dashboard.tags).toEqual([]);
      expect(result.dashboard.panels).toEqual([]);
      expect(result.dashboard.variables).toEqual([]);
      expect(result.dashboard.timeRange).toEqual({ from: 'now-1h', to: 'now', refresh: null });
      expect(result.warnings).toEqual(['Failed to parse Grafana V2 Resource JSON']);
    });

    it('returns fallback when apiVersion is wrong type', () => {
      const result = importV2({ apiVersion: 123 });

      expect(result.warnings).toEqual(['Failed to parse Grafana V2 Resource JSON']);
    });
  });

  describe('mixed elements', () => {
    it('imports dashboard with multiple element types', () => {
      const result = importV2({
        ...validV2Dashboard,
        spec: {
          title: 'Mixed',
          description: '',
          elements: {
            ts: {
              kind: 'Timeseries',
              spec: { title: 'TS', data: { queries: [{ refId: 'A', expr: 'up' }] } },
            },
            st: {
              kind: 'Stat',
              spec: { title: 'ST', data: { queries: [{ refId: 'A', expr: 'count(up)' }] } },
            },
            tb: {
              kind: 'Table',
              spec: { title: 'TB', data: { queries: [{ refId: 'A', expr: 'up' }] } },
            },
            ga: {
              kind: 'Gauge',
              spec: { title: 'GA', data: { queries: [{ refId: 'A', expr: 'up' }] } },
            },
            hm: {
              kind: 'Heatmap',
              spec: { title: 'HM', data: { queries: [] } },
            },
          },
          layout: {
            items: [
              { element: 'ts', x: 0, y: 0, width: 12, height: 8 },
              { element: 'st', x: 12, y: 0, width: 6, height: 4 },
              { element: 'tb', x: 0, y: 8, width: 24, height: 8 },
              { element: 'ga', x: 0, y: 16, width: 6, height: 6 },
              { element: 'hm', x: 6, y: 16, width: 6, height: 6 },
            ],
          },
          variables: [],
        },
      });

      expect(result.dashboard.panels).toHaveLength(5);
      expect(result.dashboard.panels.map(p => p.type)).toEqual(['timeseries', 'stat', 'table', 'gauge', 'stat']);
      expect(result.dashboard.panels.map(p => p.id)).toEqual(['panel-0', 'panel-1', 'panel-2', 'panel-3', 'panel-4']);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Heatmap');
    });
  });
});
