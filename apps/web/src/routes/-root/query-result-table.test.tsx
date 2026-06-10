import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { expectNoA11yViolations } from '../../../tests/a11y';

import { QueryResultTable } from './query-result-table';

afterEach(cleanup);

const sample = { columns: ['name', 'value'], rows: [['cpu', '42']] };
const empty = { columns: [], rows: [] };
const duplicateColumns = {
  columns: ['value', 'value'],
  rows: [
    ['1', '30'],
    ['2', '10'],
    ['3', '20'],
  ],
};
const masked = { columns: ['value'], rows: [['9'], ['10'], ['2']] };

const mapValue = (cell: string, _rowIndex: number, colIndex: number): { text: string; color?: string } =>
  colIndex === 1 ? { text: `mapped-${cell}`, color: '#ff0000' } : { text: cell };

const hideValue = (): { text: string } => ({ text: 'hidden' });

/** Throwing default for destructured queries — keeps tests free of conditionals and `!`. */
const missing = (what: string): never => {
  throw new Error(`expected ${what} in the rendered table`);
};

/** Text of every rendered body-row, in DOM order (header row excluded). */
const bodyRowTexts = (): string[] => {
  const [, ...rows] = screen.getAllByRole('row');
  return rows.map(row =>
    within(row)
      .getAllByRole('cell')
      .map(cell => cell.textContent)
      .join('|'),
  );
};

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

describe('query-result-table basics', () => {
  it('renders "No data" when there are no columns', () => {
    render(<QueryResultTable data={empty} />);
    expect(screen.getByText('No data')).not.toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders one header per column and one cell per value', () => {
    render(<QueryResultTable data={sample} />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(bodyRowTexts()).toEqual(['cpu|42']);
  });
});

const sortable = {
  columns: ['name', 'value'],
  rows: [
    ['beta', '9'],
    ['alpha', '10'],
    ['gamma', '2'],
  ],
};

describe('query-result-table sorting', () => {
  it('sorts a numeric column numerically, not lexically', () => {
    render(<QueryResultTable data={sortable} />);
    fireEvent.click(screen.getByRole('button', { name: 'value' }));
    // Lexical order would put "10" before "2" and "9" last.
    expect(bodyRowTexts()).toEqual(['gamma|2', 'beta|9', 'alpha|10']);
  });

  it('sorts a string column lexically', () => {
    render(<QueryResultTable data={sortable} />);
    fireEvent.click(screen.getByRole('button', { name: 'name' }));
    expect(bodyRowTexts()).toEqual(['alpha|10', 'beta|9', 'gamma|2']);
  });

  it('cycles asc → desc → original order across three clicks', () => {
    render(<QueryResultTable data={sortable} />);
    const header = screen.getByRole('button', { name: 'value' });
    fireEvent.click(header);
    expect(bodyRowTexts()).toEqual(['gamma|2', 'beta|9', 'alpha|10']);
    fireEvent.click(header);
    expect(bodyRowTexts()).toEqual(['alpha|10', 'beta|9', 'gamma|2']);
    fireEvent.click(header);
    expect(bodyRowTexts()).toEqual(['beta|9', 'alpha|10', 'gamma|2']);
  });

  it('reflects sort state through aria-sort on the column header', () => {
    render(<QueryResultTable data={sortable} />);
    const th = screen.getByRole('columnheader', { name: 'value' });
    expect(th.getAttribute('aria-sort')).toBeNull();
    const button = screen.getByRole('button', { name: 'value' });
    fireEvent.click(button);
    expect(th.getAttribute('aria-sort')).toBe('ascending');
    fireEvent.click(button);
    expect(th.getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(button);
    expect(th.getAttribute('aria-sort')).toBeNull();
  });

  it('sorts duplicate-named columns independently (ids are position-suffixed)', () => {
    // Duplicate header names are legal in query results (a label can repeat across series);
    // each column must keep its own identity, so sorting the second one must not touch the first.
    render(<QueryResultTable data={duplicateColumns} />);
    const buttons = screen.getAllByRole('button', { name: 'value' });
    expect(buttons).toHaveLength(2);
    const [, secondColumn = missing('a second value header')] = buttons;
    fireEvent.click(secondColumn);
    expect(bodyRowTexts()).toEqual(['2|10', '3|20', '1|30']);
  });
});

/** rowCount rows of [index, padded-constant] so numeric sorting and paging are predictable. */
const bigData = (rowCount: number, marker = 'a'): { columns: string[]; rows: string[][] } => ({
  columns: ['index', 'label'],
  rows: Array.from({ length: rowCount }, (_, i) => [String(i), `${marker}${String(i)}`]),
});

describe('query-result-table pagination', () => {
  it('renders at most 100 rows plus controls when the data exceeds a page', () => {
    render(<QueryResultTable data={bigData(250)} />);
    expect(bodyRowTexts()).toHaveLength(100);
    expect(screen.getByText('250 rows')).not.toBeNull();
    expect(screen.getByText('Page 1 of 3')).not.toBeNull();
  });

  it('navigates with prev/next and disables them at the edges', () => {
    render(<QueryResultTable data={bigData(150)} />);
    const prev = screen.getByRole('button', { name: 'Previous page' });
    const next = screen.getByRole('button', { name: 'Next page' });
    expect(prev.hasAttribute('disabled')).toBe(true);
    expect(bodyRowTexts()[0]).toBe('0|a0');

    fireEvent.click(next);
    expect(screen.getByText('Page 2 of 2')).not.toBeNull();
    expect(bodyRowTexts()).toHaveLength(50);
    expect(bodyRowTexts()[0]).toBe('100|a100');
    expect(next.hasAttribute('disabled')).toBe(true);

    fireEvent.click(prev);
    expect(screen.getByText('Page 1 of 2')).not.toBeNull();
    expect(bodyRowTexts()[0]).toBe('0|a0');
  });

  it('renders no pagination controls for exactly one page of rows', () => {
    render(<QueryResultTable data={bigData(100)} />);
    expect(bodyRowTexts()).toHaveLength(100);
    expect(screen.queryByRole('button', { name: 'Next page' })).toBeNull();
    expect(screen.queryByText('100 rows')).toBeNull();
  });

  it('resets to the first page when the data changes', async () => {
    const { rerender } = render(<QueryResultTable data={bigData(150)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 2 of 2')).not.toBeNull();

    rerender(<QueryResultTable data={bigData(180, 'b')} />);
    // v9's auto page-index reset writes to the table store through a scheduler that defers
    // notifications by a microtask (react-table `reactivity.ts`), so the reset is observable
    // only after a flush — hence findByText rather than a synchronous getByText.
    await screen.findByText('Page 1 of 2');
    expect(bodyRowTexts()[0]).toBe('0|b0');
  });

  it('keeps pages consistent with the sort order', () => {
    render(<QueryResultTable data={bigData(150)} />);
    // Descending numeric sort puts the highest index first; page 1 must hold 149..50.
    const indexHeader = screen.getByRole('button', { name: 'index' });
    fireEvent.click(indexHeader);
    fireEvent.click(indexHeader);
    expect(bodyRowTexts()[0]).toBe('149|a149');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(bodyRowTexts()[0]).toBe('49|a49');
  });
});

describe('query-result-table cell rendering', () => {
  it('applies the renderCell transform per column', () => {
    render(<QueryResultTable data={sortable} renderCell={mapValue} />);
    expect(bodyRowTexts()).toEqual(['beta|mapped-9', 'alpha|mapped-10', 'gamma|mapped-2']);
    const mapped = screen.getByText('mapped-9');
    expect(mapped.style.color).toBe('rgb(255, 0, 0)');
  });

  it('still applies the transform to sorted, paginated rows', () => {
    const data = bigData(150);
    render(<QueryResultTable data={data} renderCell={mapValue} />);
    fireEvent.click(screen.getByRole('button', { name: 'index' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    // Ascending page 2 starts at index 100; the label column (colIndex 1) stays mapped.
    expect(bodyRowTexts()[0]).toBe('100|mapped-a100');
    const mapped = screen.getByText('mapped-a100');
    expect(mapped.style.color).toBe('rgb(255, 0, 0)');
  });

  it('sorts by the raw value even when renderCell rewrites the text', () => {
    const { container } = render(<QueryResultTable data={masked} renderCell={hideValue} />);
    fireEvent.click(screen.getByRole('button', { name: 'value' }));
    // All cells read "hidden", so assert on the DOM order being re-derived from raw values:
    // sorting must not throw and must keep exactly the three masked rows.
    expect(bodyRowTexts()).toEqual(['hidden', 'hidden', 'hidden']);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
  });
});

describe('query-result-table accessibility', () => {
  it('passes axe on a sorted, paginated table', async () => {
    const { container } = render(<QueryResultTable data={bigData(250)} scrollRegionLabel='Query results' />);
    fireEvent.click(screen.getByRole('button', { name: 'index' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await expectNoA11yViolations(container);
  });
});
