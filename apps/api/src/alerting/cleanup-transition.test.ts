import { describe, expect, it } from 'vitest';

import { cleanupTransition } from './cleanup-transition';

describe('cleanupTransition', () => {
  it('resolves a vanished Firing instance and notifies', () => {
    expect(cleanupTransition('Firing')).toEqual({ state: 'Resolved', notify: true });
  });

  it('settles a vanished Pending instance to Normal WITHOUT notifying', () => {
    // A pending series never fired; emitting a Resolved notification here would alert the
    // user about an alert they never saw fire. Regression guard for that spurious notification.
    expect(cleanupTransition('Pending')).toEqual({ state: 'Normal', notify: false });
  });

  it('leaves already-settled instances unchanged', () => {
    expect(cleanupTransition('Normal')).toBeNull();
    expect(cleanupTransition('Resolved')).toBeNull();
  });
});
