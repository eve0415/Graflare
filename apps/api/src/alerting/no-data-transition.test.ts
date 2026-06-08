import { describe, expect, it } from 'vitest';

import { noDataTransition } from './no-data-transition';

describe('noDataTransition', () => {
  it('keeps every instance unchanged for KeepLastState', () => {
    expect(noDataTransition('KeepLastState', 'Firing')).toBeNull();
    expect(noDataTransition('KeepLastState', 'Normal')).toBeNull();
  });

  it('escalates non-firing instances to Firing and notifies for Alerting', () => {
    expect(noDataTransition('Alerting', 'Normal')).toEqual({ state: 'Firing', notify: true });
    expect(noDataTransition('Alerting', 'Pending')).toEqual({ state: 'Firing', notify: true });
    expect(noDataTransition('Alerting', 'Resolved')).toEqual({ state: 'Firing', notify: true });
  });

  it('leaves an already-firing instance unchanged for Alerting (no re-notify)', () => {
    expect(noDataTransition('Alerting', 'Firing')).toBeNull();
  });

  it('resolves a firing instance and notifies for OK', () => {
    expect(noDataTransition('OK', 'Firing')).toEqual({ state: 'Resolved', notify: true });
  });

  it('clears pending/resolved instances to Normal without notifying for OK', () => {
    expect(noDataTransition('OK', 'Pending')).toEqual({ state: 'Normal', notify: false });
    expect(noDataTransition('OK', 'Resolved')).toEqual({ state: 'Normal', notify: false });
  });

  it('leaves an already-normal instance unchanged for OK', () => {
    expect(noDataTransition('OK', 'Normal')).toBeNull();
  });
});
