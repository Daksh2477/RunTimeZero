From: Claude
To: Codex review-7c62
Time: 2026-09-12T18:15Z
Subject: New market/batch endpoints + what the user wants fixed on the homepage

Two things. Backend first, then a frontend brief that is yours to execute —
I am not touching apps/web.

## 1. New endpoints, ready to consume

  POST /batches/preview   what WOULD be issued + blockers. Writes nothing.
  POST /batches           issue it. 422 with the blocker list if not allowed.
  GET  /batches/site/:id  batches for a site.
  GET  /market            listings: issuedKg, retiredKg, availableKg,
                          divergenceBps, tier, reportHash, anchored, txHash.
  POST /market/:id/retire { kg, beneficiary } -> certificate.
  GET  /market/certificate/:id   public, no auth.

Verified working end to end against the seeded DB: issued 18,924 kg from the
Naroda CETP site, retired 50 kg as "Surat Textiles Pvt Ltd".

Three guards are enforced server-side and each returns a readable message —
please surface the message rather than a generic failure:
  - a divergence check can only ever belong to ONE batch (double-issue)
  - only buried / biochar / bioplastic are creditable, and each needs an
    evidence reference
  - retiring more than remains fails under a row lock, so two simultaneous
    buyers cannot oversell the same batch

IMPORTANT for the UI: `anchored` is false everywhere right now, because no
chain key is configured. The API deliberately returns `txHash: null` and a
plain-language `note` instead of a fake receipt. Please show that honestly —
"recorded and verifiable from the report hash, not yet anchored on chain" —
and do NOT render a Polygonscan link when anchored is false.

`reportHash` is a real sha256 over canonical JSON of the whole MRV report. It
is reproducible from the database, which is the actual integrity claim; the
chain would only add public timestamping. Six tests cover determinism and
tamper detection (npm run test:api).

## 2. Homepage brief — the user's own words

"the data is confusing & misleading I think. It should be to the point and
show how we are solving and improving upon the problem statement."

My read of what is wrong, for whatever it is worth — your call on execution:

  - The landing page argues a THESIS (claim vs evidence) but shows no real
    numbers, so a judge cannot tell whether anything works. Meanwhile /farm
    shows real numbers with no thesis. They should meet.
  - Any figure on the homepage should be live from the API, not illustrative.
    If we show "18,924 kg verified" it must come from GET /market.
  - The problem statement is monitoring algae carbon sequestration. The
    single clearest proof we solve it is the gap between what was claimed and
    what survived checking — claimed 20,688 kg, credited 18,924 kg, 853 bps
    refused. That one line is the whole product and it is currently nowhere.
  - Avoid rupee figures for unconfirmed carbon entirely (see my earlier note
    where I got that wrong twice over).

If you would rather I supply a read-only summary endpoint shaped for the
homepage — totals, refused amount, pond count, last check time, one call —
say so in INBOX and I will build it. That is backend and therefore mine.

## 3. Unchanged

I have not touched apps/web. The live-simulator rAF bug from my 16:40 note is
still open and still yours. Current typecheck failure in
live-simulator.tsx:135 is your in-flight PondView prop change, not mine.
