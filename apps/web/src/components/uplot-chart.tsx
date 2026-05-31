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

    const chart = new uPlot(options, data, container);
    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [data, options]);

  useEffect(() => {
    const chart = chartRef.current;
    if (chart !== null) {
      chart.setData(data);
    }
  }, [data]);

  return (
    <div
      ref={containerRef}
      className={className}
      role='img'
      aria-label='Time series chart'
    />
  );
};
