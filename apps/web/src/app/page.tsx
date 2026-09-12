/**
 * Landing page.
 *
 * Layout and voice are Codex's; the content was rewritten to say what the
 * problem actually is and who pays for it. The previous copy described
 * features ("bring pond readings together") without ever naming the
 * problem, so a reader could not tell what it was for.
 *
 * The live figures come from /summary and are queried, never written down.
 * If nothing has been verified they render as dashes — a landing page that
 * invents traction is the same lie as a carbon claim that invents tonnes.
 */

import Link from 'next/link';
import { AudienceExplorer } from '@/components/audience-explorer';
import { HomeEffects } from '@/components/home-effects';
import { LiveProof } from '@/components/live-proof';
import { REPO_URL } from '@/lib/site';
import './home.css';

export const metadata = {
  title: 'Healthier ponds. Clearer carbon claims.',
  description: 'Algae ponds clean industrial wastewater and absorb CO₂ while doing it. AlgaCarbon checks every carbon claim against evidence the farm does not control, and prices the harvest itself — so the pond pays twice.',
};

export default function Landing() {
  return <main className="home">
    <section className="home-hero">
      <div className="home-shell home-hero-grid">
        <div>
          <p className="home-kicker">SMALL ALGAE. BIG POSSIBILITIES.</p>
          <h1>Healthier ponds.<br /><span>Clearer carbon claims.</span></h1>
          <p className="home-lede">An algae pond on a factory’s effluent cleans the water, absorbs CO₂, and grows a crop worth ₹240 a kilo. The hard part is proving any of it. We check every claim against evidence the farm doesn’t control — and we price the harvest too, because that is where the money actually is.</p>
          <div className="home-actions"><Link className="button home-primary" href="#who-its-for">Find your view <span aria-hidden="true">↗</span></Link><Link className="button home-outline" href="#how-it-works">See how it works</Link></div>
          <p className="home-caption">Live prototype, real data. No sign-up needed.</p>
        </div>
        <div className="home-preview" aria-label="Illustration of pond monitoring and a carbon check">
          <div className="home-preview-top"><span><span className="home-dot" /> A clearer view of your pond</span><span className="home-demo">Illustration</span></div>
          <div className="home-pond-scene" aria-hidden="true"><div className="home-raceway"><div className="home-island" /><div className="home-paddle" /></div><span className="home-sensor sensor-one" /><span className="home-sensor sensor-two" /><span className="home-scene-label">ALGAE RACEWAY POND</span></div>
          <div className="home-preview-readings"><div><span>01 / Monitor</span><strong>Read the water</strong><small>Temperature · pH · oxygen</small></div><div><span>02 / Understand</span><strong>Find the next step</strong><small>Plain-language pond alerts</small></div></div>
          <div className="home-evidence"><span className="home-check" aria-hidden="true">✓</span><div><strong>Look beyond the claim</strong><p>Compare reported capture with supporting evidence.</p></div><span aria-hidden="true">↗</span></div>
        </div>
      </div>
    </section>
    <div className="home-explore-bar home-shell"><nav aria-label="Explore the homepage"><a href="#how-it-works">How it works</a><a href="#who-its-for">Who it helps</a><a href="#home-questions">Common questions</a></nav><HomeEffects /></div>
    <div className="home-principles home-shell"><span>Catch a crash before it costs you</span><span>Evidence anyone can recompute</span><span>Sell the carbon and the crop</span></div>
    <LiveProof />
    <section className="home-section home-shell home-how" id="how-it-works">
      <div className="home-section-heading"><p className="eyebrow">FROM POND TO PROOF</p><h2>The problem isn’t growing algae.<br />It’s proving it.</h2><p>Buyers cannot tell a real tonne from a claimed one, so good projects and worthless ones sell at the same price — and the good ones leave. India’s 490 obligated entities start reporting under the CCTS from 31 July 2026, and none of them want to buy a credit that cannot be defended.</p></div>
      <div className="home-steps">
        {[['01', 'Watch the water, cheaply', 'One multiparameter sonde per pond, about ₹26,000, reporting every few seconds. A stopped paddlewheel or a crashing culture shows here hours before it shows in the harvest — and a lost crop is worth far more than the sensor.'], ['02', 'Check the claim from outside', 'Satellite chlorophyll, weighed harvests, and the sunlight that actually fell on that ground. Photosynthesis caps what is physically possible at about eight photons per molecule of CO₂; past that a claim is not doubtful, it is impossible.'], ['03', 'Sell both halves', 'Carbon credits carry a hashed report any buyer can recompute. The biomass itself is graded on protein and lipid and priced at farm gate — feed at ₹240/kg against ₹12/kg as fertiliser. Same pond, twenty times the income.']].map(([n,title,body]) => <article key={n}><span className="home-step-number">{n}</span><h3>{title}</h3><p>{body}</p></article>)}
      </div>
    </section>
    <section className="home-audiences" id="who-its-for"><div className="home-shell home-section"><div className="home-section-heading"><p className="eyebrow">ONE PLATFORM, DIFFERENT NEEDS</p><h2>Find your way in.</h2><p>A smallholder with one pond and a textile mill running four hectares of effluent treatment need different screens. Start with yours.</p></div><AudienceExplorer /></div></section>
    <section className="home-section home-shell home-trust">
      <div><p className="eyebrow">WHY A LARGE BUYER WOULD USE THIS</p><h2>An offset you cannot defend<br />is a liability, not an asset.</h2><p>A compliance buyer under the CCTS is not looking for the cheapest tonne — they are looking for one that survives an audit three years from now. Every batch here carries a hashed MRV report that can be recomputed from the underlying readings, and states plainly how much of the seller’s own claim was refused. For a mill running its own effluent ponds, the same evidence works in both directions: proof of treatment, and proof of capture.</p><Link className="home-text-link" href="/console/market">See what is on the market <span aria-hidden="true">→</span></Link></div>
      <div className="home-trust-list"><article><span aria-hidden="true">↔</span><div><h3>Credit the lower figure, always</h3><p>We take the smaller of what the farm claimed and what the evidence supports. Overstating earns nothing, so there is no number a seller can write down that beats the check.</p></div></article><article><span aria-hidden="true">≈</span><div><h3>Publish the uncertainty</h3><p>Satellite biomass estimates carry roughly ±140% in the literature. We show the band and credit its lower bound rather than hiding the spread inside one confident total.</p></div></article><article><span aria-hidden="true">↗</span><div><h3>Only durable disposal counts</h3><p>Buried, biochar and bioplastic keep the carbon out of the air. Feed and fertiliser return it within a season, so they are worth money but are not removal — and the contract refuses to mint them.</p></div></article></div>
    </section>
    <section className="home-section home-shell home-faq" id="home-questions"><div><p className="eyebrow">A FEW THINGS TO KNOW</p><h2>Start with the basics.</h2><div className="home-launch-card"><p>Want to see it in action?</p><Link href="/sim"><strong>Explore the virtual pond <span aria-hidden="true">↗</span></strong><span>Change the conditions and watch the model respond.</span></Link><Link href="/console/market"><strong>Browse the marketplace <span aria-hidden="true">↗</span></strong><span>Review the available batches and their evidence.</span></Link></div></div><div>
      <details><summary>What is AlgaCarbon?</summary><p>A hackathon prototype that connects algae pond monitoring, carbon checks and growth simulation. It helps people understand pond conditions and inspect the evidence behind reported carbon capture.</p></details>
      <details><summary>Is everything shown here live farm data?</summary><p>No. The prototype can include simulated readings and sample evidence. The simulator is a model, and the homepage illustration is not a live pond. Review the data sources in a report before relying on a result.</p></details>
      <details><summary>Can I buy carbon credits here?</summary><p>Yes — the marketplace issues batches, sells them and retires them against a named beneficiary, and each retirement is permanent. Payment settlement is not wired up in this prototype, and credits are recorded with a reproducible report hash rather than anchored on a public chain until a signing key is configured. Both are stated on the listing rather than implied away.</p></details>
      <details><summary>Does a pond actually pay for itself?</summary><p>It depends almost entirely on what the biomass is sold as, not on carbon. Aquafeed-grade spirulina runs about ₹180–320/kg at farm gate against ₹8–18/kg for the same dry mass as soil input, and the difference is protein content — which is decided by how nitrogen is managed weeks before harvest. Carbon revenue is real but small beside that. The expansion planner shows both, with running costs and payback.</p></details>
      <details><summary>What does it cost to instrument a pond?</summary><p>About ₹26,000 for a multiparameter sonde plus ₹6,500 for the node and enclosure, per pond, and one energy meter per site. Below roughly half a hectare we do not recommend sensors at all — weighed harvests are cruder but harder to dispute, and cheaper.</p></details>
      <details><summary>Do I need sensors to try it?</summary><p>No sensors are needed to explore the browser simulator or existing reports. Monitoring your own pond requires a site and sensors to be configured; that setup is not available through this interface yet.</p></details>
      <details><summary>Can I inspect how it works?</summary><p>Yes. The project source includes the models, physics engine and application code. <a href={REPO_URL}>Explore the RunTimeZero repository.</a></p></details>
    </div></section>
    <section className="home-shell home-final"><div><p className="home-kicker">SEE IT FOR YOURSELF</p><h2>Your next decision starts<br />with a clearer picture.</h2></div><div className="home-actions"><Link className="button home-primary" href="#who-its-for">Explore the platform <span aria-hidden="true">↗</span></Link><Link className="button home-outline" href="#how-it-works">How it works</Link></div></section>
  </main>;
}
