import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface UPlotChartProps {
  options: uPlot.Options;
  data: uPlot.AlignedData;
  className?: string;
}

export const UPlotChart = ({ options, data, className }: UPlotChartProps) => {
  const containerRef = useRef<HTMLElement>(null);
  const chartRef = useRef<uPlot | null>(null);
  // Holds the latest data so the (re)construct effect can seed a fresh uPlot
  // instance with it. A uPlot plugin can only be attached at construction, so
  // changing `options` (e.g. adding the annotations plugin) must recreate the
  // chart; constructing with `[[]]` would blank it until the next data change.
  const dataRef = useRef(data);

  // Data-only updates go through setData (cheap). Defined before the construct
  // effect so the ref is fresh if both change in the same commit; the ref write
  // lives in the effect (not render) to stay React-Compiler-safe.
  useEffect(() => {
    dataRef.current = data;
    chartRef.current?.setData(data);
  }, [data]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const chart = new uPlot(options, dataRef.current, container);
    chartRef.current = chart;

    // uPlot renders its legend as extra DOM below the plot, so `options.height` alone
    // overflows the panel body by the legend's height (it gets clipped by overflow-hidden).
    // The legend exists synchronously after construction — measure it and hand the plot
    // the remainder so plot + legend together fit the height the caller budgeted.
    const legend = container.querySelector('.u-legend');
    const legendHeight = legend?.getBoundingClientRect().height ?? 0;
    if (legendHeight > 0) {
      chart.setSize({ width: options.width, height: Math.max(60, options.height - legendHeight) });
    }
    // The max-h cap makes a wrapped legend scrollable; scrollable regions must be
    // keyboard-reachable and named (axe scrollable-region-focusable — same WAI-ARIA
    // pattern as the panel data table). Only when it genuinely overflows.
    if (legend instanceof HTMLElement && legend.scrollHeight > legend.clientHeight) {
      legend.tabIndex = 0;
      legend.setAttribute('role', 'group');
      legend.setAttribute('aria-label', 'Chart legend');
    }

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [options]);

  // Cap the legend: u-inline mode wraps long series labels into many rows at narrow widths,
  // and an uncapped legend can eat the whole height budget (the plot then hits its 60px floor).
  const legendCap = '[&_.u-legend]:block [&_.u-legend]:max-h-20 [&_.u-legend]:overflow-y-auto';

  // figure (not role=img — img would flatten the legend away from assistive tech).
  return <figure ref={containerRef} className={className === undefined ? legendCap : `${legendCap} ${className}`} aria-label='Time series chart' />;
};
