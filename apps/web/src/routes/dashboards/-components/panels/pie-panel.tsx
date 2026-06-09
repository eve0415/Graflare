import type { PieSlice } from './pie-data';
import type { Panel } from '@graflare/shared/schemas/panel';

import { formatValue } from '@graflare/shared/format/value-format';
import { applyValueMappings } from '@graflare/shared/format/value-mappings';
import { useMemo } from 'react';

import { PanelFrame } from './panel-frame';
import { pieSlices } from './pie-data';
import { usePanelQuery } from './use-panel-query';

interface PiePanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
}

const CX = 100;
const CY = 100;
const RADIUS = 90;
// Donut hole as a fraction of the radius. A constant so a future displayOptions
// control can override it without reshaping the geometry.
const DONUT_INNER_FRACTION = 0.6;

// Slice palette: the same 60°-step hue rotation the time-series panel uses, so the
// colours are consistent across panel types. `pieSlices` cycles it for extra series.
const SLICE_PALETTE = [0, 60, 120, 180, 240, 300].map(h => `hsl(${String(h)}, 70%, 50%)`);

// A single filled pie wedge from `startAngle` to `endAngle` (degrees, 0 at the top,
// clockwise). Angles map to SVG coordinates with 0 at 12 o'clock: x uses sin, y uses
// -cos. A sweep over 180° sets the large-arc flag; the sweep flag is always clockwise.
const describeWedge = (startAngle: number, endAngle: number): string => {
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  const x1 = CX + RADIUS * Math.sin(startRad);
  const y1 = CY - RADIUS * Math.cos(startRad);
  const x2 = CX + RADIUS * Math.sin(endRad);
  const y2 = CY - RADIUS * Math.cos(endRad);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${String(CX)} ${String(CY)} L ${String(x1)} ${String(y1)} A ${String(RADIUS)} ${String(RADIUS)} 0 ${String(largeArc)} 1 ${String(x2)} ${String(y2)} Z`;
};

// Pre-format a slice's display value (mapping text wins over the unit-formatted
// number, matching the other panels' precedence) and its percent label.
interface DisplaySlice extends PieSlice {
  displayText: string;
  percentText: string;
}

const toDisplaySlice = (slice: PieSlice): DisplaySlice => {
  // Each slice carries its own resolved config (per-field overrides resolved by
  // `pieSlices`), so the value label respects a byName unit/decimals/mappings override.
  const mapping = applyValueMappings(slice.value, slice.config.mappings);
  const displayText = mapping?.text ?? formatValue(slice.value, slice.config);
  const percentText = `${String(Math.round(slice.fraction * 100))}%`;
  return { ...slice, displayText, percentText };
};

const legendWrapClass = (legend: 'right' | 'bottom' | 'none'): string => {
  if (legend === 'bottom') return 'flex h-full flex-col items-center gap-2 p-2';
  if (legend === 'none') return 'flex h-full items-center justify-center p-2';
  return 'flex h-full items-center gap-3 p-2';
};

// The legend list doubles as the chart's accessible representation, so it is always
// rendered: visually for `right`/`bottom`, and `sr-only` (off-screen but exposed to
// assistive tech) for `none`, while the SVG itself stays decorative.
const legendListClass = (legend: 'right' | 'bottom' | 'none'): string => {
  if (legend === 'none') return 'sr-only';
  if (legend === 'bottom') return 'flex flex-wrap justify-center gap-x-4 gap-y-1';
  return 'flex max-h-full flex-col gap-1 overflow-auto';
};

interface PieLegendItemProps {
  slice: DisplaySlice;
}

// Memoizes the swatch colour style so the inline object isn't recreated each render
// (react-perf/jsx-no-new-object-as-prop). The swatch is decorative — the adjacent
// text carries the label/value/percent for assistive tech.
const PieLegendItem = ({ slice }: PieLegendItemProps) => {
  const swatchStyle = useMemo(() => ({ backgroundColor: slice.color }), [slice.color]);
  return (
    <li className='flex items-center gap-2 text-xs'>
      <span className='h-3 w-3 shrink-0 rounded-sm' style={swatchStyle} aria-hidden='true' />
      <span className='text-muted-foreground max-w-32 truncate' title={slice.label}>
        {slice.label}
      </span>
      <span className='font-medium tabular-nums'>{slice.displayText}</span>
      <span className='text-muted-foreground tabular-nums'>{slice.percentText}</span>
    </li>
  );
};

export const PiePanel = ({ panel, timeRange, refetchInterval }: PiePanelProps) => {
  const { data, isLoading, error, handleRetry } = usePanelQuery(panel, timeRange, refetchInterval);

  const { fieldConfig, queries, transformations } = panel;
  const isDonut = panel.displayOptions.pie?.display === 'donut';
  const legend = panel.displayOptions.pie?.legend ?? 'right';

  // `pieSlices` runs the panel transformations, then resolves each series' effective config (per-field
  // overrides) keyed on its label and the query refId; `toDisplaySlice` formats from that. With no
  // transformations and no overrides each slice's config is the panel defaults reference —
  // byte-identical to before.
  const slices = useMemo(
    () => pieSlices(data, SLICE_PALETTE, fieldConfig, queries, transformations).map(slice => toDisplaySlice(slice)),
    [data, fieldConfig, queries, transformations],
  );

  // A single full-circle slice can't be drawn as a wedge (start === end renders
  // nothing), so it becomes a plain circle.
  const isSingle = slices.length === 1;
  const innerRadius = isDonut ? RADIUS * DONUT_INNER_FRACTION : 0;
  // Label the SVG group so the donut/pie distinction is announced; the per-slice
  // breakdown lives in the (always-rendered) legend list below.
  const chartLabel = `${isDonut ? 'Donut' : 'Pie'} chart, ${panel.title}`;

  return (
    <PanelFrame title={panel.title} panelId={panel.id} loading={isLoading} error={error instanceof Error ? error.message : null} onRetry={handleRetry}>
      {slices.length > 0 ? (
        <div className={legendWrapClass(legend)}>
          {/* Decorative: the geometry conveys no information a screen reader can use,
              so it is hidden and the legend list carries the accessible breakdown. */}
          <svg viewBox='0 0 200 200' className='aspect-square h-full max-h-full min-h-0 flex-1' aria-hidden='true'>
            <title>{chartLabel}</title>
            {isSingle ? (
              <circle cx={CX} cy={CY} r={RADIUS} fill={slices[0]?.color} />
            ) : (
              // Series can share a __name__ (differing only by labels), so the label
              // alone isn't a stable key — suffix the index, as the bar-gauge does.
              slices.map((slice, i) => <path key={`${slice.label}-${String(i)}`} d={describeWedge(slice.startAngle, slice.endAngle)} fill={slice.color} />)
            )}
            {/* Donut hole: a centre circle painted in the card background punches the
                wedges, avoiding annular-path math. */}
            {isDonut && <circle cx={CX} cy={CY} r={innerRadius} className='fill-card' />}
          </svg>

          <ul className={legendListClass(legend)} aria-label={chartLabel}>
            {slices.map((slice, i) => (
              <PieLegendItem key={`${slice.label}-${String(i)}`} slice={slice} />
            ))}
          </ul>
        </div>
      ) : (
        <p className='text-muted-foreground text-sm'>No data</p>
      )}
    </PanelFrame>
  );
};
