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
  active    BOOLEAN NOT NULL DEFAULT true
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

COMMIT;
