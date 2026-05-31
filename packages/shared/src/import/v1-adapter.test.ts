import { describe, expect, it } from 'vitest';

import { importV1 } from './v1-adapter';

const validV1Dashboard = {
  apiVersion: 'v0alpha1',
  kind: 'Dashboard',
  metadata: {
    name: 'my-dashboard',
    namespace: 'default',
  },
  spec: {
    title: 'V1 Dashboard',
    description: 'From V1 format',
    tags: ['v1', 'test'],
    panels: [
      {
        type: 'timeseries',
        title: 'CPU',
        targets: [{ refId: 'A', expr: 'rate(cpu[5m])' }],
        gridPos: { x: 0, y: 0, w: 12, h: 8 },
        fieldConfig: { defaults: { thresholds: { steps: [] } } },
      },
    ],
    templating: { list: [] },
    time: { from: 'now-6h', to: 'now' },
  },
};

describe('importV1', () => {
  describe('valid V1 dashboards', () => {
    it('imports a valid V1 dashboard', () => {
      const result = importV1(validV1Dashboard);

      expect(result.warnings).toEqual([]);
      expect(result.dashboard.title).toBe('V1 Dashboard');
      expect(result.dashboard.description).toBe('From V1 format');
      expect(result.dashboard.tags).toEqual(['v1', 'test']);
      expect(result.dashboard.panels).toHaveLength(1);
      expect(result.dashboard.panels[0]?.type).toBe('timeseries');
      expect(result.dashboard.timeRange).toEqual({ from: 'now-6h', to: 'now', refresh: null });
    });

    it('uses metadata.name when spec title is default', () => {
      const result = importV1({
        ...validV1Dashboard,
        spec: {
          panels: [],
          templating: { list: [] },
          time: { from: 'now-1h', to: 'now' },
        },
      });

      expect(result.dashboard.title).toBe('my-dashboard');
    });

    it('keeps spec title when it differs from default', () => {
      const result = importV1({
        ...validV1Dashboard,
        metadata: { name: 'override-name' },
        spec: {
          ...validV1Dashboard.spec,
          title: 'Explicit Title',
        },
      });

      expect(result.dashboard.title).toBe('Explicit Title');
    });

    it('does not override title when metadata.name is empty', () => {
      const result = importV1({
        ...validV1Dashboard,
        metadata: { name: '' },
        spec: {
          panels: [],
          templating: { list: [] },
          time: { from: 'now-1h', to: 'now' },
        },
      });

      expect(result.dashboard.title).toBe('Imported Dashboard');
    });

    it('passes panels through to classic adapter', () => {
      const result = importV1({
        ...validV1Dashboard,
        spec: {
          ...validV1Dashboard.spec,
          panels: [
            {
              type: 'graph',
              title: 'Old Graph',
              targets: [{ refId: 'A', expr: 'up' }],
              gridPos: { x: 0, y: 0, w: 12, h: 8 },
              fieldConfig: { defaults: { thresholds: { steps: [] } } },
            },
            {
              type: 'heatmap',
              title: 'Unsupported',
              targets: [],
              gridPos: { x: 12, y: 0, w: 12, h: 8 },
              fieldConfig: { defaults: { thresholds: { steps: [] } } },
            },
          ],
        },
      });

      expect(result.dashboard.panels).toHaveLength(2);
      expect(result.dashboard.panels[0]?.type).toBe('timeseries');
      expect(result.dashboard.panels[1]?.type).toBe('stat');
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('heatmap');
    });

    it('passes variables through to classic adapter', () => {
      const result = importV1({
        ...validV1Dashboard,
        spec: {
          ...validV1Dashboard.spec,
          templating: {
            list: [
              {
                name: 'env',
                type: 'query',
                query: 'label_values(env)',
                current: { value: 'prod' },
                options: [{ value: 'prod' }, { value: 'staging' }],
              },
            ],
          },
        },
      });

      expect(result.dashboard.variables).toHaveLength(1);
      expect(result.dashboard.variables[0]?.name).toBe('env');
    });
  });

  describe('fallback to classic parser', () => {
    it('falls back to classic parser when V1 schema fails (missing apiVersion)', () => {
      const classicJson = {
        title: 'Classic Dashboard',
        description: 'Not V1',
        tags: [],
        panels: [
          {
            type: 'stat',
            title: 'Stat Panel',
            targets: [{ refId: 'A', expr: 'up' }],
            gridPos: { x: 0, y: 0, w: 12, h: 8 },
            fieldConfig: { defaults: { thresholds: { steps: [] } } },
          },
        ],
        templating: { list: [] },
        time: { from: 'now-1h', to: 'now' },
      };

      const result = importV1(classicJson);

      expect(result.warnings[0]).toBe(
        'V1 Resource JSON did not match expected schema — falling back to Classic parser',
      );
      expect(result.dashboard.title).toBe('Classic Dashboard');
      expect(result.dashboard.panels).toHaveLength(1);
    });

    it('falls back when kind is not Dashboard', () => {
      const result = importV1({
        apiVersion: 'v1',
        kind: 'Folder',
        spec: validV1Dashboard.spec,
      });

      expect(result.warnings[0]).toBe(
        'V1 Resource JSON did not match expected schema — falling back to Classic parser',
      );
    });

    it('includes classic warnings in fallback', () => {
      const result = importV1({
        title: 123,
      });

      expect(result.warnings).toEqual([
        'V1 Resource JSON did not match expected schema — falling back to Classic parser',
        'Failed to parse Grafana Classic JSON — dashboard may be in an unsupported format',
      ]);
      expect(result.dashboard.title).toBe('Imported Dashboard');
    });
  });
});
