/**
 * Landing page.
 *
 * Previously this redirected straight to /console, which assumed every
 * visitor was already an operator. Three different people arrive here — a
 * farmer, someone checking a credit they were sold, and someone deciding
 * whether any of this is real — and each needs a different door.
 *
 * The argument comes first because it is short and it is the whole product:
 * a claim nobody can check is worth nothing.
 */

import Link from 'next/link';

export const metadata = {
  title: 'AlgaCarbon — carbon you can check',
  description:
    'Algae ponds absorb CO₂. We check the claim against evidence the farm does not control, and credit the lower of the two.',
};

export default function Landing() {
  return (
    <main className="wrap landing">
      <section className="hero">
        <p className="eyebrow">ALGAE PONDS · CARBON · EVIDENCE</p>
        <h1>A carbon claim is only worth what you can check.</h1>
        <p className="hero-lede">
          Algae ponds pull CO₂ out of the air while they clean wastewater. Today
          the farm reports its own number and nobody can verify it — so we
          compare that number against evidence the farm does not control, and
          count only the lower of the two.
        </p>

        <div className="rule-card">
          <p className="rule-line">
            <span>what the farm claims</span>
            <em>vs</em>
            <span>what the evidence shows</span>
          </p>
          <p className="rule-out">We count the smaller one.</p>
          <p className="helper">
            So overstating earns nothing. There is no number a farm can write
            down that beats the evidence.
          </p>
        </div>
      </section>

      <section className="doors">
        <h2 className="doors-title">Where would you like to start?</h2>

        <Link className="door" href="/console">
          <strong>I run ponds</strong>
          <span>
            See how each pond is doing, what needs attention today, and what it
            is costing you.
          </span>
          <em>Open my ponds →</em>
        </Link>

        <Link className="door" href="/verify">
          <strong>I was given a carbon credit</strong>
          <span>
            Check what it is based on. Every report shows its evidence and what
            we could not confirm.
          </span>
          <em>Check a report →</em>
        </Link>

        <Link className="door" href="/sim">
          <strong>I am thinking about starting</strong>
          <span>
            Try a pond. Change its size and see the algae, the carbon and the
            running costs move as you go.
          </span>
          <em>Try a pond →</em>
        </Link>
      </section>

      <section className="how">
        <h2>How the checking works</h2>
        <ol className="how-list">
          <li>
            <strong>The pond reports what it captured.</strong> Sensors in the
            water, or a note from the farmer. Either way it is a claim, not yet
            a fact.
          </li>
          <li>
            <strong>We look from outside.</strong> Satellite images of the pond,
            weighed harvests at the bridge, and the sunlight that actually fell
            on that patch of ground.
          </li>
          <li>
            <strong>Sunlight sets a hard ceiling.</strong> Photosynthesis needs
            about eight particles of light per molecule of CO₂. Past that limit
            a claim is not doubtful, it is impossible.
          </li>
          <li>
            <strong>We count the lower figure</strong> and show our working, so
            anyone can disagree with the evidence rather than with us.
          </li>
        </ol>
      </section>
    </main>
  );
}
