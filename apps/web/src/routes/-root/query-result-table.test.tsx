import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { QueryResultTable } from './query-result-table';

afterEach(cleanup);

const sample = { columns: ['name', 'value'], rows: [['cpu', '42']] };

describe('query-result-table scrollable region', () => {
  // axe's `scrollable-region-focusable` rule is layout-dependent (scrollWidth/clientWidth are 0
  // under jsdom, which performs no layout), so it cannot fire here — the same class as
  // color-contrast. We therefore assert the DOM contract the fix establishes directly: the WAI-ARIA
  // scrollable-region pattern (labelled `role="region"` + `tabIndex={0}`). The real axe pass runs in
  // the browser. An axe-based test here would pass even with the fix removed, proving nothing.
  it('exposes a labelled, keyboard-focusable region when scrollRegionLabel is provided', () => {
    render(<QueryResultTable data={sample} scrollRegionLabel='CPU data table' />);
    const region = screen.getByRole('region', { name: 'CPU data table' });
    expect(region.getAttribute('tabindex')).toBe('0');
    // The region is the horizontal-scroll container that wraps the table, not the <table> itself.
    expect(region.querySelector('table')).not.toBeNull();
  });

  it('does not mark the table as a focusable region when no label is given', () => {
    // Inline / non-scrolling usages must not gain a stray tab stop or landmark.
    render(<QueryResultTable data={sample} />);
    expect(screen.queryByRole('region')).toBeNull();
  });
});
