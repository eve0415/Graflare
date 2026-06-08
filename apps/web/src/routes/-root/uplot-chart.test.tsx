import type uPlot from 'uplot';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UPlotChart } from './uplot-chart';

// uPlot can't instantiate under jsdom, so the default export is mocked as a
// constructor spy. We assert what data each constructed instance receives —
// the regression guard is that recreating the chart on an options change (which
// is required to attach a plugin) seeds the new instance with the CURRENT data,
// not empty `[[]]`.
const construct = vi.fn<(options: uPlot.Options, data: uPlot.AlignedData, container: HTMLElement) => void>();
const setData = vi.fn<(data: uPlot.AlignedData) => void>();
const destroy = vi.fn<() => void>();

vi.mock('uplot', () => ({
  default: class {
    constructor(options: uPlot.Options, data: uPlot.AlignedData, container: HTMLElement) {
      construct(options, data, container);
    }
    setData(data: uPlot.AlignedData) {
      setData(data);
    }
    destroy() {
      destroy();
    }
  },
}));
vi.mock('uplot/dist/uPlot.min.css', () => ({}));

const opts = (label: string): uPlot.Options => ({ width: 100, height: 100, series: [{}, { label }] });
const data: uPlot.AlignedData = [
  [1, 2, 3],
  [4, 5, 6],
];
const updatedData: uPlot.AlignedData = [
  [1, 2],
  [9, 9],
];

afterEach(() => {
  cleanup();
  construct.mockClear();
  setData.mockClear();
  destroy.mockClear();
});

describe('uplot-chart', () => {
  it('constructs the chart with the current data, not empty', () => {
    render(<UPlotChart options={opts('a')} data={data} />);
    expect(construct).toHaveBeenCalledTimes(1);
    expect(construct.mock.calls[0]?.[1]).toBe(data);
  });

  it('reseeds the recreated chart with current data when only options change', () => {
    const { rerender } = render(<UPlotChart options={opts('a')} data={data} />);
    expect(construct).toHaveBeenCalledTimes(1);

    // Same data identity, new options object (mirrors adding the annotations
    // plugin): the chart must be torn down and rebuilt *with the data*.
    rerender(<UPlotChart options={opts('b')} data={data} />);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(construct).toHaveBeenCalledTimes(2);
    // The bug was constructing the second instance with `[[]]`; guard it.
    expect(construct.mock.calls[1]?.[1]).toBe(data);
    expect(construct.mock.calls[1]?.[1]).not.toEqual([[]]);
  });

  it('pushes data-only updates through setData without recreating', () => {
    // Stable options identity across the rerender: only data changes.
    const stableOpts = opts('a');
    const { rerender } = render(<UPlotChart options={stableOpts} data={data} />);
    construct.mockClear();
    rerender(<UPlotChart options={stableOpts} data={updatedData} />);
    expect(construct).not.toHaveBeenCalled();
    expect(setData).toHaveBeenLastCalledWith(updatedData);
  });
});
