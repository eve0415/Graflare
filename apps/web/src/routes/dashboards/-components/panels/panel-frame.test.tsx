import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PanelActionsProvider } from './panel-actions-context';
import { PanelFrame } from './panel-frame';

const onEdit = vi.fn<(id: string) => void>();
const onDelete = vi.fn<(id: string) => void>();
const actions = { onEdit, onDelete };

afterEach(() => {
  cleanup();
  onEdit.mockClear();
  onDelete.mockClear();
});

describe('panel-frame', () => {
  it('shows edit/delete and fires the panel actions in edit mode', () => {
    render(
      <PanelActionsProvider value={actions}>
        <PanelFrame title='CPU' panelId='p1'>
          <div>body</div>
        </PanelFrame>
      </PanelActionsProvider>,
    );

    fireEvent.click(screen.getByLabelText('Edit panel'));
    expect(onEdit).toHaveBeenCalledWith('p1');

    fireEvent.click(screen.getByLabelText('Delete panel'));
    expect(onDelete).toHaveBeenCalledWith('p1');
  });

  it('hides the panel actions in view mode (no provider)', () => {
    render(
      <PanelFrame title='CPU' panelId='p1'>
        <div>body</div>
      </PanelFrame>,
    );

    expect(screen.queryByLabelText('Edit panel')).toBeNull();
    expect(screen.queryByLabelText('Delete panel')).toBeNull();
  });

  it('exposes the panel as a region landmark labelled by its title', () => {
    render(
      <PanelFrame title='CPU'>
        <div>body</div>
      </PanelFrame>,
    );

    // react-grid-layout items are bare divs; the named <section> gives screen-reader
    // users a navigable landmark, and its title is the accessible name.
    const region = screen.getByRole('region', { name: 'CPU' });
    expect(region.tagName).toBe('SECTION');
  });

  it('reflects the data-table toggle state via aria-pressed', () => {
    render(
      <PanelFrame title='CPU' dataTableContent={<div>table</div>}>
        <div>body</div>
      </PanelFrame>,
    );

    const toggle = screen.getByLabelText('Show data table');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });
});
