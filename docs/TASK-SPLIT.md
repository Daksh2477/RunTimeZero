# Who does what

Four people, one repo, a deadline. Split so that **nobody is blocked on anyone
else** — each person owns directories the others do not open.

| | Owns | Cannot break |
|---|---|---|
| **Mahit** | `apps/api`, `apps/contracts`, `packages/physics`, `packages/types`, deploy | everything (so: small commits, push often) |
| **Teammate A** | `packages/models/**` only | nothing — output is JSON artifacts |
| **Teammate B** | `apps/firmware/**`, Wokwi, demo data | nothing — separate process |
| **Teammate C** | pitch, script, `docs/` prose, testing the demo path | nothing |

The reason Teammate A gets models and Teammate B gets firmware is not
seniority. Those two areas have **clean interfaces** — a JSON file and an MQTT
message — so a mistake there cannot take the app down.

---

## Teammate A — model training

Brief: [`packages/models/HANDOFF.md`](../packages/models/HANDOFF.md)

Download ATP3 (real pond data, 19 months, five sites, with contamination
indicators) and GLORIA (real chlorophyll/reflectance), retrain two of the three
models on real data instead of our simulator, report honest metrics.

**Done when:** `npm run models:train` produces artifacts the app still loads,
and the metrics files say what the real numbers are.

**Cannot break the app.** The worst case is a model that scores badly, and we
would rather know.

---

## Teammate B — the physical node

Brief: [`apps/firmware/README.md`](../apps/firmware/README.md)

1. Open the Wokwi project, paste in `diagram.json` and `src/main.cpp`.
2. Set `POND_ID` to a real pond id from the database.
3. Confirm readings arrive — the console should show them within a minute.
4. Get the potentiometer demo working reliably: turn a knob, dashboard moves.

**Done when:** you can demo it twice in a row without touching anything else.

That knob is the moment a judge remembers. It is worth one person's full
attention.

---

## Teammate C — the pitch and the demo path

Nobody owns this and it is usually what loses hackathons.

1. Walk the full path on a phone: landing → console → a pond → plan ahead →
   verify a report. Write down every place it confuses you.
2. Own the four-sentence pitch from `README.md` and the objection-and-answer
   in `docs/HOW-IT-WORKS.md`. Be able to answer "why is an honest farmer
   credited at 40%?" without notes.
3. Keep the demo script: exact clicks, in order, with the numbers you expect to
   see. Run it after every deploy.

**Done when:** you can drive the demo yourself, on a phone, while someone
interrupts you with questions.

---

## Mahit — the rest

In order: batches and minting (M1), marketplace and retirement (M2), wiring the
divergence classifier (M3). See [`docs/ROADMAP.md`](ROADMAP.md).

These are the ones that need the whole system in your head at once, which is
why they are not delegated.

---

## Working rules

- **Pull before you start, push as soon as something works.** One branch,
  `main`. A change you sit on for three hours is a conflict you resolve later.
- **`./scripts/commit.sh "message" <your paths>`** — paths are required. It
  refuses to stage files you did not name, which is what stops two people
  committing each other's half-finished work.
- **Never edit outside your column.** Need something from someone else's area?
  Ask in `.agents/INBOX.md`.
- **Deploy is automatic.** Push to `main` and it is live within two minutes.
  Check `deploy/last-deploy.log` on the VPS if something looks stale.
