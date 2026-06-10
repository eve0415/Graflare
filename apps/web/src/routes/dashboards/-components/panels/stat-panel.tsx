import type { Panel } from '@graflare/shared/schemas/panel';

import { resolveFieldConfig } from '@graflare/shared/format/resolve-field-config';
import { formatValue } from '@graflare/shared/format/value-format';
import { applyValueMappings } from '@graflare/shared/format/value-mappings';
import { useMemo } from 'react';

import { extractResultSeriesWithQuery, firstScalar, getThresholdColor, readableTextColor, seriesDescriptor } from './panel-data-extract';
import { PanelFrame } from './panel-frame';
import { usePanelQuery } from './use-panel-query';

interface StatPanelProps {
  panel: Panel;
  timeRange: { from: string; to: string };
  refetchInterval: number | false;
}

/**
 * Caps the stat font so the value always fits the panel body: the configured size is the
 * upper bound, scaled down via container-query units (the <output> is a size container).
 * 150/len cqw ≈ 90% of the body width over tabular digits (~0.6em per glyph); 70cqh stops
 * short values towering past the body height. A fixed px size clipped "10.13" to "0.1" in
 * a quarter-width panel at tablet sizes.
 */
export const statFontSize = (textSize: number, textLength: number): string =>
  `min(${String(textSize)}px, ${(150 / Math.max(1, textLength)).toFixed(1)}cqw, 70cqh)`;

export const StatPanel = ({ panel, timeRange, refetchInterval }: StatPanelProps) => {
  const { data, isLoading, error, handleRetry } = usePanelQuery(panel, timeRange, refetchInterval);

  // Latest scalar of the first series (after the panel transformations), kept as the raw token
  // (stat displays the string verbatim when it isn't numeric).
  const value = useMemo(() => firstScalar(data, panel.transformations), [data, panel.transformations]);

  // Stat shows a single value field (the first series); resolve that field's effective
  // config against the panel overrides through the shared `seriesDescriptor`, so a byName /
  // byRegexp / byFrameRefID override matches the SAME derived label every per-series panel
  // keys on. With no series the descriptor name is '' (the no-data path is unchanged), and
  // with no matching override this is the defaults reference, so the memo deps stay stable.
  const { fieldConfig, queries } = panel;
  const config = useMemo(() => {
    const [first] = extractResultSeriesWithQuery(data, queries);
    const descriptor = first === undefined ? { name: '' } : seriesDescriptor(first.series, 0, first.refId);
    return resolveFieldConfig(descriptor, fieldConfig);
  }, [data, queries, fieldConfig]);

  const numericValue = value === null ? Number.NaN : Number(value);
  const isNumeric = Number.isFinite(numericValue);
  const colorMode = panel.displayOptions.stat?.colorMode ?? 'value';
  const textSize = panel.displayOptions.stat?.textSize ?? 48;

  // One pass over the mappings; both the displayed text and the color derive from it.
  const mapping = useMemo(() => applyValueMappings(value, config.mappings), [value, config.mappings]);

  // Display: a matching mapping's text wins; else format numeric values; else keep
  // the raw Prometheus token (or em-dash) — never a formatted unit on a non-number.
  const displayText = mapping?.text ?? (isNumeric ? formatValue(numericValue, config) : (value ?? '—'));

  // Color precedence: mapping color > threshold color > default.
  const thresholdColor = isNumeric && panel.thresholds.length > 0 ? getThresholdColor(numericValue, panel.thresholds, 'var(--color-foreground)') : undefined;
  const effectiveColor = mapping?.color ?? thresholdColor;

  const renderedText = value === null ? '—' : displayText;

  const valueStyle = useMemo(
    () => ({
      fontSize: statFontSize(textSize, renderedText.length),
      color: colorMode === 'value' && effectiveColor !== undefined ? effectiveColor : undefined,
    }),
    [textSize, renderedText.length, colorMode, effectiveColor],
  );

  const bgStyle = useMemo(() => {
    if (colorMode !== 'background' || effectiveColor === undefined) return;
    // Pick the text color from the background's relative luminance so the readout
    // stays legible on light threshold fills (e.g. yellow), not a hardcoded white.
    return { backgroundColor: effectiveColor, color: readableTextColor(effectiveColor) };
  }, [colorMode, effectiveColor]);

  return (
    <PanelFrame title={panel.title} panelId={panel.id} loading={isLoading} error={error instanceof Error ? error.message : null} onRetry={handleRetry}>
      <output
        className='[container-type:size] flex h-full items-center justify-center rounded'
        style={bgStyle}
        aria-label={`${panel.title}: ${value === null ? 'no data' : displayText}`}
      >
        {/* The em-dash is a visual no-data sentinel; the output's aria-label already
            says "no data", so hide the bare glyph from assistive tech. */}
        <span className='font-semibold tabular-nums' style={valueStyle} aria-hidden={value === null ? true : undefined}>
          {renderedText}
        </span>
      </output>
    </PanelFrame>
  );
};
