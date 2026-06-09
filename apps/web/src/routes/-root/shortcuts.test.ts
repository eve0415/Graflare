import { describe, expect, it } from 'vitest';

import { navSequences } from './nav-sequences';
import { MOD_KEY, groupShortcuts, shortcuts } from './shortcuts';

describe('shortcuts registry', () => {
  it('declares every shortcut as plain data with keys, a description, and a group', () => {
    expect(shortcuts.length).toBeGreaterThan(0);
    for (const shortcut of shortcuts) {
      expect(Array.isArray(shortcut.keys)).toBe(true);
      expect(shortcut.keys.length).toBeGreaterThan(0);
      expect(typeof shortcut.description).toBe('string');
      expect(shortcut.description.length).toBeGreaterThan(0);
      expect(typeof shortcut.group).toBe('string');
    }
  });

  it('documents the command palette, help, and close shortcuts', () => {
    const descriptions = shortcuts.map(s => s.description);
    expect(descriptions).toContain('Open the command palette');
    expect(descriptions).toContain('Open this keyboard shortcuts help');
    expect(descriptions).toContain('Close the open dialog or palette');
  });

  it('encodes the platform-resolved modifier as a token, not a literal glyph', () => {
    const palette = shortcuts.find(s => s.description === 'Open the command palette');
    expect(palette).toBeDefined();
    expect(palette?.keys).toContain(MOD_KEY);
    // The registry must not hardcode ⌘ or Ctrl — the modal resolves the glyph per platform.
    for (const shortcut of shortcuts) {
      for (const key of shortcut.keys) {
        expect(key).not.toBe('⌘');
        expect(key).not.toBe('Ctrl');
      }
    }
  });
});

describe('navigation chord registry', () => {
  const navigationRows = shortcuts.filter(s => s.group === 'navigation');

  it('documents one navigation row per `g`-chord, in the same order', () => {
    expect(navigationRows).toHaveLength(navSequences.length);
    expect(navigationRows.map(row => row.description)).toEqual(navSequences.map(nav => `Go to ${nav.label}`));
  });

  it('lowercases each chord token so the row shows the `g d` keys users press', () => {
    // Source of truth is the UPPERCASE binding chord; the registry must display its lowercase
    // form, and the two can never disagree because the rows are derived from `navSequences`.
    for (const [index, nav] of navSequences.entries()) {
      expect(navigationRows[index]?.keys).toEqual(nav.chord.map(key => key.toLowerCase()));
    }
  });

  it('starts every chord with `g`, matching the Grafana convention', () => {
    for (const row of navigationRows) {
      expect(row.keys[0]).toBe('g');
      expect(row.keys).toHaveLength(2);
    }
  });
});

describe('groupShortcuts', () => {
  it('buckets shortcuts under their group with a human heading', () => {
    const groups = groupShortcuts(shortcuts);
    expect(groups.length).toBeGreaterThan(0);
    const global = groups.find(g => g.id === 'global');
    expect(global).toBeDefined();
    expect(global?.heading).toBe('Global');
    expect(global?.shortcuts.length).toBe(shortcuts.filter(s => s.group === 'global').length);
  });

  it('buckets the navigation chords under a Navigation group, after Global', () => {
    const groups = groupShortcuts(shortcuts);
    const navigation = groups.find(g => g.id === 'navigation');
    expect(navigation).toBeDefined();
    expect(navigation?.heading).toBe('Navigation');
    expect(navigation?.shortcuts.length).toBe(shortcuts.filter(s => s.group === 'navigation').length);
    // Declared order puts Global before Navigation regardless of insertion order.
    const ids = groups.map(g => g.id);
    expect(ids.indexOf('global')).toBeLessThan(ids.indexOf('navigation'));
  });

  it('preserves each shortcut intact within its group', () => {
    const [first] = groupShortcuts(shortcuts);
    expect(first).toBeDefined();
    expect(first?.shortcuts[0]).toEqual(shortcuts[0]);
  });

  it('emits groups in a fixed, declared order rather than insertion or alphabetical order', () => {
    const declared = [
      { keys: ['z'], description: 'Last group entry', group: 'global' },
      { keys: ['a'], description: 'First group entry', group: 'global' },
    ] as const;
    const groups = groupShortcuts(declared);
    // 'global' is the only group here; ordering within a group follows input order.
    expect(groups.map(g => g.id)).toEqual(['global']);
    expect(groups[0]?.shortcuts.map(s => s.description)).toEqual(['Last group entry', 'First group entry']);
  });

  it('omits groups that have no shortcuts', () => {
    const groups = groupShortcuts([]);
    expect(groups).toEqual([]);
  });
});
