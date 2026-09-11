# Onboarding

For Chetan, Henil and Daksh. This assumes you have **not** used this stack before. Follow it in
order. If something fails, stop and message Mahit rather than improvising — a broken local setup
wastes your evening, not just ten minutes.

---

## 1. Install what you need

| Tool | Version | Check with | Get it |
|---|---|---|---|
| Node | 22+ | `node --version` | `nvm install 22` |
| Postgres | 16+ | `psql --version` | `sudo apt install postgresql` |
| Git | any | `git --version` | already installed |

**Only if you're touching `packages/physics`** (that's Mahit and Chetan):

```bash
curl https://sh.rustup.rs -sSf | sh
cargo install wasm-pack          # takes a few minutes, do it now not later
```

---

## 2. Get the repo running

```bash
git clone https://github.com/Daksh2477/RunTimeZero.git
cd RunTimeZero
npm install
cp .env.example .env
```

Create the database:

```bash
createdb algacarbon
npm run db:setup
```

Then:

```bash
npm run dev
```

API on `http://localhost:4000`, web on `http://localhost:3000`. If both come up, you're done.

---

## 3. The one thing to understand before writing code

Two streams describe the same pond, and they must stay apart:

- **Telemetry** is what the operator says. Always treated as an unverified claim.
- **Independent observation** is evidence the operator doesn't control — satellite, drone, or a
  weighed harvest.

They meet in exactly one place: the reconciliation engine, which credits **the lower of the two**.

If you ever find yourself writing code that copies a number from one stream into the other because
it would be convenient — stop. That's the bug that makes the entire project meaningless, and it
will not look like a bug when you write it.

---

## 4. Your first change, end to end

We work on a **single branch: `main`**. Pull before you start, commit after every meaningful
change, push often.

```bash
git pull --rebase                    # ALWAYS do this first

# ... edit files ...

./scripts/commit.sh "add fleet board row component"
./scripts/push.sh                    # pulls and rebases for you
```

With four people on one branch, the rule that matters is **pull before you edit and push as soon as
something works**. A change you sit on for three hours is a merge conflict you resolve at 3am
instead of building.

If `git pull --rebase` reports a conflict, stop and ask. Do not force-push your way out of it.

---

## 5. Where your work lives

| You | Your directories | Read but don't edit |
|---|---|---|
| **Chetan** | `packages/physics/src/sim.rs`, `faults.rs`, `scripts/seed.ts` | `packages/types` |
| **Henil** | `apps/web/src/app/(console)`, `apps/web/src/components` | `packages/types`, `apps/api/src/routes` |
| **Daksh** | `apps/api/src/ingest`, `apps/web/src/app/(verify)`, `(sim)` | `packages/types` |
| **Mahit** | `packages/types`, `packages/physics`, `apps/api/src/reconcile`, `apps/contracts` | — |

If you need something from someone else's area, **ask them to expose it through
`packages/types`** rather than editing their files. That's the whole reason the types package
exists.

---

## 6. House rules

1. **Files stay ~150–250 lines.** Growing past that means the file is doing two jobs. Split it.
2. **No new dependencies without asking Mahit.** We're deliberately dependency-light.
3. **No `SELECT *`.** Explicit column lists in application code, always.
4. **`async/await`, not `.then()` chains.**
5. **No default exports** except Next.js pages and components.
6. **Comment the non-obvious *why*.** Never comment what the code plainly does.
7. **Never force-push. Never rewrite history on `develop` or `main`.**
8. Commit messages: imperative, one line, no emoji. `add ndci parser`, not `Added NDCI stuff!! 🚀`

---

## 7. When you're stuck

In order:

1. Read the error. The actual text, not the first line.
2. Check `docs/ARCHITECTURE.md` — the answer to "where does this go?" is usually there.
3. Check `docs/DECISIONS.md` — the answer to "why is it like this?" is usually there.
4. Ask in the group. Paste the **command you ran and the full error**, not "it's not working".

Nobody here expects you to already know this stack. Asking early is cheap; silently guessing for
three hours is not.
