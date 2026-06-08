import { describe, expect, it } from 'vitest';

import { importClassic } from './classic-adapter';

const makePanel = (type: string) => ({
  type,
  title: `${type} panel`,
  targets: [{ refId: 'A', expr: 'up' }],
  gridPos: { x: 0, y: 0, w: 12, h: 8 },
  fieldConfig: { defaults: { thresholds: { steps: [] } } },
});

const minimalDashboard = {
  title: 'Test Dashboard',
  description: 'A test',
  tags: ['env:prod', 'team:infra'],
  panels: [
    {
      type: 'timeseries',
      title: 'CPU Usage',
      description: 'CPU over time',
      targets: [{ refId: 'A', expr: 'rate(cpu[5m])', legendFormat: '{{instance}}' }],
      gridPos: { x: 0, y: 0, w: 12, h: 8 },
      fieldConfig: { defaults: { thresholds: { steps: [{ value: null, color: 'green' }] } } },
    },
  ],
  templating: { list: [] },
  time: { from: 'now-6h', to: 'now' },
};

describe('importClassic', () => {
  describe('valid dashboards', () => {
    it('imports a minimal dashboard', () => {
      const result = importClassic(minimalDashboard);

      expect(result.warnings).toEqual([]);
      expect(result.dashboard.title).toBe('Test Dashboard');
      expect(result.dashboard.description).toBe('A test');
      expect(result.dashboard.tags).toEqual(['env:prod', 'team:infra']);
      expect(result.dashboard.timeRange).toEqual({ from: 'now-6h', to: 'now', refresh: null });
      expect(result.dashboard.panels).toHaveLength(1);
    });

    it('returns correct panel properties', () => {
      const result = importClassic(minimalDashboard);
      const [panel] = result.dashboard.panels;

      expect(panel).toBeDefined();
      expect(panel?.id).toBe('panel-0');
      expect(panel?.type).toBe('timeseries');
      expect(panel?.title).toBe('CPU Usage');
      expect(panel?.description).toBe('CPU over time');
      expect(panel?.queries).toEqual([{ refId: 'A', expr: 'rate(cpu[5m])', legendFormat: '{{instance}}', format: 'time_series' }]);
      expect(panel?.gridPos).toEqual({ x: 0, y: 0, w: 12, h: 8 });
      expect(panel?.thresholds).toEqual([{ value: 0, color: 'green' }]);
      expect(panel?.displayOptions).toEqual({});
    });

    it('imports an empty dashboard (no panels, no variables)', () => {
      const result = importClassic({});

      expect(result.warnings).toEqual([]);
      expect(result.dashboard.title).toBe('Imported Dashboard');
      expect(result.dashboard.description).toBe('');
      expect(result.dashboard.tags).toEqual([]);
      expect(result.dashboard.panels).toEqual([]);
      expect(result.dashboard.variables).toEqual([]);
      expect(result.dashboard.timeRange).toEqual({ from: 'now-1h', to: 'now', refresh: null });
    });
  });

  describe('panel type mapping', () => {
    it('maps "graph" to "timeseries"', () => {
      const result = importClassic({ ...minimalDashboard, panels: [makePanel('graph')] });
      expect(result.dashboard.panels[0]?.type).toBe('timeseries');
      expect(result.warnings).toEqual([]);
    });

    it('keeps "timeseries" as "timeseries"', () => {
      const result = importClassic({ ...minimalDashboard, panels: [makePanel('timeseries')] });
      expect(result.dashboard.panels[0]?.type).toBe('timeseries');
    });

    it('maps "singlestat" to "stat"', () => {
      const result = importClassic({ ...minimalDashboard, panels: [makePanel('singlestat')] });
      expect(result.dashboard.panels[0]?.type).toBe('stat');
    });

    it('keeps "stat" as "stat"', () => {
      const result = importClassic({ ...minimalDashboard, panels: [makePanel('stat')] });
      expect(result.dashboard.panels[0]?.type).toBe('stat');
    });

    it('keeps "table" as "table"', () => {
      const result = importClassic({ ...minimalDashboard, panels: [makePanel('table')] });
      expect(result.dashboard.panels[0]?.type).toBe('table');
    });

    it('maps "table-old" to "table"', () => {
      const result = importClassic({ ...minimalDashboard, panels: [makePanel('table-old')] });
      expect(result.dashboard.panels[0]?.type).toBe('table');
    });

    it('keeps "gauge" as "gauge"', () => {
      const result = importClassic({ ...minimalDashboard, panels: [makePanel('gauge')] });
      expect(result.dashboard.panels[0]?.type).toBe('gauge');
    });

    it('maps "bargauge" to "gauge"', () => {
      const result = importClassic({ ...minimalDashboard, panels: [makePanel('bargauge')] });
      expect(result.dashboard.panels[0]?.type).toBe('gauge');
    });
  });

  describe('unsupported panel types', () => {
    it('converts unsupported type to stat with warning (titled panel)', () => {
      const result = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'heatmap',
            title: 'My Heatmap',
            targets: [{ refId: 'A', expr: 'up' }],
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });

      expect(result.dashboard.panels).toHaveLength(1);
      expect(result.dashboard.panels[0]?.type).toBe('stat');
      expect(result.warnings).toEqual(['Unsupported panel type "heatmap" (panel "My Heatmap") — converted to placeholder stat panel']);
    });

    it('uses fallback panel name when title is empty', () => {
      const result = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'heatmap',
            title: '',
            targets: [],
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });

      expect(result.warnings).toEqual(['Unsupported panel type "heatmap" (panel "Panel 0") — converted to placeholder stat panel']);
    });

    it('falls through PANEL_TYPE_MAP for unknown types', () => {
      const result = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'piechart',
            title: 'Pie',
            targets: [],
            gridPos: { x: 0, y: 0, w: 6, h: 4 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });

      expect(result.dashboard.panels[0]?.type).toBe('stat');
      expect(result.warnings[0]).toContain('piechart');
    });
  });

  describe('row panels with nested panels', () => {
    it('extracts nested panels from row type panels', () => {
      const result = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'row',
            title: 'Row 1',
            panels: [
              {
                type: 'timeseries',
                title: 'Nested 1',
                targets: [{ refId: 'A', expr: 'up' }],
                gridPos: { x: 0, y: 1, w: 12, h: 8 },
                fieldConfig: { defaults: { thresholds: { steps: [] } } },
              },
              {
                type: 'stat',
                title: 'Nested 2',
                targets: [{ refId: 'B', expr: 'sum(up)' }],
                gridPos: { x: 12, y: 1, w: 12, h: 8 },
                fieldConfig: { defaults: { thresholds: { steps: [] } } },
              },
            ],
            targets: [],
            gridPos: { x: 0, y: 0, w: 24, h: 1 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });

      expect(result.dashboard.panels).toHaveLength(2);
      expect(result.dashboard.panels[0]?.title).toBe('Nested 1');
      expect(result.dashboard.panels[0]?.id).toBe('panel-0');
      expect(result.dashboard.panels[1]?.title).toBe('Nested 2');
      expect(result.dashboard.panels[1]?.id).toBe('panel-1');
    });

    it('handles rows with unsupported nested panels', () => {
      const result = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'row',
            title: 'Row',
            panels: [
              {
                type: 'heatmap',
                title: 'Nested Heatmap',
                targets: [],
                gridPos: { x: 0, y: 0, w: 12, h: 8 },
                fieldConfig: { defaults: { thresholds: { steps: [] } } },
              },
            ],
            targets: [],
            gridPos: { x: 0, y: 0, w: 24, h: 1 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });

      expect(result.dashboard.panels).toHaveLength(1);
      expect(result.dashboard.panels[0]?.type).toBe('stat');
      expect(result.warnings[0]).toContain('heatmap');
    });
  });

  describe('queries', () => {
    it('maps multiple queries', () => {
      const result = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'timeseries',
            title: 'Multi-query',
            targets: [
              { refId: 'A', expr: 'rate(cpu[5m])' },
              { refId: 'B', expr: 'rate(mem[5m])', legendFormat: '{{pod}}' },
            ],
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });

      const queries = result.dashboard.panels[0]?.queries;
      expect(queries).toHaveLength(2);
      expect(queries?.[0]?.refId).toBe('A');
      expect(queries?.[1]?.refId).toBe('B');
      expect(queries?.[1]?.legendFormat).toBe('{{pod}}');
    });

    it('generates refId from code point when empty', () => {
      const result = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'timeseries',
            title: 'Auto refId',
            targets: [{ expr: 'up' }, { expr: 'down' }],
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });

      const queries = result.dashboard.panels[0]?.queries;
      expect(queries?.[0]?.refId).toBe('A');
      expect(queries?.[1]?.refId).toBe('B');
    });
  });

  describe('gridPos clamping', () => {
    it('clamps x to [0, 23]', () => {
      const result = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'stat',
            title: 'Clamped',
            targets: [],
            gridPos: { x: -5, y: 0, w: 12, h: 8 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });
      expect(result.dashboard.panels[0]?.gridPos.x).toBe(0);

      const result2 = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'stat',
            title: 'Clamped',
            targets: [],
            gridPos: { x: 30, y: 0, w: 12, h: 8 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });
      expect(result2.dashboard.panels[0]?.gridPos.x).toBe(23);
    });

    it('clamps y to >= 0', () => {
      const result = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'stat',
            title: 'Clamped',
            targets: [],
            gridPos: { x: 0, y: -10, w: 12, h: 8 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });
      expect(result.dashboard.panels[0]?.gridPos.y).toBe(0);
    });

    it('clamps w to [1, 24]', () => {
      const result = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'stat',
            title: 'Clamped',
            targets: [],
            gridPos: { x: 0, y: 0, w: 0, h: 8 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });
      expect(result.dashboard.panels[0]?.gridPos.w).toBe(1);

      const result2 = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'stat',
            title: 'Clamped',
            targets: [],
            gridPos: { x: 0, y: 0, w: 50, h: 8 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });
      expect(result2.dashboard.panels[0]?.gridPos.w).toBe(24);
    });

    it('clamps h to [1, 100]', () => {
      const result = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'stat',
            title: 'Clamped',
            targets: [],
            gridPos: { x: 0, y: 0, w: 12, h: 0 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });
      expect(result.dashboard.panels[0]?.gridPos.h).toBe(1);

      const result2 = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'stat',
            title: 'Clamped',
            targets: [],
            gridPos: { x: 0, y: 0, w: 12, h: 200 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });
      expect(result2.dashboard.panels[0]?.gridPos.h).toBe(100);
    });

    it('rounds fractional grid positions', () => {
      const result = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'stat',
            title: 'Rounded',
            targets: [],
            gridPos: { x: 1.7, y: 2.3, w: 11.6, h: 7.4 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });
      expect(result.dashboard.panels[0]?.gridPos).toEqual({ x: 2, y: 2, w: 12, h: 7 });
    });
  });

  describe('thresholds', () => {
    it('maps threshold steps with null value to 0', () => {
      const result = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'stat',
            title: 'Thresholds',
            targets: [],
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            fieldConfig: {
              defaults: {
                thresholds: {
                  steps: [
                    { value: null, color: 'green' },
                    { value: 80, color: 'red' },
                  ],
                },
              },
            },
          },
        ],
      });

      expect(result.dashboard.panels[0]?.thresholds).toEqual([
        { value: 0, color: 'green' },
        { value: 80, color: 'red' },
      ]);
    });

    it('maps threshold steps with numeric values', () => {
      const result = importClassic({
        ...minimalDashboard,
        panels: [
          {
            type: 'gauge',
            title: 'Gauge',
            targets: [],
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            fieldConfig: {
              defaults: {
                thresholds: {
                  steps: [
                    { value: 0, color: 'green' },
                    { value: 50, color: 'yellow' },
                    { value: 90, color: 'red' },
                  ],
                },
              },
            },
          },
        ],
      });

      expect(result.dashboard.panels[0]?.thresholds).toEqual([
        { value: 0, color: 'green' },
        { value: 50, color: 'yellow' },
        { value: 90, color: 'red' },
      ]);
    });
  });

  describe('template variables', () => {
    it('maps query-type variable', () => {
      const result = importClassic({
        ...minimalDashboard,
        templating: {
          list: [
            {
              name: 'instance',
              type: 'query',
              label: 'Instance',
              query: 'label_values(up, instance)',
              regex: '/.*/',
              multi: true,
              includeAll: true,
              current: { value: 'localhost:9090' },
              options: [{ value: 'localhost:9090' }, { value: 'localhost:9091' }],
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
      expect(v?.regex).toBe('/.*/');
      expect(v?.multi).toBe(true);
      expect(v?.includeAll).toBe(true);
      expect(v?.current).toBe('localhost:9090');
      expect(v?.options).toEqual(['localhost:9090', 'localhost:9091']);
    });

    it('maps constant-type variable', () => {
      const result = importClassic({
        ...minimalDashboard,
        templating: {
          list: [
            {
              name: 'env',
              type: 'constant',
              query: 'production',
              current: { value: 'production' },
              options: [],
            },
          ],
        },
      });

      expect(result.dashboard.variables[0]?.type).toBe('constant');
    });

    it('maps other variable types to "custom"', () => {
      const result = importClassic({
        ...minimalDashboard,
        templating: {
          list: [
            {
              name: 'interval',
              type: 'interval',
              query: '1m,5m,15m',
              current: { value: '5m' },
              options: [],
            },
          ],
        },
      });

      expect(result.dashboard.variables[0]?.type).toBe('custom');
    });

    it('skips variables with empty name', () => {
      const result = importClassic({
        ...minimalDashboard,
        templating: {
          list: [
            {
              name: '',
              type: 'query',
              query: 'test',
              current: { value: '' },
              options: [],
            },
          ],
        },
      });

      expect(result.dashboard.variables).toEqual([]);
    });

    it('handles null label', () => {
      const result = importClassic({
        ...minimalDashboard,
        templating: {
          list: [
            {
              name: 'var',
              type: 'custom',
              label: null,
              query: 'a,b,c',
              current: { value: 'a' },
              options: [],
            },
          ],
        },
      });

      expect(result.dashboard.variables[0]?.label).toBe('');
    });

    it('handles query as object (converted to empty string)', () => {
      const result = importClassic({
        ...minimalDashboard,
        templating: {
          list: [
            {
              name: 'datasource',
              type: 'datasource',
              query: { type: 'prometheus' },
              current: { value: 'default' },
              options: [],
            },
          ],
        },
      });

      expect(result.dashboard.variables[0]?.query).toBe('');
    });

    it('joins array current.value with commas', () => {
      const result = importClassic({
        ...minimalDashboard,
        templating: {
          list: [
            {
              name: 'hosts',
              type: 'query',
              query: 'label_values(host)',
              multi: true,
              current: { value: ['host-a', 'host-b', 'host-c'] },
              options: [],
            },
          ],
        },
      });

      expect(result.dashboard.variables[0]?.current).toBe('host-a,host-b,host-c');
    });

    it('sets sort to disabled', () => {
      const result = importClassic({
        ...minimalDashboard,
        templating: {
          list: [
            {
              name: 'v',
              type: 'query',
              query: 'test',
              current: { value: '' },
              options: [],
            },
          ],
        },
      });

      expect(result.dashboard.variables[0]?.sort).toBe('disabled');
    });
  });

  describe('special characters', () => {
    it('preserves special characters in titles', () => {
      const result = importClassic({
        ...minimalDashboard,
        title: 'Dashboard <"test"> & more — ñ',
        panels: [
          {
            type: 'stat',
            title: 'Panel / with "quotes" & <brackets>',
            targets: [],
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
      });

      expect(result.dashboard.title).toBe('Dashboard <"test"> & more — ñ');
      expect(result.dashboard.panels[0]?.title).toBe('Panel / with "quotes" & <brackets>');
    });
  });

  describe('parse failure', () => {
    it('returns fallback when JSON does not match schema', () => {
      const result = importClassic({ title: 123 });

      expect(result.dashboard.title).toBe('Imported Dashboard');
      expect(result.dashboard.description).toBe('');
      expect(result.dashboard.tags).toEqual([]);
      expect(result.dashboard.panels).toEqual([]);
      expect(result.dashboard.variables).toEqual([]);
      expect(result.dashboard.timeRange).toEqual({ from: 'now-1h', to: 'now', refresh: null });
      expect(result.warnings).toEqual(['Failed to parse Grafana Classic JSON — dashboard may be in an unsupported format']);
    });
  });

  describe('mixed panels', () => {
    it('imports dashboard with all supported types and rows', () => {
      const result = importClassic({
        title: 'Full Dashboard',
        description: 'All types',
        tags: ['test'],
        panels: [
          {
            type: 'timeseries',
            title: 'Time',
            targets: [{ refId: 'A', expr: 'up' }],
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
          {
            type: 'stat',
            title: 'Stat',
            targets: [{ refId: 'A', expr: 'count(up)' }],
            gridPos: { x: 12, y: 0, w: 6, h: 4 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
          {
            type: 'table',
            title: 'Table',
            targets: [{ refId: 'A', expr: 'up' }],
            gridPos: { x: 0, y: 8, w: 24, h: 8 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
          {
            type: 'gauge',
            title: 'Gauge',
            targets: [{ refId: 'A', expr: 'up' }],
            gridPos: { x: 0, y: 16, w: 6, h: 6 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
          {
            type: 'row',
            title: 'Row',
            panels: [
              {
                type: 'graph',
                title: 'Old Graph',
                targets: [{ refId: 'A', expr: 'up' }],
                gridPos: { x: 0, y: 17, w: 12, h: 8 },
                fieldConfig: { defaults: { thresholds: { steps: [] } } },
              },
            ],
            targets: [],
            gridPos: { x: 0, y: 16, w: 24, h: 1 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
          {
            type: 'heatmap',
            title: 'Unsupported',
            targets: [],
            gridPos: { x: 0, y: 25, w: 12, h: 8 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
        templating: { list: [] },
        time: { from: 'now-1h', to: 'now' },
      });

      expect(result.dashboard.panels).toHaveLength(6);
      expect(result.dashboard.panels.map(p => p.type)).toEqual(['timeseries', 'stat', 'table', 'gauge', 'timeseries', 'stat']);
      expect(result.dashboard.panels.map(p => p.id)).toEqual(['panel-0', 'panel-1', 'panel-2', 'panel-3', 'panel-4', 'panel-5']);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('heatmap');
    });
  });
});
