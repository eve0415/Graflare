import type { AlertInstanceState, NoDataState } from '@graflare/shared/schemas/alerting';

/**
 * Decide how a single alert instance should transition when evaluation returns
 * no data (errors are handled the same way, with the error state). Returns null
 * when the instance needs no change.
 *
 * - `KeepLastState`: never change.
 * - `Alerting`: a non-firing instance escalates to Firing and notifies; an
 *   already-firing one is left alone (no re-notify).
 * - `OK` (and any other clearing state): a firing instance resolves and notifies
 *   (mirroring the normal Firing→Resolved path); pending/resolved settle to Normal
 *   silently; an already-normal instance needs no change.
 */
export const noDataTransition = (noDataState: NoDataState, currentState: AlertInstanceState): { state: AlertInstanceState; notify: boolean } | null => {
  if (noDataState === 'KeepLastState') return null;

  if (noDataState === 'Alerting') {
    return currentState === 'Firing' ? null : { state: 'Firing', notify: true };
  }

  // noDataState === 'OK' — clear the alert.
  if (currentState === 'Firing') return { state: 'Resolved', notify: true };
  if (currentState === 'Normal') return null;
  return { state: 'Normal', notify: false };
};
