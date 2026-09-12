'use client';

/**
 * "What would it take to grow?"
 *
 * Uses the yield rate the simulator just measured rather than a rule of
 * thumb, so the projection and the model can never disagree. The equipment
 * list is not invented either — it falls out of the verification tiers in
 * docs/ARCHITECTURE.md, which is why the cost steps at 2 ha and 10 ha rather
 * than scaling smoothly. That step is the honest part: crossing a threshold
 * changes how your carbon gets checked, and that changes what you must own.
 */

import { useState } from 'react';
import { compareExpansion, planFor } from '@/lib/planning';

const inr = (v: number) =>
  v >= 10_000_000
    ? `₹${(v / 10_000_000).toFixed(2)} Cr`
    : v >= 100_000
      ? `₹${(v / 100_000).toFixed(1)} L`
      : `₹${Math.round(v).toLocaleString('en-IN')}`;

const area = (m2: number) =>
  m2 >= 10_000 ? `${(m2 / 10_000).toFixed(2)} ha` : `${Math.round(m2).toLocaleString('en-IN')} m²`;

export function ExpansionPanel({
  currentAreaM2,
  yieldKgPerM2PerYear,
}: {
  currentAreaM2: number;
  /** Measured by the simulator run, annualised. */
  yieldKgPerM2PerYear: number;
}) {
  const [target, setTarget] = useState(() => Math.round(currentAreaM2 * 2));
  const d = compareExpansion(currentAreaM2, target, yieldKgPerM2PerYear);
  const bigger = target > currentAreaM2;

  return (
    <section className="panel expansion">
      <h2>If you grew this pond</h2>
      <p className="sub">
        What it would produce, what equipment you would need, and how long
        before it pays for itself.
      </p>

      <div className="sim-field">
        <label htmlFor="target-area">
          <span>Grow to</span>
          <strong className="num">{area(target)}</strong>
        </label>
        <input
          id="target-area"
          type="range"
          min={Math.max(200, Math.round(currentAreaM2 * 0.5))}
          max={Math.round(Math.max(currentAreaM2 * 12, 40_000))}
          step={100}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
        />
        <p className="helper">Now {area(currentAreaM2)} · {planFor(currentAreaM2).tierLabel}</p>
      </div>

      {d.tierChanged && bigger && (
        <div className="tier-change">
          <strong>This moves you from {d.from.tierLabel} to {d.to.tierLabel}.</strong>
          <p>
            {d.to.verifiedBy}. {d.to.satelliteEligible && !d.from.satelliteEligible
              ? 'Your ponds become wide enough for satellites to see clearly, which means tighter evidence and more of your carbon counted.'
              : 'Different size, different evidence, different equipment.'}
          </p>
        </div>
      )}

{/*
        Every figure is a positive number with its direction in the label.
        "Extra running cost: -₹4.2 L" for a shrinking site read as a charge
        rather than a saving, which is exactly the kind of thing an operator
        misreads once and then distrusts forever.
      */}
      <dl className="kv expansion-figures">
        <dt>{d.direction === 'shrink' ? 'Algae you would lose each year' : 'Extra algae each year'}</dt>
        <dd className="num">{Math.round(d.biomassChangeKgPerYear).toLocaleString('en-IN')} kg</dd>

        <dt>{d.direction === 'shrink' ? 'Income given up' : 'Extra income each year'}</dt>
        <dd className="num">{inr(d.revenueChangeInr)}</dd>

        <dt>{d.opexRises ? 'Added running cost each year' : 'Running cost saved each year'}</dt>
        <dd className="num">{inr(d.opexChangeInr)}</dd>

        <dt>Equipment to buy, once</dt>
        <dd className="num">{d.capexInr === 0 ? 'nothing' : inr(d.capexInr)}</dd>

        <dt>{d.profitImproves ? 'Profit gained each year' : 'Profit lost each year'}</dt>
        <dd className={`num ${d.profitImproves ? 'is-good' : 'is-bad'}`}>
          {inr(d.annualProfitChangeInr)}
        </dd>

        <dt>Profit after the change, per year</dt>
        <dd className={`num ${d.projectedAnnualProfitInr >= 0 ? 'is-good' : 'is-bad'}`}>
          {d.projectedAnnualProfitInr >= 0
            ? inr(d.projectedAnnualProfitInr)
            : `${inr(Math.abs(d.projectedAnnualProfitInr))} loss`}
        </dd>

        <dt>Ponds needed</dt>
        <dd className="num">{d.to.pondCount}</dd>
      </dl>

      <div className={`payback${d.paybackYears === null ? ' is-never' : ''}`}>
        {d.paybackYears === null ? (
          <>
            <strong>This does not pay for itself.</strong>
            <span>
              {bigger
                ? 'The extra running cost eats the extra income. On a wastewater site the treatment fee is what usually closes this gap — it is not counted here.'
                : 'Shrinking saves running cost but sells less.'}
            </span>
          </>
        ) : (
          <>
            <strong>
              Pays for itself in {d.paybackYears < 1
                ? `${Math.round(d.paybackYears * 12)} months`
                : `${d.paybackYears.toFixed(1)} years`}
            </strong>
            <span>Equipment cost recovered from the extra algae alone.</span>
          </>
        )}
      </div>

      <details className="technical">
        <summary>What you would need to buy</summary>
        <ul className="kit-list">
          {d.to.sensors.map((s) => (
            <li key={s.name}>
              <div className="kit-head">
                <strong>
                  {s.qty > 0 ? `${s.qty} × ` : ''}{s.name}
                </strong>
                {s.qty > 0 && <span className="num">{inr(s.qty * s.unitInr)}</span>}
              </div>
              <p className="helper">{s.because}</p>
            </li>
          ))}
        </ul>
        <p className="helper">
          Prices are typical Indian supplier figures and will move. Treat this
          as the shape of the decision, not a quote.
        </p>
      </details>
    </section>
  );
}
