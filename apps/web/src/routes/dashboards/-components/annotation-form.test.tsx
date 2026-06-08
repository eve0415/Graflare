import type { CreateAnnotation } from '@graflare/shared/schemas/annotation';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnnotationForm, nowDatetimeLocal, parseTags, toEpochMs } from './annotation-form';

afterEach(() => {
  cleanup();
});

describe('toEpochMs', () => {
  it('converts a local datetime-local string to the matching epoch ms', () => {
    // datetime-local has no zone, so the runtime interprets it as local time. The
    // expected epoch is that same wall-clock instant constructed in the local zone.
    const dt = '2024-01-02T03:04';
    const expected = new Date(2024, 0, 2, 3, 4, 0, 0).getTime();
    expect(toEpochMs(dt)).toBe(expected);
  });

  it('returns null for an empty or invalid value (so submit can block, never coerce to 0)', () => {
    expect(toEpochMs('')).toBeNull();
    expect(toEpochMs('not-a-date')).toBeNull();
  });
});

describe('parseTags', () => {
  it('splits on commas, trims, and drops blanks', () => {
    expect(parseTags('deploy, release ,, prod')).toEqual(['deploy', 'release', 'prod']);
  });

  it('returns an empty array for an empty or whitespace-only string', () => {
    expect(parseTags('')).toEqual([]);
    expect(parseTags('   ,  , ')).toEqual([]);
  });
});

describe('nowDatetimeLocal', () => {
  it('produces a minute-precision local datetime-local string', () => {
    const value = nowDatetimeLocal();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    // It must be parseable back (i.e. it is a valid local datetime-local value).
    expect(toEpochMs(value)).not.toBeNull();
  });
});

const submitWith = async (edit: () => void): Promise<CreateAnnotation> => {
  const onSubmit = vi.fn<(payload: CreateAnnotation) => void>();
  render(<AnnotationForm dashboardId='11111111-2222-4333-8444-555555555555' onSubmit={onSubmit} submitting={false} />);
  edit();
  fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }));
  await waitFor(() => {
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
  const [arg] = onSubmit.mock.calls[0] ?? [];
  if (arg === undefined) throw new Error('onSubmit not called');
  return arg;
};

describe('annotation-form', () => {
  it('builds a CreateAnnotation payload with the dashboard id, epoch-ms time, text, and parsed tags', async () => {
    const payload = await submitWith(() => {
      fireEvent.change(screen.getByLabelText('Time'), { target: { value: '2024-01-02T03:04' } });
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Deployed v2' } });
      fireEvent.change(screen.getByLabelText('Tags (comma-separated)'), { target: { value: 'deploy, prod' } });
    });

    expect(payload.dashboardId).toBe('11111111-2222-4333-8444-555555555555');
    expect(payload.text).toBe('Deployed v2');
    expect(payload.tags).toEqual(['deploy', 'prod']);
    expect(typeof payload.time).toBe('number');
    expect(payload.time).toBe(toEpochMs('2024-01-02T03:04'));
  });

  it('disables submit while text is empty', () => {
    const onSubmit = vi.fn<(payload: CreateAnnotation) => void>();
    render(<AnnotationForm dashboardId='11111111-2222-4333-8444-555555555555' onSubmit={onSubmit} submitting={false} />);
    const button = screen.getByRole('button', { name: 'Add annotation' });
    expect(button).toHaveProperty('disabled', true);
  });

  it('disables submit while a create is in flight', () => {
    const onSubmit = vi.fn<(payload: CreateAnnotation) => void>();
    render(<AnnotationForm dashboardId='11111111-2222-4333-8444-555555555555' onSubmit={onSubmit} submitting />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'X' } });
    // While submitting the button relabels to "Adding..." and must stay disabled.
    const button = screen.getByRole('button', { name: 'Adding...' });
    expect(button).toHaveProperty('disabled', true);
  });

  it('does not submit when text is present but the time is invalid', () => {
    const onSubmit = vi.fn<(payload: CreateAnnotation) => void>();
    render(<AnnotationForm dashboardId='11111111-2222-4333-8444-555555555555' onSubmit={onSubmit} submitting={false} />);
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add annotation' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
