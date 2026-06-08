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
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const chart = new uPlot(options, [[]], container);
    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [options]);

  useEffect(() => {
    chartRef.current?.setData(data);
  }, [data]);

  return <div ref={containerRef} className={className} aria-label='Time series chart' />;
};
