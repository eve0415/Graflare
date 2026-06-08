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
});
