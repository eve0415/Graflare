import { describe, expect, it } from 'vitest';

import { matchLabels } from './matchers';

describe('matchLabels', () => {
  const labels = { alertname: 'HighCPU', severity: 'critical', job: 'api' };

  it('= exact match', () => {
    expect(matchLabels([{ name: 'alertname', operator: '=', value: 'HighCPU' }], labels)).toBe(true);
    expect(matchLabels([{ name: 'alertname', operator: '=', value: 'LowCPU' }], labels)).toBe(false);
  });

  it('!= not equal', () => {
    expect(matchLabels([{ name: 'severity', operator: '!=', value: 'warning' }], labels)).toBe(true);
    expect(matchLabels([{ name: 'severity', operator: '!=', value: 'critical' }], labels)).toBe(false);
  });

  it('=~ regex match', () => {
    expect(matchLabels([{ name: 'alertname', operator: '=~', value: 'High.*' }], labels)).toBe(true);
    expect(matchLabels([{ name: 'alertname', operator: '=~', value: 'Low.*' }], labels)).toBe(false);
  });

  it('!~ regex not match', () => {
    expect(matchLabels([{ name: 'alertname', operator: '!~', value: 'Low.*' }], labels)).toBe(true);
    expect(matchLabels([{ name: 'alertname', operator: '!~', value: 'High.*' }], labels)).toBe(false);
  });

  it('all matchers must match', () => {
    expect(
      matchLabels(
        [
          { name: 'alertname', operator: '=', value: 'HighCPU' },
          { name: 'severity', operator: '=', value: 'critical' },
        ],
        labels,
      ),
    ).toBe(true);

    expect(
      matchLabels(
        [
          { name: 'alertname', operator: '=', value: 'HighCPU' },
          { name: 'severity', operator: '=', value: 'warning' },
        ],
        labels,
      ),
    ).toBe(false);
  });

  it('missing label treated as empty string', () => {
    expect(matchLabels([{ name: 'missing', operator: '=', value: '' }], labels)).toBe(true);
    expect(matchLabels([{ name: 'missing', operator: '=', value: 'something' }], labels)).toBe(false);
  });

  it('empty matchers list matches everything', () => {
    expect(matchLabels([], labels)).toBe(true);
  });

  it('handles invalid regex gracefully', () => {
    expect(matchLabels([{ name: 'alertname', operator: '=~', value: '(unclosed' }], labels)).toBe(false);
  });

  it('regex is anchored (full match)', () => {
    expect(matchLabels([{ name: 'alertname', operator: '=~', value: 'High' }], labels)).toBe(false);
    expect(matchLabels([{ name: 'alertname', operator: '=~', value: 'HighCPU' }], labels)).toBe(true);
  });
});
