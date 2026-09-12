# Model training — start here

You do not need to know this codebase, Rust, React, or how the app works. You
need to be able to run commands in a terminal and copy text back.

Everything you do lives in `packages/models/`. **If you never open the `apps/`
folder, you cannot break anything.** The worst thing that can happen is a model
that scores badly, and we would rather find that out.

Total time: an afternoon.

---

## Setup (once)

```bash
git clone https://github.com/Daksh2477/RunTimeZero.git
cd RunTimeZero
npm install
pip install scikit-learn numpy --break-system-packages
```

Check it works:

```bash
npm run models:train
```

You should see three models train and print their scores. If that works, you
are set up.

---

## What you are actually doing, in one paragraph

The app has three small models. Right now they learned from a **simulator we
wrote** — which means they learned our assumptions, not real ponds. There is
real published data from actual algae farms. Your job is to retrain two of the
models on that real data and tell us honestly whether they got better or worse.

---

## Step 1 — download the data

Go to **`data.nrel.gov/submissions/76`**

This is the ATP3 Unified Field Study: 19 months of real algae pond data from
five American sites. It is free and openly licensed.

Download it, unzip it, and put the files here:

```
packages/models/data/atp3/
```

(Create the folder if it does not exist.)

---

## Step 2 — look at what is inside

```bash
python3 packages/models/train/inspect_atp3.py
```

This prints the column names of every file. **Copy the whole output and send
it to Mahit.** You do not need to understand it.

---

## Step 3 — fill in the name matching

Open `packages/models/train/load_atp3.py`. Near the top there is a block that
looks like this:

```python
COLUMN_MAP = {
    "timestamp": None,
    "pond_id": None,
    "ph": None,
    "temperature_c": None,
    "dissolved_oxygen": None,
    "optical_density": None,
}

SOURCE_FILE = None
```

From the output of Step 2, find the real column names and put them in. For
example, if the file calls pH `"pH_Value"` and time `"Date_Time"`:

```python
COLUMN_MAP = {
    "timestamp": "Date_Time",
    "pond_id": "Site",
    "ph": "pH_Value",
    ...
}

SOURCE_FILE = "instrumentation/arizona_2014.csv"
```

Copy the names **exactly**, including capital letters and spaces. If something
genuinely is not in the data, leave it as `None`.

**This is the only code you write.** Everything else is done.

Then run:

```bash
python3 packages/models/train/load_atp3.py
```

It will either write a file and tell you how many crashes it found, or tell you
what is still wrong. If it complains, send the message back — do not guess.

---

## Step 4 — retrain

Open `packages/models/train/train_all.py` and find this line inside
`train_crash()`:

```python
cols, m = load("crash.csv")
```

Change it to:

```python
cols, m = load("crash_real.csv")
```

Then:

```bash
npm run models:train
```

Write down the new AUC number.

---

## Step 5 — report the number honestly

The current crash model scores **AUC 0.790** on our simulator's data.

Real data will probably score **worse**. That is expected and it is fine.
A model at 0.68 on real ponds is worth more to us than 0.79 on our own
fiction, because the first one is a real claim and the second is not.

Report whatever you get. Do not tune it until it looks good.

---

## Step 6 — check you did not break the app

```bash
npm run typecheck
```

Then:

```bash
node --experimental-strip-types --input-type=module -e "
import { crashRisk, modelsLoaded } from './apps/api/src/models/infer.ts';
console.log(modelsLoaded());
console.log(crashRisk({ph:7.9,do_mgl:2.1,temp_c:32,od:0.25,ph_trend:-0.03,do_trend:-0.05,od_trend:-0.006,temp_trend:0,ph_mean:8.4,od_mean:0.4}));
"
```

All three models must say `true`, and that dying pond should come back with a
high probability. If not, something changed shape — tell Mahit.

---

## Step 7 — commit

```bash
./scripts/commit.sh "retrain crash model on real ATP3 data" packages/models/
./scripts/push.sh
```

Paths are required on purpose: it stops you accidentally committing someone
else's unfinished work.

---

## The rules, short version

1. **Only touch `packages/models/`.**
2. **Report real numbers.** Worse is fine. Made up is not.
3. **Do not rename anything in the `artifacts/*.json` files.** The app reads
   those field names. A renamed field does not throw an error — it silently
   gives a wrong answer, which is much worse.
4. **When stuck, paste the exact error.** Do not work around it by editing
   something outside your folder.

---

## Later, if there is time

**GLORIA** — 7,572 real measurements of water colour matched to chlorophyll,
from 450 lakes. Published with the Nature Scientific Data paper "GLORIA — a
globally representative hyperspectral in situ dataset". This would let us
retrain `ndci_biomass` on real optics.

The index we need is computed from two wavelengths:

```
NDCI = (R705 − R665) / (R705 + R665)
```

Ask before starting this one — Step 1–7 matters more.

**Leave `divergence_classifier` alone.** It detects carbon fraud, and nobody
publishes labelled fraud data. Synthetic is the only option there, and that is
a real reason rather than an excuse.
