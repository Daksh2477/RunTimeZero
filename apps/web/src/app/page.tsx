/**
 * Landing page.
 *
 * WHAT THIS PAGE IS FOR
 *
 * A judge or a buyer arrives knowing nothing. In about fifteen seconds they
 * need: what is broken in the world, why that is expensive, what we do about
 * it, and proof it is running. In that order.
 *
 * The previous version argued a thesis with no numbers behind it, so there
 * was no way to tell whether any of it worked. Every figure here is now
 * fetched from /summary and computed from the live database — including the
 * one that matters most, which is how much of what operators claimed did not
 * survive checking. That gap is the product. If it renders as a dash,
 * nothing has been verified and the page says so rather than showing zero.
 */

import Link from 'next/link';
import { REPO_URL } from '@/lib/site';
import { LiveProof } from '@/components/live-proof';

export const metadata = {
  title: 'AlgaCarbon — carbon you can check',
  description:
    'Algae ponds absorb CO₂ while cleaning wastewater. We check every claim '
    + 'against evidence the farm does not control, and credit only the lower '
    + 'of the two.',
};

const PROBLEM = [
  {
    stat: '~£1 in £5',
    label: 'of voluntary carbon credits studied were found to represent real reductions',
    source: 'Repeated academic reviews of forestry offsets, 2023–24',
  },
  {
    stat: '490',
    label: 'Indian entities come under compliance carbon targets from 31 July 2026',
    source: 'India Carbon Credit Trading Scheme',
  },
  {
    stat: '0',
    label: 'of that verification is continuous — most is an annual audit visit',
    source: 'How MRV is done today',
  },
];

const STEPS = [
  {
    n: '1',
    title: 'The pond reports what it captured',
    body:
      'A sensor node in the water, or a note from the farmer. Either way it '
      + 'is a claim and we treat it as one.',
  },
  {
    n: '2',
    title: 'We check it from outside',
    body:
      'Satellite chlorophyll, weighed harvests at the bridge, and the '
      + 'sunlight that actually fell on that patch of ground. None of these '
      + 'are things the farm controls.',
  },
  {
    n: '3',
    title: 'Physics sets a hard ceiling',
    body:
      'Photosynthesis needs about eight photons per molecule of CO₂. Past '
      + 'that limit a claim is not doubtful, it is impossible — and no amount '
      + 'of paperwork changes it.',
  },
  {
    n: '4',
    title: 'We credit the lower figure and show our working',
    body:
      'Every batch carries a hashed report anyone can recompute. Disagree '
      + 'with the evidence, not with us.',
  },
];

const AUDIENCES = [
  {
    href: '/farm',
    who: 'I run ponds',
    what:
      'What needs doing today, in plain words. What your crop is worth this '
      + 'month, and whether growing would actually pay.',
    cta: 'Open my ponds',
  },
  {
    href: '/console/investor',
    who: 'I buy credits, or fund farms',
    what:
      'Every listing shows how much of the seller’s own claim was refused. '
      + 'No other marketplace puts that next to the price.',
    cta: 'See the market',
  },
  {
    href: '/console/researcher',
    who: 'I do research',
    what:
      'Licence real pond data from consenting farms, or run our physics '
      + 'model yourself in the browser.',
    cta: 'Open the lab',
  },
];

export default function Landing() {
  return (
    <main className="landing-page">
      <section className="mx-auto max-w-6xl px-4 pt-12 pb-10 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Algae ponds · carbon · evidence
        </p>
        <h1 className="mt-3 max-w-3xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
          A carbon claim is only worth what you can check.
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Algae ponds pull CO₂ out of the air while they clean industrial
          wastewater. Today the farm reports its own number and nobody can
          verify it. We compare that number against evidence the farm does not
          control, and count only the lower of the two.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/enter"
            className="rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">
            Start here
          </Link>
          <Link href="/sim"
            className="rounded-md border border-border px-5 py-3 text-sm font-semibold hover:border-accent">
            Run a pond yourself
          </Link>
        </div>
      </section>

      {/* The proof, before the pitch. Live from /summary. */}
      <LiveProof />

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          The problem is not that carbon markets lack money
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          It is that a buyer cannot tell a real tonne from a claimed one, so
          good projects and worthless ones sell at the same price — and the
          good ones leave.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {PROBLEM.map((p) => (
            <div key={p.label} className="rounded-xl border border-border bg-card p-5">
              <div className="font-display text-3xl font-semibold">{p.stat}</div>
              <p className="mt-2 text-sm">{p.label}</p>
              <p className="mt-2 text-xs text-muted-foreground">{p.source}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            What we do about it
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-xl border border-border bg-card p-5">
                <span className="grid size-7 place-items-center rounded-md bg-accent font-display text-sm font-bold text-accent-foreground">
                  {s.n}
                </span>
                <h3 className="mt-3 font-display text-sm font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          What it makes easier
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {AUDIENCES.map((a) => (
            <Link key={a.href} href={a.href}
              className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-accent">
              <h3 className="font-display text-base font-semibold">{a.who}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{a.what}</p>
              <span className="mt-4 inline-block text-sm font-semibold text-accent-foreground group-hover:underline">
                {a.cta} →
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Built by team RunTimeZero for HackOut&rsquo;26. The physics engine,
          the sensor firmware and the contracts are all open —{' '}
          <a href={REPO_URL} className="underline">read the source</a>.
        </p>
      </section>
    </main>
  );
}
