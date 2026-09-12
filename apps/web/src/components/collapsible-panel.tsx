'use client';

/**
 * A section that folds away on small screens and stays open on large ones.
 *
 * WHY THIS EXISTS
 *
 * The simulator has four sections — scenarios, the pond scene, the sensor
 * readings and the totals. On a desktop they fit side by side. On a phone
 * they became a single column two thousand pixels tall, so the reading you
 * were trying to watch was never on screen at the same time as the pond
 * that produced it. Scrolling between a cause and its effect defeats the
 * point of a live model.
 *
 * So on a phone everything except the scene collapses to a header you can
 * tap, and the scene stays pinned. Above 900px nothing collapses at all —
 * a desktop user should never have to open anything.
 *
 * Built on <details>, which means it works before hydration, is keyboard
 * and screen-reader correct for free, and needs no JavaScript to toggle.
 * The `open` attribute is set from a media query on mount rather than in
 * CSS, because CSS cannot force a <details> open and `display` tricks break
 * the accessibility semantics.
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  step: string;
  title: string;
  /** Shown in the header when collapsed — the one number worth seeing. */
  summary?: string;
  children: React.ReactNode;
  /** Sections that must never fold, like the pond scene itself. */
  alwaysOpen?: boolean;
}

const WIDE = '(min-width: 900px)';

export function CollapsiblePanel({ step, title, summary, children, alwaysOpen }: Props) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [wide, setWide] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const apply = () => {
      setWide(mq.matches);
      // Force open on desktop; leave the user's choice alone on phones.
      if (mq.matches && ref.current) ref.current.open = true;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const forcedOpen = wide || alwaysOpen;

  return (
    <details
      ref={ref}
      className={`panel-fold${forcedOpen ? ' is-static' : ''}`}
      open={forcedOpen ? true : undefined}
    >
      <summary>
        <span className="workspace-step">{step}</span>
        <span className="panel-fold-title">{title}</span>
        {summary && <span className="panel-fold-summary">{summary}</span>}
        <span className="panel-fold-chevron" aria-hidden="true" />
      </summary>
      <div className="panel-fold-body">{children}</div>
    </details>
  );
}
