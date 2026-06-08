import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

interface UPlotChartProps {
  options: uPlot.Options;
  data: uPlot.AlignedData;
  className?: string;
}

export const UPlotChart = ({ options, data, className }: UPlotChartProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
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

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [options]);

  return <div ref={containerRef} className={className} aria-label='Time series chart' />;
};
