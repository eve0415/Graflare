import axe from 'axe-core';

/**
 * Fails the test with a readable list if axe-core finds any WCAG violations in
 * `container`. jsdom performs no layout, so layout-dependent rules (notably
 * `color-contrast`) cannot run here and are NOT covered — those belong to the
 * browser / dev-server pass. This catches the structural a11y axe CAN check in
 * jsdom: roles, accessible names, label/control associations, ARIA misuse, and
 * duplicate ids.
 */
export const expectNoA11yViolations = async (container: Element): Promise<void> => {
  // Base UI portals (Dialog/Sheet/Popover) render internal focus-trap sentinels marked
  // `[data-base-ui-focus-guard]`. Under jsdom — which Base UI misdetects as Safari via its
  // `vendor: "Apple Computer, Inc."` — those sentinels get `role="button"` with no accessible
  // name, a false positive that never occurs in a real non-Safari browser (there they keep
  // `aria-hidden`). They are framework internals, not authored markup, so they are out of scope
  // for component a11y checks and excluded here.
  const results = await axe.run({ include: [container], exclude: ['[data-base-ui-focus-guard]'] }, { resultTypes: ['violations'] });
  if (results.violations.length === 0) return;
  const detail = results.violations.map(v => `  • [${v.impact ?? 'n/a'}] ${v.id}: ${v.help} — ${v.nodes.length} node(s)`).join('\n');
  throw new Error(`axe found ${results.violations.length} accessibility violation(s):\n${detail}`);
};
