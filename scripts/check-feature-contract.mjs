/**
 * Guard: the crash model's feature list exists in four places, and nothing
 * throws when they disagree — the model just silently scores the wrong thing.
 *
 *   1. CRASH_HEADER          packages/models/train/make_dataset.ts  (synthetic)
 *   2. HEADER                packages/models/train/load_atp3.py     (real data)
 *   3. crashFeatures()       apps/api/src/services/advisory.ts      (runtime)
 *   4. features[]            packages/models/artifacts/crash_classifier.json
 *
 * This has already broken twice. The artifact is allowed to hold FEWER
 * features than the rest — train_all.py drops constant columns when training
 * on real data, which is deliberate — but never extra ones, and every name it
 * does hold must be one the runtime actually produces.
 */
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const fail = (msg) => { console.error(`feature contract: ${msg}`); process.exitCode = 1; };

const listFrom = (src, marker, close) => {
  const at = src.indexOf(marker);
  if (at === -1) return null;
  const body = src.slice(at + marker.length, src.indexOf(close, at));
  return [...body.matchAll(/['"]([a-z0-9_]+)['"]/g)].map((m) => m[1]).filter((n) => n !== 'label');
};

const synthetic = listFrom(read('packages/models/train/make_dataset.ts'), 'const CRASH_HEADER = [', '];');
const real = listFrom(read('packages/models/train/load_atp3.py'), 'HEADER = [', ']');
const runtime = [...read('apps/api/src/services/advisory.ts')
  .slice(read('apps/api/src/services/advisory.ts').indexOf('export function crashFeatures'))
  .split('\n}')[0]
  .matchAll(/^\s{4}([a-z0-9_]+):/gm)].map((m) => m[1]);

if (!synthetic || !real || !runtime.length) {
  fail('could not parse one of the feature lists — has a definition moved?');
} else {
  const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  if (!eq(synthetic, real)) {
    fail(`make_dataset.ts and load_atp3.py disagree.\n  synthetic: ${synthetic.join(',')}\n  real:      ${real.join(',')}`);
  }
  if (!eq(synthetic, runtime)) {
    fail(`make_dataset.ts and advisory.ts crashFeatures() disagree — the model would score inputs the product never builds.\n  training: ${synthetic.join(',')}\n  runtime:  ${runtime.join(',')}`);
  }

  const artifactPath = 'packages/models/artifacts/crash_classifier.json';
  if (existsSync(new URL(`../${artifactPath}`, import.meta.url))) {
    const trained = JSON.parse(read(artifactPath)).features;
    const unknown = trained.filter((f) => !runtime.includes(f));
    if (unknown.length) fail(`trained model expects features the runtime never supplies: ${unknown.join(', ')}`);
  }
}

if (!process.exitCode) console.log(`feature contract ok (${synthetic.length} features, 4 definitions agree)`);
