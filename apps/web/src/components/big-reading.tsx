/**
 * A single large reading, as a card.
 *
 * Ported from Chetan's frontend branch. The design is right for this audience
 * and the reasoning is worth writing down: one number at 2.5rem with a plain
 * sentence under it is readable at arm's length in sunlight, where a chart
 * axis is not. The status colour is carried by the border, the number and a
 * dot — three signals, so it survives both glare and colour blindness.
 *
 * The dot pulses only when something is wrong. Motion is the one thing that
 * reliably pulls the eye, so spending it on the healthy state would waste it.
 */

/**
 * `unknown` is a real state, not a fallback. A pond with no meter fitted is
 * not a pond with a stopped paddlewheel, and rendering the two the same way
 * would put a red alarm on every smallholder site — the exact false-alert
 * problem this screen exists to avoid.
 */
export type Band = 'optimal' | 'warning' | 'critical' | 'unknown';

/** Below `warn` is fine, below `crit` is a warning, above is critical. */
export function bandFor(value: number, warn: number, crit: number): Band {
  if (value >= crit) return 'critical';
  if (value >= warn) return 'warning';
  return 'optimal';
}

export interface BigReadingProps {
  label: string;
  value: string;
  unit?: string;
  /** Plain language, not a range. "Comfortable for growth", not "24–31 °C". */
  hint: string;
  band: Band;
  icon?: React.ReactNode;
}

export function BigReading({ label, value, unit, hint, band, icon }: BigReadingProps) {
  return (
    <div className={`big-reading band-${band}`}>
      <div className="big-reading-head">
        <span className="big-reading-label">
          {icon}
          {label}
        </span>
        <span className="big-reading-dot" aria-hidden="true" />
      </div>
      <p className="big-reading-value">
        {value}
        {unit && <span className="big-reading-unit">{unit}</span>}
      </p>
      <p className="big-reading-hint">{hint}</p>
    </div>
  );
}
