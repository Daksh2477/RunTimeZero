'use client';

import { useState } from 'react';
import Link from 'next/link';

const audiences = [
  { name: 'Farm operators', title: 'Know which pond needs you.', description: 'Start with plain-language alerts and large, readable measurements. Open a pond for its history and suggested actions.', points: ['Put urgent pond alerts first', 'Read water conditions at a glance', 'Explore changes before trying them'], href: '/farm', cta: 'Open the farmer view', note: 'YOUR DAILY STARTING POINT', preview: ['1. Check pond alerts', '2. Review recent readings', '3. Choose your next action'] },
  { name: 'Buyers & verifiers', title: 'See what supports the claim.', description: 'Look up a report and compare the reported amount with the evidence. Understand the result before making a carbon decision.', points: ['Inspect a saved carbon check', 'See supporting sources and missing evidence', 'Distinguish capture from issued credits'], href: '/verify', cta: 'Browse carbon reports', note: 'EVIDENCE BEFORE A DECISION', preview: ['What was reported?', 'What do the records support?', 'What still needs review?'] },
  { name: 'Researchers', title: 'Turn a “what if” into an experiment.', description: 'Explore how pond conditions affect a model of algae growth. Adjust the inputs and watch the simulated pond respond.', points: ['Run the pond model in your browser', 'Try different growing conditions', 'Explore the assumptions behind results'], href: '/sim', cta: 'Open the simulation lab', note: 'A SAFE PLACE TO EXPERIMENT', preview: ['Change the conditions', 'Watch the model respond', 'Compare possible outcomes'] },
  { name: 'Fleet managers', title: 'See the bigger picture.', description: 'Bring your sites and ponds into one overview. Find a pond, check its alerts and explore the details behind a site’s totals.', points: ['Browse ponds across sites', 'Filter and find what needs attention', 'Inspect site-level performance'], href: '/console', cta: 'Open the fleet overview', note: 'YOUR SITES, IN ONE VIEW', preview: ['Across your sites', 'Down to each pond', 'With the details behind it'] },
];

export function AudienceExplorer() {
  const [selected, setSelected] = useState(0);
  const audience = audiences[selected]!;
  return <div className="audience-explorer">
    <div className="audience-options" role="group" aria-label="Choose your audience">{audiences.map((item, i) => <button key={item.name} type="button" aria-pressed={selected === i} aria-controls="audience-content" onClick={() => setSelected(i)}>{item.name}</button>)}</div>
    <div className="audience-content" id="audience-content" aria-live="polite">
      <div><h3>{audience.title}</h3><p>{audience.description}</p><ul>{audience.points.map(point => <li key={point}>{point}</li>)}</ul><Link className="button" href={audience.href}>{audience.cta} <span aria-hidden="true">↗</span></Link></div>
      <div className="audience-preview"><p className="home-kicker">{audience.note}</p>{audience.preview.map((line, i) => <div key={line}><span aria-hidden="true">0{i+1}</span><strong>{line}</strong></div>)}</div>
    </div>
  </div>;
}
