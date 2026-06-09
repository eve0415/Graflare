/**
 * Whether the client is macOS. Mirrors `@tanstack/react-hotkeys`' `detectPlatform`
 * (checks `navigator.platform` AND `userAgent`) so the displayed ⌘/Ctrl glyph can't drift
 * from the actual `Mod` key binding. Browser-only — it reads `navigator`, so server/SSR
 * callers must supply their own snapshot rather than calling this.
 */
export const isMacPlatform = (): boolean => /mac/i.test(navigator.platform) || /mac/i.test(navigator.userAgent);
