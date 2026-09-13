-- RunTimeZero / AlgaCarbon — database schema
--
-- Two principles run through this file:
--
--   1. Evidence tables are APPEND-ONLY. telemetry, imagery_observations and
--      harvest_records are never UPDATEd and never DELETEd. If a reading was
--      wrong, a later reading supersedes it; the original stays. A verification
--      system that can quietly rewrite its own inputs verifies nothing.
--
--   2. The operator's claim and the independent estimate live in SEPARATE
--      tables and are only ever brought together in divergence_checks. Do not
--      add a column to telemetry that holds an independent figure, or vice
--      versa, however convenient it looks at 3am.

-- Idempotent: safe to run repeatedly against an existing database.
-- An earlier version used bare CREATE TYPE, so a second run aborted the whole
-- transaction on "type already exists" and left nothing applied.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Postgres has no CREATE TYPE IF NOT EXISTS, so each enum is guarded.
DO $$ BEGIN
  CREATE TYPE verification_tier AS ENUM ('smallholder', 'small', 'mid', 'facility');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE host_industry AS ENUM (
    'textile_dyeing', 'pulp_paper', 'distillery',
    'dairy_food', 'cetp', 'municipal_stp', 'none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE telemetry_source AS ENUM ('sensor', 'manual', 'scada', 'simulated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE observation_channel AS ENUM ('sentinel2', 'drone', 'weighbridge', 'field_sample');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE verdict AS ENUM ('ok', 'watch', 'flagged', 'insufficient_evidence');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE disposition AS ENUM (
    'buried', 'biochar', 'bioplastic',
    'sold_as_feed', 'sold_as_fertiliser', 'undisclosed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE expense_category AS ENUM (
    'paddlewheel', 'pumping', 'harvesting', 'drying', 'nutrients',
    'co2', 'make_up_water', 'labour', 'maintenance', 'platform');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------- sites

CREATE TABLE IF NOT EXISTS sites (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  lat            DOUBLE PRECISION NOT NULL,
  lon            DOUBLE PRECISION NOT NULL,
  timezone       TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  tier           verification_tier NOT NULL,
  host_industry  host_industry NOT NULL DEFAULT 'none',
  total_area_m2  DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ponds (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id   UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  label     TEXT NOT NULL,
  area_m2   DOUBLE PRECISION NOT NULL CHECK (area_m2 > 0),
  depth_m   DOUBLE PRECISION NOT NULL CHECK (depth_m > 0),
  length_m  DOUBLE PRECISION NOT NULL,
  -- Below ~40 m, Sentinel-2 band B5 (20 m) cannot give clean pixels and the
  -- site falls back to drone or weighbridge evidence.
  width_m   DOUBLE PRECISION NOT NULL,
  strain    TEXT NOT NULL DEFAULT 'spirulina',
  -- Ponds are DISABLED, never deleted. A pond that produced credits in 2025
  -- must still resolve in 2030 when somebody audits those credits, so the
  -- row and its telemetry stay. `active` only controls what the operator
  -- sees and what new checks run against.
  active        BOOLEAN NOT NULL DEFAULT true,
  retired_at    TIMESTAMPTZ,
  retired_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ponds_site ON ponds(site_id) WHERE active;

-- ------------------------------------------------- stream 1: the claim

-- APPEND-ONLY. Operator-controlled. Every row here is an assertion, not a fact,
-- regardless of how it was produced.
CREATE TABLE IF NOT EXISTS telemetry (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id              UUID NOT NULL REFERENCES ponds(id) ON DELETE CASCADE,
  observed_at          TIMESTAMPTZ NOT NULL,
  source               telemetry_source NOT NULL,
  co2_uptake_kg        DOUBLE PRECISION,
  ph                   DOUBLE PRECISION,
  dissolved_oxygen_mgl DOUBLE PRECISION,
  temperature_c        DOUBLE PRECISION,
  optical_density      DOUBLE PRECISION,
  energy_kwh           DOUBLE PRECISION,
  ingested_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_pond_time ON telemetry(pond_id, observed_at DESC);

-- ------------------------------------- stream 2: independent of operator

-- APPEND-ONLY. Evidence the operator does not produce.
CREATE TABLE IF NOT EXISTS imagery_observations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id              UUID NOT NULL REFERENCES ponds(id) ON DELETE CASCADE,
  observed_at          TIMESTAMPTZ NOT NULL,
  channel              observation_channel NOT NULL,
  chlorophyll_index    DOUBLE PRECISION,
  measured_dry_mass_kg DOUBLE PRECISION,
  -- Scene or flight id, so a third party can re-fetch the same source.
  source_ref           TEXT NOT NULL,
  cloud_fraction       DOUBLE PRECISION,
  ingested_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obs_pond_time ON imagery_observations(pond_id, observed_at DESC);

-- APPEND-ONLY. For the smallholder tier this IS the independent channel: a mass
-- on a public scale is cruder in frequency than imagery but stronger in kind.
CREATE TABLE IF NOT EXISTS harvest_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id         UUID NOT NULL REFERENCES ponds(id) ON DELETE CASCADE,
  harvested_at    TIMESTAMPTZ NOT NULL,
  wet_mass_kg     DOUBLE PRECISION NOT NULL CHECK (wet_mass_kg >= 0),
  moisture_frac   DOUBLE PRECISION NOT NULL CHECK (moisture_frac BETWEEN 0 AND 1),
  dry_mass_kg     DOUBLE PRECISION GENERATED ALWAYS AS
                    (wet_mass_kg * (1 - moisture_frac)) STORED,
  weighbridge_ref TEXT,
  photo_ref       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_harvest_pond_time ON harvest_records(pond_id, harvested_at DESC);

-- ------------------------------------------------------ derived figures

-- Always carries a band. A point estimate without bounds is unusable for
-- verification: validated NDCI runs to an error factor near 2.4, so we compare
-- intervals, never bare numbers.
CREATE TABLE IF NOT EXISTS estimates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id          UUID NOT NULL REFERENCES ponds(id) ON DELETE CASCADE,
  window_start     TIMESTAMPTZ NOT NULL,
  window_end       TIMESTAMPTZ NOT NULL,
  channel          observation_channel NOT NULL,
  biomass_kg       DOUBLE PRECISION NOT NULL,
  biomass_low_kg   DOUBLE PRECISION NOT NULL,
  biomass_high_kg  DOUBLE PRECISION NOT NULL,
  observation_ids  UUID[] NOT NULL DEFAULT '{}',
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (biomass_low_kg <= biomass_kg AND biomass_kg <= biomass_high_kg)
);

-- The only table where the two streams meet.
CREATE TABLE IF NOT EXISTS divergence_checks (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pond_id                     UUID NOT NULL REFERENCES ponds(id) ON DELETE CASCADE,
  window_start                TIMESTAMPTZ NOT NULL,
  window_end                  TIMESTAMPTZ NOT NULL,
  claimed_co2_kg              DOUBLE PRECISION NOT NULL,
  independent_co2_kg          DOUBLE PRECISION NOT NULL,
  independent_low_co2_kg      DOUBLE PRECISION NOT NULL,
  independent_high_co2_kg     DOUBLE PRECISION NOT NULL,
  ceiling_co2_kg              DOUBLE PRECISION NOT NULL,
  divergence                  DOUBLE PRECISION NOT NULL,
  consecutive_same_direction  INTEGER NOT NULL DEFAULT 0,
  verdict                     verdict NOT NULL,
  -- min(claimed, independent_low, ceiling), or 0 when flagged. Never an average.
  creditable_co2_kg           DOUBLE PRECISION NOT NULL CHECK (creditable_co2_kg >= 0),
  reason                      TEXT NOT NULL,
  computed_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_div_pond_time ON divergence_checks(pond_id, window_end DESC);

-- ------------------------------------------------------------- batches

CREATE TABLE IF NOT EXISTS batches (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id                  UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  period_start             TIMESTAMPTZ NOT NULL,
  period_end               TIMESTAMPTZ NOT NULL,
  claimed_co2_kg           DOUBLE PRECISION NOT NULL,
  independent_co2_kg       DOUBLE PRECISION NOT NULL,
  ceiling_co2_kg           DOUBLE PRECISION NOT NULL,
  creditable_co2_kg        DOUBLE PRECISION NOT NULL CHECK (creditable_co2_kg >= 0),
  -- Only buried / biochar / bioplastic are removals. The contract refuses the
  -- rest, because utilisation is not sequestration.
  disposition              disposition NOT NULL DEFAULT 'undisclosed',
  disposition_evidence_ref TEXT,
  mrv_report_cid           TEXT,
  evidence_token_id        TEXT,
  minted_tonnes            DOUBLE PRECISION,
  tx_hash                  TEXT,
  divergence_check_ids     UUID[] NOT NULL DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_token ON batches(evidence_token_id)
  WHERE evidence_token_id IS NOT NULL;

-- --------------------------------------------------------- retirements

-- A retirement is the end of a credit's life: someone claims it against their
-- own emissions and it can never be sold again. This table is the ledger of
-- that, and `batches.creditable_co2_kg` minus the sum of retirements here is
-- what remains available.
--
-- `beneficiary` is who the claim belongs to, which is not necessarily who
-- paid. That distinction matters: a broker retiring on behalf of a mill must
-- name the mill, or the same tonne can be claimed twice in two ledgers.
CREATE TABLE IF NOT EXISTS retirements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id         UUID NOT NULL REFERENCES batches(id) ON DELETE RESTRICT,
  kg               DOUBLE PRECISION NOT NULL CHECK (kg > 0),
  beneficiary      TEXT NOT NULL CHECK (length(trim(beneficiary)) > 0),
  -- Set once the burn lands on chain. Null means recorded here only.
  certificate_id   TEXT,
  tx_hash          TEXT,
  retired_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retirements_batch ON retirements(batch_id);

-- ------------------------------------------------- researcher data access

-- Selling pond data to researchers is the third revenue line, and the one
-- with the sharpest ethical edge: the data describes a real farm's
-- performance, and a bad season is commercially sensitive.
--
-- So consent lives on the site, not on the buyer. A site opts in, chooses
-- whether its identity travels with the data, and can withdraw. Nothing is
-- licensed without a row here saying the operator agreed.
CREATE TABLE IF NOT EXISTS data_consent (
  site_id        UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  -- false means the site is published as "a 4 ha CETP site in Gujarat"
  -- rather than by name. Most operators want this.
  share_identity BOOLEAN NOT NULL DEFAULT false,
  -- Revenue share to the farm, 0..1. The farm generated the data.
  revenue_share  DOUBLE PRECISION NOT NULL DEFAULT 0.5
                   CHECK (revenue_share >= 0 AND revenue_share <= 1),
  granted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at   TIMESTAMPTZ
);

-- One purchased licence to a dataset. Deliberately not a file: the buyer
-- gets a scoped, revocable API key, so a withdrawal by the farm actually
-- takes effect instead of chasing a CSV somebody already downloaded.
CREATE TABLE IF NOT EXISTS data_licences (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_name     TEXT NOT NULL CHECK (length(trim(buyer_name)) > 0),
  buyer_email    TEXT NOT NULL,
  institution    TEXT,
  purpose        TEXT NOT NULL,
  dataset        TEXT NOT NULL,
  price_inr      DOUBLE PRECISION NOT NULL CHECK (price_inr >= 0),
  api_key_hash   TEXT NOT NULL,
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at     TIMESTAMPTZ NOT NULL,
  revoked_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_licences_key ON data_licences(api_key_hash);

-- --------------------------------------------------------- investor board

-- A farm advertising itself for investment. This is a noticeboard, not a
-- securities platform: we carry the listing and the verified production
-- record, and the investor contacts the operator directly. We take no fee
-- and hold no money, which keeps us out of being a broker.
CREATE TABLE IF NOT EXISTS investment_listings (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id            UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  headline           TEXT NOT NULL CHECK (length(trim(headline)) > 0),
  pitch              TEXT NOT NULL,
  seeking_inr        DOUBLE PRECISION NOT NULL CHECK (seeking_inr > 0),
  use_of_funds       TEXT NOT NULL,
  expand_to_m2       DOUBLE PRECISION,
  contact_name       TEXT NOT NULL,
  contact_email      TEXT NOT NULL,
  contact_phone      TEXT,
  status             TEXT NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'in_discussion', 'closed')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON investment_listings(status);

-- An investor registering interest. Stored so the operator sees who asked,
-- and so we never act as an intermediary for the conversation itself.
CREATE TABLE IF NOT EXISTS investor_enquiries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    UUID NOT NULL REFERENCES investment_listings(id) ON DELETE CASCADE,
  investor_name TEXT NOT NULL CHECK (length(trim(investor_name)) > 0),
  investor_email TEXT NOT NULL,
  organisation  TEXT,
  message       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enquiries_listing ON investor_enquiries(listing_id);

-- ------------------------------------------------------------ expenses

CREATE TABLE IF NOT EXISTS expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end   TIMESTAMPTZ NOT NULL,
  category     expense_category NOT NULL,
  amount_inr   DOUBLE PRECISION NOT NULL CHECK (amount_inr >= 0),
  -- Kept for electricity lines so cost can be re-derived at a different tariff.
  energy_kwh   DOUBLE PRECISION,
  note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_expenses_site_period ON expenses(site_id, period_start);

-- ------------------------------------------------- additive migrations
--
-- `CREATE TABLE IF NOT EXISTS` above is a no-op on a database that already has
-- the table, so a column added to one of those definitions NEVER REACHES a
-- database created before it. The deployed API was answering
-- `column p.retired_at does not exist` on the land screen for exactly that
-- reason: production's `ponds` predates the disable-instead-of-delete work,
-- and `npm run db:setup` could not fix it because the CREATE was skipped.
--
-- Anything added to a table after it first shipped belongs here as well as in
-- the definition above. Every statement is idempotent and safe to re-run.

-- Old checks remain readable but explicitly lack a snapshot.
ALTER TABLE divergence_checks ADD COLUMN IF NOT EXISTS evidence_snapshot JSONB;

-- Ponds are disabled, never deleted — see the table definition.
ALTER TABLE ponds ADD COLUMN IF NOT EXISTS strain TEXT NOT NULL DEFAULT 'spirulina';
ALTER TABLE ponds ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE ponds ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;
ALTER TABLE ponds ADD COLUMN IF NOT EXISTS retired_reason TEXT;
ALTER TABLE ponds ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE ponds ADD COLUMN IF NOT EXISTS length_m DOUBLE PRECISION;
ALTER TABLE ponds ADD COLUMN IF NOT EXISTS width_m DOUBLE PRECISION;

-- Geometry is arithmetic, not a guess: length × width = area. Where one side
-- is missing it is derived from the other. A pond with neither is left null
-- rather than given invented dimensions — the land screen says "unknown" and
-- asks, which is the honest behaviour.
UPDATE ponds SET length_m = area_m2 / width_m
  WHERE length_m IS NULL AND width_m IS NOT NULL AND width_m > 0;
UPDATE ponds SET width_m = area_m2 / length_m
  WHERE width_m IS NULL AND length_m IS NOT NULL AND length_m > 0;

-- Cloud fraction arrived with the real Sentinel-2 ingest.
ALTER TABLE imagery_observations ADD COLUMN IF NOT EXISTS cloud_fraction DOUBLE PRECISION;

-- Energy metering is optional per pond; null means no meter, not a stopped mixer.
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS energy_kwh DOUBLE PRECISION;

-- Everything on a batch that came with on-chain anchoring.
ALTER TABLE batches ADD COLUMN IF NOT EXISTS disposition_evidence_ref TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS mrv_report_cid TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS evidence_token_id TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS minted_tonnes DOUBLE PRECISION;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS divergence_check_ids UUID[] NOT NULL DEFAULT '{}';

-- Kept in step with the ponds beneath it by the land routes.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS total_area_m2 DOUBLE PRECISION;

-- What an operator knows about a pond that geometry does not say.
--
-- Each of these changes an answer rather than decorating a form:
--   inoculated_at    — culture age. A three-week culture and a fresh one behave
--                      nothing alike, and the projection warm-start needs it.
--   inlet_source     — decides influent nitrogen, which is the single biggest
--                      input to projected growth after sunlight.
--   liner            — an unlined pond loses water and nutrients to the soil.
--   paddlewheel_kw   — measured motor rating beats the 0.5 W/m² rule of thumb
--                      that energy cost and the mixing check currently assume.
--   target_od        — the density this operator harvests at, so advice can be
--                      "harvest now" rather than a generic band.
ALTER TABLE ponds ADD COLUMN IF NOT EXISTS inoculated_at TIMESTAMPTZ;
ALTER TABLE ponds ADD COLUMN IF NOT EXISTS inlet_source TEXT;
ALTER TABLE ponds ADD COLUMN IF NOT EXISTS liner TEXT;
ALTER TABLE ponds ADD COLUMN IF NOT EXISTS paddlewheel_kw DOUBLE PRECISION;
ALTER TABLE ponds ADD COLUMN IF NOT EXISTS target_od DOUBLE PRECISION;
ALTER TABLE ponds ADD COLUMN IF NOT EXISTS notes TEXT;

-- Produce sales. Both databases got these by hand before they were written
-- down here, so a fresh setup had a produce market with nowhere to store it.
ALTER TABLE harvest_records ADD COLUMN IF NOT EXISTS protein_frac DOUBLE PRECISION;
ALTER TABLE harvest_records ADD COLUMN IF NOT EXISTS lipid_frac DOUBLE PRECISION;
ALTER TABLE harvest_records ADD COLUMN IF NOT EXISTS carbohydrate_frac DOUBLE PRECISION;
ALTER TABLE harvest_records ADD COLUMN IF NOT EXISTS composition_source TEXT
  CHECK (composition_source IN ('lab', 'nir', 'modelled'));
ALTER TABLE harvest_records ADD COLUMN IF NOT EXISTS listed_kg DOUBLE PRECISION;
ALTER TABLE harvest_records ADD COLUMN IF NOT EXISTS asking_inr_per_kg DOUBLE PRECISION;
ALTER TABLE harvest_records ADD COLUMN IF NOT EXISTS sold_kg DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS produce_orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  harvest_id  UUID NOT NULL REFERENCES harvest_records(id) ON DELETE RESTRICT,
  buyer_name  TEXT NOT NULL CHECK (length(trim(buyer_name)) > 0),
  buyer_email TEXT NOT NULL,
  kg          DOUBLE PRECISION NOT NULL CHECK (kg > 0),
  inr_per_kg  DOUBLE PRECISION NOT NULL CHECK (inr_per_kg > 0),
  placed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_harvest ON produce_orders(harvest_id);

-- A seller can pause a credit listing without touching what was issued, and
-- every sale records its price so the market has a history to show.
ALTER TABLE batches ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS asking_inr_per_tonne DOUBLE PRECISION;
ALTER TABLE retirements ADD COLUMN IF NOT EXISTS inr_per_tonne DOUBLE PRECISION;

-- ------------------------------------------------------------ accounts
--
-- Username and password, and nothing else. No email, no reset flow, no
-- profile: this is a prototype login, and every field we do not collect is a
-- field we cannot leak. Passwords are scrypt-hashed in services/auth.ts.
--
-- `role` decides which half of the product you land in. It is not a permission
-- system — the routes check it where it matters and nowhere else.

DO $$ BEGIN
  CREATE TYPE account_role AS ENUM ('operator', 'buyer', 'researcher', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored lowercase so "Raj" and "raj" cannot both exist.
  username      TEXT NOT NULL UNIQUE CHECK (username = lower(username)),
  password_hash TEXT NOT NULL,
  role          account_role NOT NULL DEFAULT 'operator',
  -- Which farm this account manages. Null for buyers and researchers.
  site_id       UUID REFERENCES sites(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- Who bought, so "my activity" does not depend on a typed-in name.
ALTER TABLE retirements ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE produce_orders ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- Sensor nodes. Created with the pond (services/devices.ts); a node signs each
-- reading with its secret so a public broker cannot impersonate it.
CREATE TABLE IF NOT EXISTS devices (
  id           TEXT PRIMARY KEY,
  pond_id      UUID NOT NULL REFERENCES ponds(id) ON DELETE CASCADE,
  node_index   INTEGER NOT NULL DEFAULT 0,
  kit          TEXT NOT NULL,
  secret       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  UNIQUE (pond_id, node_index)
);

COMMIT;
