import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TimeRangePicker } from './time-range-picker';

afterEach(() => {
  cleanup();
});

interface TimeRange {
  from: string;
  to: string;
}

const PRESET_RANGE: TimeRange = { from: 'now-1h', to: 'now' };
const RELATIVE_RANGE: TimeRange = { from: 'now-90m', to: 'now' };
const EPOCH_RANGE: TimeRange = { from: '1700000000', to: '1700003600' };
const TODAY_RANGE: TimeRange = { from: 'now/d', to: 'now/d' };

// Open the popover and wait for its content to mount in the portal.
const openPicker = async (value: TimeRange, onChange: (r: TimeRange) => void): Promise<void> => {
  render(<TimeRangePicker value={value} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Select time range' }));
  await waitFor(() => {
    expect(screen.getByLabelText('Absolute from')).toBeDefined();
  });
};

// Narrow a role-queried button to HTMLButtonElement so `.disabled` is typed.
// The conditional lives in this helper, not in a test body.
const buttonByName = (name: string): HTMLButtonElement => {
  const el = screen.getByRole('button', { name });
  if (!(el instanceof HTMLButtonElement)) throw new Error(`${name} is not a button`);
  return el;
};

const firstOnChangeArg = (onChange: ReturnType<typeof vi.fn<(r: TimeRange) => void>>): TimeRange => {
  const [arg] = onChange.mock.calls[0] ?? [];
  if (arg === undefined) throw new Error('onChange was not called');
  return arg;
};

// The trigger's textContent, normalised to a string (it is `string | null`).
const triggerText = (): string => screen.getByRole('button', { name: 'Select time range' }).textContent ?? '';

describe('time-range-picker', () => {
  it('renders both the absolute and relative sections', async () => {
    const onChange = vi.fn<(r: TimeRange) => void>();
    await openPicker(PRESET_RANGE, onChange);

    expect(screen.getByText('Absolute range')).toBeDefined();
    expect(screen.getByText('Relative range')).toBeDefined();
    expect(screen.getByLabelText('Absolute from')).toBeDefined();
    expect(screen.getByLabelText('Absolute to')).toBeDefined();
    expect(screen.getByLabelText('Relative from')).toBeDefined();
    expect(screen.getByLabelText('Relative to')).toBeDefined();
  });

  it('still renders the quick-range presets', async () => {
    const onChange = vi.fn<(r: TimeRange) => void>();
    await openPicker(PRESET_RANGE, onChange);

    expect(screen.getByText('Last 5m')).toBeDefined();
    expect(screen.getByText('Last 30d')).toBeDefined();
  });

  it('applies an absolute pick as numeric epoch-second strings one hour apart', async () => {
    const onChange = vi.fn<(r: TimeRange) => void>();
    await openPicker(PRESET_RANGE, onChange);

    fireEvent.change(screen.getByLabelText('Absolute from'), { target: { value: '2023-11-14T00:00' } });
    fireEvent.change(screen.getByLabelText('Absolute to'), { target: { value: '2023-11-14T01:00' } });
    fireEvent.click(buttonByName('Apply absolute range'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = firstOnChangeArg(onChange);
    expect(/^\d+$/.test(arg.from)).toBe(true);
    expect(/^\d+$/.test(arg.to)).toBe(true);
    // One hour apart regardless of the host timezone.
    expect(Number(arg.to) - Number(arg.from)).toBe(3600);
  });

  it('keeps the absolute Apply disabled until both inputs are filled', async () => {
    const onChange = vi.fn<(r: TimeRange) => void>();
    await openPicker(PRESET_RANGE, onChange);

    expect(buttonByName('Apply absolute range').disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Absolute from'), { target: { value: '2023-11-14T00:00' } });
    expect(buttonByName('Apply absolute range').disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Absolute to'), { target: { value: '2023-11-14T01:00' } });
    expect(buttonByName('Apply absolute range').disabled).toBe(false);
  });

  it('disables the relative Apply and shows an error for a bad expression', async () => {
    const onChange = vi.fn<(r: TimeRange) => void>();
    await openPicker(PRESET_RANGE, onChange);

    expect(buttonByName('Apply relative range').disabled).toBe(false);

    fireEvent.change(screen.getByLabelText('Relative from'), { target: { value: 'tomorrow' } });
    expect(buttonByName('Apply relative range').disabled).toBe(true);
    expect(screen.getByText(/Use an expression like/)).toBeDefined();
  });

  it('accepts a /unit snapping expression and applies it raw', async () => {
    const onChange = vi.fn<(r: TimeRange) => void>();
    await openPicker(PRESET_RANGE, onChange);

    fireEvent.change(screen.getByLabelText('Relative from'), { target: { value: 'now/d' } });
    fireEvent.change(screen.getByLabelText('Relative to'), { target: { value: 'now/d' } });
    expect(buttonByName('Apply relative range').disabled).toBe(false);
    fireEvent.click(buttonByName('Apply relative range'));

    expect(firstOnChangeArg(onChange)).toEqual({ from: 'now/d', to: 'now/d' });
  });

  it('renders the calendar quick ranges and applies one as raw expressions', async () => {
    const onChange = vi.fn<(r: TimeRange) => void>();
    await openPicker(PRESET_RANGE, onChange);

    expect(screen.getByText('Today')).toBeDefined();
    expect(screen.getByText('This year')).toBeDefined();

    fireEvent.click(screen.getByText('Today'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(firstOnChangeArg(onChange)).toEqual({ from: 'now/d', to: 'now/d' });
  });

  it('shows the calendar preset label on the trigger for its range', () => {
    const onChange = vi.fn<(r: TimeRange) => void>();
    render(<TimeRangePicker value={TODAY_RANGE} onChange={onChange} />);

    expect(triggerText()).toContain('Today');
  });

  it('applies a valid relative range as the raw expression strings', async () => {
    const onChange = vi.fn<(r: TimeRange) => void>();
    await openPicker(PRESET_RANGE, onChange);

    fireEvent.change(screen.getByLabelText('Relative from'), { target: { value: 'now-2h' } });
    fireEvent.change(screen.getByLabelText('Relative to'), { target: { value: 'now+30m' } });
    fireEvent.click(buttonByName('Apply relative range'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = firstOnChangeArg(onChange);
    expect(arg.from).toBe('now-2h');
    expect(arg.to).toBe('now+30m');
  });

  it('formats a numeric epoch range readably on the trigger', () => {
    const onChange = vi.fn<(r: TimeRange) => void>();
    // 1700000000 = 2023-11-14T22:13:20Z. The exact rendered string is locale/TZ
    // dependent, so assert it is NOT the raw "1700000000 to ..." form and that it
    // includes a recognisable year.
    render(<TimeRangePicker value={EPOCH_RANGE} onChange={onChange} />);

    const text = triggerText();
    expect(text).toContain('2023');
    expect(text).not.toContain('1700000000');
  });

  it('shows the preset label on the trigger for a known preset range', () => {
    const onChange = vi.fn<(r: TimeRange) => void>();
    render(<TimeRangePicker value={PRESET_RANGE} onChange={onChange} />);

    expect(triggerText()).toContain('Last 1h');
  });

  it('shows the raw expressions on the trigger for a non-preset relative range', () => {
    const onChange = vi.fn<(r: TimeRange) => void>();
    render(<TimeRangePicker value={RELATIVE_RANGE} onChange={onChange} />);

    expect(triggerText()).toContain('now-90m to now');
  });
});
