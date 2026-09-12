'use client';

/**
 * The top bar, which detaches into a floating capsule once you scroll.
 *
 * WHAT WAS WRONG
 *
 * The old bar was a single flex row with `flex: 1` on the nav and
 * `margin-left: auto` on the role badge. With no role chosen there are no
 * nav links, so the badge wrapped onto a second line and sat stranded in
 * the middle — two rows of black eating the top of a phone screen before
 * any content appeared.
 *
 * WHAT IT DOES NOW
 *
 * At the top of the page it is a normal full-width bar. Once you scroll
 * past a little, it lifts off: fixed, inset from the edges, fully rounded,
 * blurred behind, and only as wide as its contents. That gives a phone back
 * the vertical space while keeping navigation one thumb away.
 *
 * Scroll state is read with a passive listener on a rAF tick. `scrollY` is
 * cheap to read but forces layout if you write during the same frame, so
 * the class is toggled on the next frame instead.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wordmark } from '@/components/logo';
import { Navigation } from '@/components/navigation';

/** Far enough that a stray touch-scroll does not make it jump. */
const LIFT_AT = 28;

export function Masthead() {
  const simulation = usePathname() === '/sim';
  const [lifted, setLifted] = useState(false);
  const ticking = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        setLifted(window.scrollY > LIFT_AT);
        ticking.current = false;
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header className={`masthead${simulation ? ' masthead-simulation' : lifted ? ' is-lifted' : ''}`}>
        <div className="masthead-inner">
          <Link href="/" className="wordmark" aria-label="AlgaCarbon home">
            <Wordmark />
          </Link>
          <Navigation />
        </div>
      </header>
      {/* Holds the page's place so content does not jump when the bar lifts. */}
      <div className="masthead-spacer" aria-hidden="true" />
    </>
  );
}
