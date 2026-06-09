import { describe, expect, it } from 'vitest';

import { resolveLegendFormat, seriesLabel } from './resolve';

describe('resolveLegendFormat', () => {
  it('replaces multiple tokens with metric label values', () => {
    expect(resolveLegendFormat('{{job}} {{method}}', { job: 'api', method: 'GET' })).toBe('api GET');
  });

  it('preserves literal text between and around tokens', () => {
    expect(resolveLegendFormat('job={{job}} ok', { job: 'api' })).toBe('job=api ok');
  });

  it('trims whitespace inside the braces (Grafana-style)', () => {
    expect(resolveLegendFormat('{{ job }}', { job: 'api' })).toBe('api');
  });

  it('returns null for an empty format', () => {
    expect(resolveLegendFormat('', { __name__: 'up' })).toBeNull();
  });

  it('returns null for a whitespace-only format', () => {
    expect(resolveLegendFormat('   ', { __name__: 'up' })).toBeNull();
  });

  it('returns null when the format is undefined', () => {
    expect(resolveLegendFormat(undefined, { __name__: 'up' })).toBeNull();
  });

  it('resolves an unknown label to empty, yielding null when nothing else remains', () => {
    expect(resolveLegendFormat('{{missing}}', { job: 'api' })).toBeNull();
  });

  it('keeps a non-empty result even when one token is missing', () => {
    expect(resolveLegendFormat('{{job}}-{{missing}}', { job: 'api' })).toBe('api-');
  });

  it('distinguishes two series that differ only outside __name__', () => {
    const a = resolveLegendFormat('{{job}} {{method}}', { __name__: 'http_requests_total', job: 'api', method: 'GET' });
    const b = resolveLegendFormat('{{job}} {{method}}', { __name__: 'http_requests_total', job: 'api', method: 'POST' });
    expect(a).toBe('api GET');
    expect(b).toBe('api POST');
    expect(a).not.toBe(b);
  });
});

describe('seriesLabel', () => {
  it('prefers a resolved legendFormat', () => {
    expect(seriesLabel('{{method}}', { __name__: 'http_requests_total', method: 'GET' }, 0)).toBe('GET');
  });

  it('falls back to __name__ when the format is empty', () => {
    expect(seriesLabel('', { __name__: 'http_requests_total' }, 0)).toBe('http_requests_total');
  });

  it('falls back to __name__ when the format resolves to nothing', () => {
    expect(seriesLabel('{{missing}}', { __name__: 'up' }, 2)).toBe('up');
  });

  it('falls back to a 1-based positional label when neither format nor __name__ apply', () => {
    expect(seriesLabel('', {}, 0)).toBe('Series 1');
    expect(seriesLabel(undefined, { instance: 'localhost' }, 3)).toBe('Series 4');
  });

  it('treats an empty __name__ as absent', () => {
    expect(seriesLabel('', { __name__: '' }, 1)).toBe('Series 2');
  });
});
