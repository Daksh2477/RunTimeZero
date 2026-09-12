import Link from 'next/link';
import { AudienceExplorer } from '@/components/audience-explorer';
import { REPO_URL } from '@/lib/site';
import './home.css';

export const metadata = {
  title: 'Healthier ponds. Clearer carbon claims.',
  description: 'AlgaCarbon brings algae pond monitoring, carbon evidence and an interactive simulator into one place for farmers, buyers and researchers.',
};

export default function Landing() {
  return <main className="home">
    <section className="home-hero">
      <div className="home-shell home-hero-grid">
        <div>
          <p className="home-kicker">SMALL ALGAE. BIG POSSIBILITIES.</p>
          <h1>Healthier ponds.<br /><span>Clearer carbon claims.</span></h1>
          <p className="home-lede">Know what’s happening in your algae ponds. Spot problems, explore changes, and see the evidence behind every carbon claim — all in one place.</p>
          <div className="home-actions"><Link className="button home-primary" href="/farm">See your ponds <span aria-hidden="true">↗</span></Link><Link className="button home-outline" href="/sim">Try the simulator</Link></div>
          <p className="home-caption">Explore the prototype. No sign-up needed.</p>
        </div>
        <div className="home-preview" aria-label="Illustration of pond monitoring and a carbon check">
          <div className="home-preview-top"><span><span className="home-dot" /> A clearer view of your pond</span><span className="home-demo">Illustration</span></div>
          <div className="home-pond-scene" aria-hidden="true"><div className="home-raceway"><div className="home-island" /><div className="home-paddle" /></div><span className="home-sensor sensor-one" /><span className="home-sensor sensor-two" /><span className="home-scene-label">ALGAE RACEWAY POND</span></div>
          <div className="home-preview-readings"><div><span>01 / Monitor</span><strong>Read the water</strong><small>Temperature · pH · oxygen</small></div><div><span>02 / Understand</span><strong>Find the next step</strong><small>Plain-language pond alerts</small></div></div>
          <div className="home-evidence"><span className="home-check" aria-hidden="true">✓</span><div><strong>Look beyond the claim</strong><p>Compare reported capture with supporting evidence.</p></div><span aria-hidden="true">↗</span></div>
        </div>
      </div>
    </section>
    <div className="home-principles home-shell"><span>Pond health at a glance</span><span>Evidence you can inspect</span><span>Experiments before investment</span></div>
    <section className="home-section home-shell" id="how-it-works">
      <div className="home-section-heading"><p className="eyebrow">FROM POND TO PROOF</p><h2>Less guesswork.<br />A clearer next step.</h2><p>Algae capture carbon as they grow. Understanding that growth — and checking what it means — takes more than a single number.</p></div>
      <div className="home-steps">
        {[['01', 'See what’s happening', 'Bring pond readings and alerts together. Find the ponds that need attention without digging through charts.'], ['02', 'Check the evidence', 'Compare a farm’s reported capture with available observations and a physics-based estimate. See when records disagree or are missing.'], ['03', 'Make an informed decision', 'Review a saved report, investigate a pond, or test a change in the simulator before trying it on the farm.']].map(([n,title,body]) => <article key={n}><span className="home-step-number">{n}</span><h3>{title}</h3><p>{body}</p></article>)}
      </div>
    </section>
    <section className="home-audiences" id="who-its-for"><div className="home-shell home-section"><div className="home-section-heading"><p className="eyebrow">ONE PLATFORM, DIFFERENT NEEDS</p><h2>Find your way in.</h2><p>Start with the view that answers your questions.</p></div><AudienceExplorer /></div></section>
    <section className="home-section home-shell home-trust">
      <div><p className="eyebrow">CONFIDENCE COMES FROM CLARITY</p><h2>A number is useful.<br />Its evidence is better.</h2><p>AlgaCarbon keeps the reported claim, the supporting estimate and the result of the check visible. You can see what supports a result and what still needs review.</p><Link className="home-text-link" href="/verify">Explore carbon reports <span aria-hidden="true">→</span></Link></div>
      <div className="home-trust-list"><article><span aria-hidden="true">↔</span><div><h3>Compare, don’t just collect</h3><p>Review the farm’s claim alongside other available observations.</p></div></article><article><span aria-hidden="true">≈</span><div><h3>Show the uncertainty</h3><p>See an estimated range and a conservative supported amount, rather than hiding uncertainty in a single total.</p></div></article><article><span aria-hidden="true">↗</span><div><h3>Keep capture and credits separate</h3><p>A capture check is evidence to review. Issuing a carbon credit also requires decisions about storage, durability and eligibility.</p></div></article></div>
    </section>
    <section className="home-section home-shell home-faq"><div><p className="eyebrow">A FEW THINGS TO KNOW</p><h2>Start with the basics.</h2></div><div>
      <details><summary>What is AlgaCarbon?</summary><p>A hackathon prototype that connects algae pond monitoring, carbon checks and growth simulation. It helps people understand pond conditions and inspect the evidence behind reported carbon capture.</p></details>
      <details><summary>Is everything shown here live farm data?</summary><p>No. The prototype can include simulated readings and sample evidence. The simulator is a model, and the homepage illustration is not a live pond. Review the data sources in a report before relying on a result.</p></details>
      <details><summary>Can I buy carbon credits here?</summary><p>Not yet. You can browse carbon reports and see how their amounts were checked. Trading, payments and credit retirement are not connected to this interface.</p></details>
      <details><summary>Do I need sensors to try it?</summary><p>No sensors are needed to explore the browser simulator or existing reports. Monitoring your own pond requires a site and sensors to be configured; that setup is not available through this interface yet.</p></details>
      <details><summary>Can I inspect how it works?</summary><p>Yes. The project source includes the models, physics engine and application code. <a href={REPO_URL}>Explore the RunTimeZero repository.</a></p></details>
    </div></section>
    <section className="home-shell home-final"><p className="home-kicker">SEE IT FOR YOURSELF</p><h2>Your next decision starts<br />with a clearer picture.</h2><div className="home-actions"><Link className="button home-primary" href="/farm">Open pond monitoring <span aria-hidden="true">↗</span></Link><Link className="button home-outline" href="/sim">Experiment with a pond</Link></div></section>
  </main>;
}
