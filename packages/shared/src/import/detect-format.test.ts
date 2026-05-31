import { describe, expect, it } from 'vitest';

import { detectFormat } from './detect-format';

describe('detectFormat', () => {
  describe('v2 detection', () => {
    it('returns "v2" for apiVersion starting with "dashboard.grafana.app/v2"', () => {
      expect(detectFormat({ apiVersion: 'dashboard.grafana.app/v2alpha1' })).toBe('v2');
    });

    it('returns "v2" for exact "dashboard.grafana.app/v2" prefix', () => {
      expect(detectFormat({ apiVersion: 'dashboard.grafana.app/v2' })).toBe('v2');
    });

    it('returns "v2" for longer v2 version suffix', () => {
      expect(detectFormat({ apiVersion: 'dashboard.grafana.app/v2beta3' })).toBe('v2');
    });
  });

  describe('v1 detection', () => {
    it('returns "v1" for non-v2 apiVersion with kind=Dashboard', () => {
      expect(detectFormat({ apiVersion: 'v0alpha1', kind: 'Dashboard' })).toBe('v1');
    });

    it('returns "v1" for any apiVersion with kind=Dashboard', () => {
      expect(detectFormat({ apiVersion: 'v1', kind: 'Dashboard' })).toBe('v1');
    });
  });

  describe('classic detection', () => {
    it('returns "classic" when no apiVersion', () => {
      expect(detectFormat({ title: 'My Dashboard', panels: [] })).toBe('classic');
    });

    it('returns "classic" for empty object', () => {
      expect(detectFormat({})).toBe('classic');
    });

    it('returns "classic" when apiVersion is not a string', () => {
      expect(detectFormat({ apiVersion: 123 })).toBe('classic');
    });

    it('returns "classic" when apiVersion is non-v2 and kind is not Dashboard', () => {
      expect(detectFormat({ apiVersion: 'v1', kind: 'Folder' })).toBe('classic');
    });

    it('returns "classic" when apiVersion is non-v2 and kind is missing', () => {
      expect(detectFormat({ apiVersion: 'v1' })).toBe('classic');
    });
  });
});
