import type { DailyViewBucket } from '@/lib/db/queries';

/**
 * A 30-day view sparkline, rendered as inline SVG on the server.
 *
 * No chart library and no client JS: this sits on every card of a listings page
 * and the whole point is that a free landlord sees movement without paying for
 * anything, including bundle size. Hover text comes from native SVG <title>
 * elements, which every browser tooltips without a script.
 *
 * Colour: Tailwind teal-600 (#0d9488), the one step that clears the data-viz
 * lightness band, chroma floor and 3:1 surface contrast on BOTH the light and
 * the dark chart surface — so a single hue serves both modes.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const BAR_W = 4;
const GAP = 2; // The surface gap that separates adjacent bars — never a stroke.
const PLOT_H = 26;
const BASELINE_Y = 28;
const SVG_H = 30;

/** UTC day keys, oldest first, matching date_trunc('day', viewed_at) in the query. */
function dayKeys(days: number, today: Date): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

function label(key: string): string {
  const [, month, day] = key.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
}

/**
 * A bar with rounded top corners and a SQUARE baseline — the data-end is
 * rounded, the end anchored to the axis is not. The radius is capped at half
 * the bar width, because a 4px radius on a 4px bar would round it into a lozenge
 * and misstate the value.
 */
function barPath(x: number, height: number): string {
  const r = Math.min(BAR_W / 2, height);
  const top = BASELINE_Y - height;
  return [
    `M${x},${BASELINE_Y}`,
    `L${x},${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `L${x + BAR_W - r},${top}`,
    `Q${x + BAR_W},${top} ${x + BAR_W},${top + r}`,
    `L${x + BAR_W},${BASELINE_Y}`,
    'Z',
  ].join(' ');
}

export function ViewSparkline({
  buckets,
  days = 30,
  today = new Date(),
}: {
  buckets: DailyViewBucket[];
  days?: number;
  today?: Date;
}) {
  const counts = new Map(buckets.map((b) => [b.day, b.count]));
  // Gaps are filled with zeros: a sparkline that plots only the days with views
  // draws a busy week and a dead week identically.
  const series = dayKeys(days, today).map((key) => ({ key, count: counts.get(key) ?? 0 }));

  const total = series.reduce((sum, point) => sum + point.count, 0);
  const last7 = series.slice(-7).reduce((sum, point) => sum + point.count, 0);
  const max = Math.max(...series.map((p) => p.count), 1);
  const peak = series.reduce((best, p) => (p.count > best.count ? p : best), series[0]);

  const width = series.length * (BAR_W + GAP) - GAP;

  if (total === 0) {
    return (
      <p className="text-xs text-gray-500">No views in the last {days} days</p>
    );
  }

  return (
    <div className="space-y-1">
      <svg
        viewBox={`0 0 ${width} ${SVG_H}`}
        width={width}
        height={SVG_H}
        className="max-w-full"
        role="img"
        aria-label={`Views per day over the last ${days} days: ${total} in total, peaking at ${peak.count} on ${label(peak.key)}.`}
      >
        {/* Recessive hairline axis, so an empty day still reads as a day. */}
        <line
          x1="0"
          y1={BASELINE_Y + 1}
          x2={width}
          y2={BASELINE_Y + 1}
          className="stroke-gray-200"
          strokeWidth="1"
        />
        {series.map((point, i) => {
          if (point.count === 0) return null;
          // Floor of 2px: one view on a 40-view scale would otherwise render as
          // nothing, which reads as a day with no views at all.
          const height = Math.max(2, Math.round((point.count / max) * PLOT_H));
          return (
            <path
              key={point.key}
              d={barPath(i * (BAR_W + GAP), height)}
              className="fill-teal-600"
            >
              <title>{`${label(point.key)}: ${point.count} ${point.count === 1 ? 'view' : 'views'}`}</title>
            </path>
          );
        })}
      </svg>
      {/* The numbers live in text, not only in the bars: the chart is the
          texture, the sentence is the fact. */}
      <p className="text-xs text-gray-600">
        <span className="font-medium text-gray-900">{last7}</span> {last7 === 1 ? 'view' : 'views'}{' '}
        in the last 7 days
        <span className="text-gray-400"> · {total} in {days}</span>
      </p>
    </div>
  );
}
