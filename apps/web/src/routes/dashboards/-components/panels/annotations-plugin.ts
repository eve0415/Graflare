import type { AlertInstanceState } from '@graflare/shared/schemas/alerting';
import type { Annotation } from '@graflare/shared/schemas/annotation';
import type uPlot from 'uplot';

/**
 * Colors for annotation overlays. Alert-sourced annotations (those carrying a
 * `newState`) are tinted by severity; everything else uses a neutral accent.
 * Kept as a named map so tests assert against the same constants the draw uses.
 */
export const ANNOTATION_COLORS = {
  /** Firing / Pending — an active or impending alert. */
  alarm: '#ef4444',
  /** Normal / Resolved — a recovered or healthy transition. */
  ok: '#22c55e',
  /** Non-alert annotation (manual event, deploy marker, …). */
  neutral: '#6366f1',
} as const;

/** A single annotation reduced to what the canvas draw needs, in chart-axis (epoch-second) units. */
export interface AnnotationMarker {
  /** Event time, epoch SECONDS — matches the chart's x scale. */
  time: number;
  /** Optional range end, epoch SECONDS. When present the marker draws as a shaded band. */
  timeEnd?: number;
  /** Stroke/fill color for this marker. */
  color: string;
  /** Annotation text, surfaced as the flag's accessible label / future tooltip. */
  text: string;
}

const MS_PER_SECOND = 1000;

const colorForState = (newState: AlertInstanceState | undefined): string => {
  if (newState === undefined) return ANNOTATION_COLORS.neutral;
  switch (newState) {
    case 'Firing':
    case 'Pending':
      return ANNOTATION_COLORS.alarm;
    case 'Normal':
    case 'Resolved':
      return ANNOTATION_COLORS.ok;
  }
};

/**
 * Map raw annotations to draw-ready markers, in epoch SECONDS, filtered to the
 * visible window `[fromSec, toSec]`.
 *
 * Annotation `time`/`timeEnd` arrive as epoch MILLISECONDS (the API materialises
 * the DB `timestamp_ms` Date into the schema's `z.int()` via `.getTime()`); the
 * chart x-axis is epoch SECONDS, so each is divided by 1000.
 *
 * Filtering is by *overlap*, not point-membership: a ranged annotation that
 * begins before the window but whose `timeEnd` falls inside it is still partly
 * visible and is kept. A point annotation (no `timeEnd`) is treated as a
 * zero-width range, so it survives iff it lies within `[fromSec, toSec]`.
 */
export const annotationMarkers = (annotations: readonly Annotation[], fromSec: number, toSec: number): AnnotationMarker[] => {
  const markers: AnnotationMarker[] = [];
  for (const a of annotations) {
    const startSec = a.time / MS_PER_SECOND;
    const endSec = a.timeEnd === undefined ? startSec : a.timeEnd / MS_PER_SECOND;
    // Overlap test: the [start, end] span must intersect [fromSec, toSec].
    if (startSec > toSec || endSec < fromSec) continue;
    const marker: AnnotationMarker = { time: startSec, color: colorForState(a.newState), text: a.text };
    if (a.timeEnd !== undefined) marker.timeEnd = a.timeEnd / MS_PER_SECOND;
    markers.push(marker);
  }
  return markers;
};

const FLAG_HEIGHT = 8;
const FLAG_WIDTH = 6;
const BAND_ALPHA = 0.12;

const withAlpha = (hex: string, alpha: number): string => {
  // Append an 8-bit alpha channel to a #rrggbb color (e.g. 0.12 -> "1f").
  const clamped = Math.max(0, Math.min(1, alpha));
  const byte = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${byte}`;
};

/**
 * uPlot plugin that overlays annotation markers on a time-based chart.
 *
 * For each marker it draws a vertical line at the event time and a small flag at
 * the bottom of the plot; ranged markers also get a translucent band from
 * `time` to `timeEnd`. All geometry is computed in canvas pixels via
 * `valToPos(val, 'x', true)`, clipped to the plot's `bbox` so markers outside the
 * visible x-range (or charts whose x scale isn't time, e.g. histograms) are a
 * clean no-op.
 *
 * Signatures verified against uplot@1.6.32 `uPlot.d.ts`:
 *   - `Plugin { opts?; hooks }`, `Hooks.Defs.draw?: (self: uPlot) => void`
 *   - `valToPos(val: number, scaleKey: string, canvasPixels?: boolean): number`
 */
export const annotationsPlugin = (markers: readonly AnnotationMarker[]): uPlot.Plugin => ({
  hooks: {
    draw: (u: uPlot) => {
      if (markers.length === 0) return;
      const { ctx } = u;
      const { left, top, width, height } = u.bbox;
      const right = left + width;
      const bottom = top + height;

      ctx.save();
      // Confine all annotation drawing to the plot area.
      ctx.beginPath();
      ctx.rect(left, top, width, height);
      ctx.clip();

      for (const marker of markers) {
        const x = u.valToPos(marker.time, 'x', true);

        if (marker.timeEnd !== undefined) {
          const xEnd = u.valToPos(marker.timeEnd, 'x', true);
          // Clamp the band to the plot bounds so a partly-visible range still fills.
          const bandLeft = Math.max(left, Math.min(x, xEnd));
          const bandRight = Math.min(right, Math.max(x, xEnd));
          if (bandRight > bandLeft) {
            ctx.fillStyle = withAlpha(marker.color, BAND_ALPHA);
            ctx.fillRect(bandLeft, top, bandRight - bandLeft, height);
          }
        }

        // Start-of-event vertical line + bottom flag, only when within the x-range.
        if (x < left || x > right) continue;
        ctx.strokeStyle = marker.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();

        ctx.fillStyle = marker.color;
        ctx.beginPath();
        ctx.moveTo(x, bottom - FLAG_HEIGHT);
        ctx.lineTo(x + FLAG_WIDTH, bottom - FLAG_HEIGHT + FLAG_HEIGHT / 2);
        ctx.lineTo(x, bottom);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    },
  },
});
