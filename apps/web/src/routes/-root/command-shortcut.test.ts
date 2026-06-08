import { describe, expect, it } from 'vitest';

import { isCommandPaletteShortcut } from './command-shortcut';

const event = (init: { key: string; metaKey?: boolean; ctrlKey?: boolean }): KeyboardEvent =>
  new KeyboardEvent('keydown', { key: init.key, metaKey: init.metaKey ?? false, ctrlKey: init.ctrlKey ?? false });

describe('isCommandPaletteShortcut', () => {
  it('matches Cmd+K (macOS)', () => {
    expect(isCommandPaletteShortcut(event({ key: 'k', metaKey: true }))).toBe(true);
  });

  it('matches Ctrl+K (Windows/Linux)', () => {
    expect(isCommandPaletteShortcut(event({ key: 'k', ctrlKey: true }))).toBe(true);
  });

  it('matches an uppercase K (e.g. with Shift or caps)', () => {
    expect(isCommandPaletteShortcut(event({ key: 'K', metaKey: true }))).toBe(true);
  });

  it('does not match a bare k with no modifier', () => {
    expect(isCommandPaletteShortcut(event({ key: 'k' }))).toBe(false);
  });

  it('does not match a different key with the modifier', () => {
    expect(isCommandPaletteShortcut(event({ key: 'b', metaKey: true }))).toBe(false);
  });

  it('does not match the modifier alone', () => {
    expect(isCommandPaletteShortcut(event({ key: 'Meta', metaKey: true }))).toBe(false);
  });
});
