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
  const results = await axe.run(container, { resultTypes: ['violations'] });
  if (results.violations.length === 0) return;
  const detail = results.violations.map(v => `  • [${v.impact ?? 'n/a'}] ${v.id}: ${v.help} — ${v.nodes.length} node(s)`).join('\n');
  throw new Error(`axe found ${results.violations.length} accessibility violation(s):\n${detail}`);
};
