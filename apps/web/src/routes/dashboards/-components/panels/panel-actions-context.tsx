import { createContext, useContext } from 'react';

/**
 * Edit-mode panel actions, provided by the dashboard view and consumed by the
 * panel frame (deep in the grid → renderer → panel tree). `null` means view mode
 * — the panel options (edit/delete) are hidden.
 */
export interface PanelActions {
  onEdit: (panelId: string) => void;
  onDelete: (panelId: string) => void;
}

const PanelActionsContext = createContext<PanelActions | null>(null);

// React 19 renders a context object directly as its provider, so the alias is the context itself.
export const PanelActionsProvider = PanelActionsContext;

export const usePanelActions = (): PanelActions | null => useContext(PanelActionsContext);
