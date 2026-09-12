# Model training — self-contained brief

**You own `packages/models/` and nothing else.** Everything you produce is JSON
files in `artifacts/`. If you never open `apps/`, you cannot break the app.

You do not need to understand the rest of the codebase to do this well.

---

## The one rule

The app reads your artifacts through `apps/api/src/models/infer.ts`. **The JSON
shape is a contract.** Change the numbers freely; change the field names and
inference silently breaks — a missing field reads as `undefined`, which is not
an error, just a wrong answer.

Every model must keep the shape it has now. Open an existing
`artifacts/*.json` and match it exactly.

Also: **no model may ever decide how much carbon gets credited.** That is
arithmetic elsewhere in the codebase and it stays that way. Your models set
warnings and confidence, never amounts. If a change of yours would move a
credited figure, it is out of scope — say so rather than doing it.

---

## What exists now

Three models, all trained on data our own simulator generated:

| Model | What it predicts | Current score |
|---|---|---|
| `crash_classifier` | Culture collapse within 48 h | AUC 0.790 |
| `divergence_classifier` | noise vs drift vs systematic overstatement | 92.2% (3 classes) |
| `ndci_biomass` | Chlorophyll index → biomass, **with an interval** | R² 0.181 |

```bash
npm run models:data     # regenerate synthetic datasets from the twin
npm run models:train    # retrain all three, write artifacts/
```

Training needs `scikit-learn` (`pip install scikit-learn --break-system-packages`).
Everything runs offline. Python never runs in the live app — we train here and
ship JSON.

---

## Your job: replace synthetic data with real data

Two of these should not be learning from our own simulator. A model trained on
a simulator learns the simulator.

### Task 1 — ATP3 (the big one)

**ATP3 Unified Field Study**, NREL, CC-BY 4.0, DOI `10.7799/1400389`.
Download from `data.nrel.gov/submissions/76`.

19 months, five US sites, 1,000 L raceway ponds. It contains almost exactly
what we simulate:

- pH, temperature, dissolved oxygen, conductivity, PAR at **15-minute intervals**
- Manual samples: depth, salinity, nitrogen, phosphorus, **optical density**,
  algae concentration (dry weight and ash-free)
- Harvest records including **contamination indicators**
- Hourly weather

Those contamination indicators are real crash labels. That is what makes this
worth doing.

**Steps**

1. Put the extracted files in `packages/models/data/atp3/`.
2. Write `train/load_atp3.py` that emits `data/crash_real.csv` with **exactly
   the same columns** as the synthetic `data/crash.csv`:
   `ph, do_mgl, temp_c, od, ph_trend, do_trend, od_trend, temp_trend, ph_mean, od_mean, label`
   — a 48-hour window of features, labelled 1 if the culture lost a third of
   its density over the following 48 h (or if a contamination event is recorded).
3. Point `train_crash()` at the real file and retrain.
4. Write down the new AUC. **Report it honestly even if it is worse.** A model
   at 0.68 on real ponds is more use to us than 0.79 on our own fiction, and
   saying so is the difference between a defensible claim and a hollow one.

### Task 2 — GLORIA

7,572 hyperspectral reflectance measurements with matched chlorophyll-a from
450 water bodies. Published with the Nature Scientific Data paper "GLORIA — a
globally representative hyperspectral in situ dataset".

Compute NDCI from the reflectance at 665 nm and 705 nm:

```
NDCI = (R705 − R665) / (R705 + R665)
```

Fit chlorophyll-a against it, emit `data/ndci_real.csv` with the same columns
as `data/ndci.csv`, and retrain.

**The interval matters more than the fit.** Report the 10th and 90th percentile
ratios, not just R². A wide interval is not a failure — it is the truth about
how well satellites can see a pond, and the app uses it to credit
conservatively.

### Task 3 — leave `divergence_classifier` synthetic

Nobody publishes labelled carbon fraud. Synthetic is the only option here and
that is genuinely defensible. Do not spend time hunting for a dataset that does
not exist.

---

## Rules

1. **Seed every run.** `SEED = 42` is already in the trainer. An
   unreproducible model is not evidence of anything.
2. **Ship metrics with every model.** `artifacts/<name>.meta.json` already does
   this. Keep it accurate — if a judge asks how good the model is, the answer
   should be a file, not a shrug.
3. **Report honest numbers.** 0.78 described as 0.78 beats 0.95 claimed. People
   ask follow-up questions.
4. **Never overwrite an artifact without rerunning its metrics.** A model whose
   stated score no longer matches its weights is worse than no score.
5. **Commit the artifacts, not the data.** `data/` is gitignored — it is large
   and regenerable. `artifacts/*.json` are small and are what the app loads.

---

## How to know you are done

```bash
npm run models:train          # writes artifacts + meta
npm run typecheck             # must stay clean
```

Then confirm the app can still load what you produced:

```bash
node --experimental-strip-types --input-type=module -e "
import { crashRisk, divergencePattern, biomassFromNdci, modelsLoaded } from './apps/api/src/models/infer.ts';
console.log(modelsLoaded());
console.log(crashRisk({ph:7.9,do_mgl:2.1,temp_c:32,od:0.25,ph_trend:-0.03,do_trend:-0.05,od_trend:-0.006,temp_trend:0,ph_mean:8.4,od_mean:0.4}));
"
```

All three must report `true`, and a dying pond must return a high probability.
If either fails, the artifact shape drifted — compare against git history.

---

## If you get stuck

Write it in `.agents/INBOX.md` with what you tried and the exact error. Do not
edit anything under `apps/` to work around a problem; that is someone else's
area and the fix probably belongs on their side.
