/**
 * A farmer managing their own land: adding ponds and taking them out of use.
 *
 * PONDS ARE DISABLED, NEVER DELETED.
 *
 * A pond that produced credits in 2025 has to still resolve in 2030 when
 * somebody audits those credits. Deleting the row would orphan every
 * divergence check, harvest record and batch that referenced it, and the
 * evidence trail is the entire product. So `DELETE` is not offered at all;
 * there is only disable, which records when and why.
 *
 * Geometry is validated because it drives real conclusions — width decides
 * whether satellites can see the pond, depth decides self-shading, and a
 * typo in either quietly changes what the farm is told it can earn.
 */

import { Router, type Response } from 'express';
import { pool } from '../db/client.ts';
import { buildSensorPlan } from '../services/sensor-plan.ts';
import { kitFor, nodeCircuit, nodesForPond, signalsFor, type Kit } from '../services/circuit.ts';

export const landRouter = Router();

function send(res: Response, err: unknown) {
  const status = (err as { status?: number }).status ?? 500;
  if (status === 500) console.error('[land]', err);
  res.status(status).json({
    error: err instanceof Error ? err.message : 'Unexpected error',
  });
}

/** Beyond this a single raceway cannot be mixed evenly by one paddlewheel. */
const MAX_POND_M2 = 12_000;

/*
 * What the water arrives as. This is not a label — it decides the influent
 * nitrogen the projection runs on, which after sunlight is the biggest input
 * to how fast a pond grows.
 */
const INLET_SOURCES = ['cetp', 'dairy', 'textile', 'sewage', 'borewell', 'canal', 'other'] as const;

/** An unlined pond loses water and nutrients to the soil beneath it. */
const LINERS = ['none', 'clay', 'hdpe', 'concrete'] as const;

/** Optional free-form detail, validated rather than trusted. */
function optionalText<T extends readonly string[]>(
  value: unknown, allowed: T, field: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const v = String(value).trim().toLowerCase();
  if (!allowed.includes(v as T[number])) {
    throw Object.assign(
      new Error(`${field} must be one of: ${allowed.join(', ')}`),
      { status: 400 },
    );
  }
  return v;
}

/**
 * Why a proposed shape is impossible, or null if it is fine.
 *
 * Shared by add and edit: a pond you could not have created is also a pond you
 * should not be able to resize into.
 */
function geometryProblem(areaM2: number, depthM: number): string | null {
  if (areaM2 > MAX_POND_M2) {
    return `${Math.round(areaM2).toLocaleString('en-IN')} m² is too large for one `
      + `raceway — a single paddlewheel cannot mix it evenly past about `
      + `${MAX_POND_M2.toLocaleString('en-IN')} m². Split it into two ponds.`;
  }
  if (depthM > 0.6) {
    return 'Deeper than 60 cm and the culture shades itself faster than the '
      + 'extra volume earns. Most working raceways run 20–30 cm.';
  }
  return null;
}

/** Every pond at a site, disabled ones included and flagged. */
landRouter.get('/site/:siteId/ponds', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.label, p.area_m2, p.depth_m, p.length_m, p.width_m,
              p.strain, p.active, p.retired_at, p.retired_reason, p.created_at,
              p.inoculated_at, p.inlet_source, p.liner, p.paddlewheel_kw,
              p.target_od, p.notes,
              (SELECT MAX(observed_at) FROM telemetry t WHERE t.pond_id = p.id)
                AS last_reading,
              (SELECT COUNT(*)::int FROM divergence_checks d WHERE d.pond_id = p.id)
                AS check_count
         FROM ponds p
        WHERE p.site_id = $1
        ORDER BY p.active DESC, p.label`,
      [req.params.siteId],
    );

    res.json(rows.map((r) => ({
      id: r.id,
      label: r.label,
      areaM2: Number(r.area_m2),
      depthM: Number(r.depth_m),
      lengthM: Number(r.length_m),
      widthM: Number(r.width_m),
      strain: r.strain,
      active: r.active,
      retiredAt: r.retired_at ? r.retired_at.toISOString() : null,
      retiredReason: r.retired_reason,
      createdAt: r.created_at ? r.created_at.toISOString() : null,
      lastReadingAt: r.last_reading ? r.last_reading.toISOString() : null,
      checkCount: r.check_count,
      // Below ~40 m wide, Sentinel-2's 20 m bands cannot give clean pixels.
      satelliteResolvable: Number(r.width_m) >= 40,
      // One multiparameter sonde and one node per pond. See lib/planning.ts.
      sensorsNeeded: r.active ? 1 : 0,
      inoculatedAt: r.inoculated_at ? r.inoculated_at.toISOString() : null,
      inletSource: r.inlet_source,
      liner: r.liner,
      paddlewheelKw: r.paddlewheel_kw === null ? null : Number(r.paddlewheel_kw),
      targetOd: r.target_od === null ? null : Number(r.target_od),
      notes: r.notes,
    })));
  } catch (err) {
    send(res, err);
  }
});

/**
 * What to install here, where to put it, and what it costs.
 *
 * An endpoint rather than a slide, so the number on screen and the number in
 * the deck are the same number.
 */
landRouter.get('/site/:siteId/sensor-plan', async (req, res) => {
  try {
    const plan = await buildSensorPlan(req.params.siteId);
    if (!plan) return res.status(404).json({ error: 'No such site' });
    return res.json(plan);
  } catch (err) {
    return send(res, err);
  }
});

/**
 * The simulated node circuit for a pond of this size and tier: parts, pins,
 * nets, ₹ bill of materials and power budget. ?areaM2=&tier= or ?kit=
 */
landRouter.get('/hardware/circuit', (req, res) => {
  const areaM2 = Number(req.query.areaM2);
  const tier = typeof req.query.tier === 'string' ? req.query.tier : 'small';
  const kits: Kit[] = ['basic', 'standard', 'industrial'];
  const kit = kits.includes(req.query.kit as Kit)
    ? req.query.kit as Kit
    : kitFor(Number.isFinite(areaM2) ? areaM2 : 5_000, tier);
  const sizing = Number.isFinite(areaM2) && areaM2 > 0 ? nodesForPond(areaM2) : null;
  const circuit = nodeCircuit(kit);
  res.json({ sizing, circuit, totalInr: circuit.bomInr * (sizing?.nodes ?? 1) });
});

/** What each pin reads for a pond state. ?tempC&ph&doMgL&od&paddlewheelOn */
landRouter.get('/hardware/signals', (req, res) => {
  const n = (k: string) => Number(req.query[k]);
  const readings = { tempC: n('tempC'), ph: n('ph'), doMgL: n('doMgL'), od: n('od') };
  if (Object.values(readings).some((v) => !Number.isFinite(v))) {
    return res.status(400).json({ error: 'tempC, ph, doMgL and od are required numbers' });
  }
  const pw = req.query.paddlewheelOn;
  return res.json(signalsFor({ ...readings, paddlewheelOn: pw === undefined ? null : pw === 'true' }));
});

/** Every pond at a site as simulated nodes, with the site's hardware bill. */
landRouter.get('/site/:siteId/circuit', async (req, res) => {
  try {
    const { rows: site } = await pool.query('SELECT id, name, tier FROM sites WHERE id = $1', [req.params.siteId]);
    if (!site[0]) return res.status(404).json({ error: 'No such site' });
    const { rows } = await pool.query(
      'SELECT id, label, area_m2 FROM ponds WHERE site_id = $1 AND active ORDER BY label', [req.params.siteId],
    );
    const ponds = rows.map((p) => {
      const areaM2 = Number(p.area_m2);
      const kit = kitFor(areaM2, site[0].tier);
      const { nodes, because } = nodesForPond(areaM2);
      const circuit = nodeCircuit(kit);
      return { pondId: p.id, label: p.label, areaM2, kit, nodes, because, nodeInr: circuit.bomInr, totalInr: nodes * circuit.bomInr };
    });
    const nodes = ponds.reduce((s, p) => s + p.nodes, 0);
    // Industrial nodes talk LoRa, so they need somewhere to land.
    const gatewayInr = ponds.some((p) => p.kit === 'industrial') ? 11_000 : 0;
    return res.json({
      site: site[0],
      ponds,
      totals: { nodes, gatewayInr, hardwareInr: ponds.reduce((s, p) => s + p.totalInr, 0) + gatewayInr },
    });
  } catch (err) {
    return send(res, err);
  }
});

/** Add a pond. */
landRouter.post('/site/:siteId/ponds', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const label = typeof b.label === 'string' ? b.label.trim() : '';
    const lengthM = Number(b.lengthM);
    const widthM = Number(b.widthM);
    const depthM = Number(b.depthM);
    const strain = typeof b.strain === 'string' && b.strain.trim()
      ? b.strain.trim() : 'spirulina';

    if (!label) return res.status(400).json({ error: 'Give the pond a name' });
    for (const [name, v] of [['length', lengthM], ['width', widthM], ['depth', depthM]] as const) {
      if (!Number.isFinite(v) || v <= 0) {
        return res.status(400).json({ error: `${name} must be a positive number of metres` });
      }
    }

    const areaM2 = lengthM * widthM;
    const problem = geometryProblem(areaM2, depthM);
    if (problem) return res.status(422).json({ error: problem });

    const { rows: siteRows } = await pool.query('SELECT id FROM sites WHERE id = $1', [req.params.siteId]);
    if (!siteRows[0]) return res.status(404).json({ error: 'No such site' });

    const { rows } = await pool.query(
      `INSERT INTO ponds (site_id, label, area_m2, depth_m, length_m, width_m, strain)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.params.siteId, label, areaM2, depthM, lengthM, widthM, strain],
    );

    // Keep the site's headline area consistent with the ponds under it.
    await pool.query(
      `UPDATE sites SET total_area_m2 =
         (SELECT COALESCE(SUM(area_m2), 0) FROM ponds WHERE site_id = $1 AND active)
       WHERE id = $1`,
      [req.params.siteId],
    );

    res.status(201).json({
      id: rows[0].id,
      label,
      areaM2,
      satelliteResolvable: widthM >= 40,
      note: widthM >= 40
        ? 'Wide enough for satellite verification.'
        : `At ${widthM} m wide this pond is below the 40 m satellites need, so it `
          + 'will be verified by drone or weighbridge instead.',
    });
  } catch (err) {
    send(res, err);
  }
});

/**
 * Edit a pond, or take it out of use and bring it back.
 *
 * Partial by design: the land screen sends the one field the farmer changed, so
 * an absent key means "leave it alone" rather than "set it to nothing". Sending
 * `{ areaM2 }` is refused on purpose — area is length × width and nothing else,
 * because a pond whose stated area disagrees with its stated sides produces a
 * ceiling calculation nobody can defend.
 *
 * There is deliberately no delete. History stays.
 */
landRouter.patch('/ponds/:id', async (req, res) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;

    const { rows: existing } = await pool.query(
      `SELECT id, site_id, label, area_m2, depth_m, length_m, width_m, strain,
              active, retired_reason
         FROM ponds
        WHERE id = $1`,
      [req.params.id],
    );
    const pond = existing[0];
    if (!pond) return res.status(404).json({ error: 'No such pond' });

    const EDITABLE = [
      'label', 'lengthM', 'widthM', 'depthM', 'strain', 'active',
      'inoculatedAt', 'inletSource', 'liner', 'paddlewheelKw', 'targetOd', 'notes',
    ] as const;
    if (!EDITABLE.some((key) => key in b)) {
      if ('areaM2' in b) {
        return res.status(400).json({
          error:
            'Set length and width instead — area is worked out from them, so '
            + 'editing it directly would let the two disagree.',
        });
      }
      return res.status(400).json({
        error: `Nothing to change. Send any of: ${EDITABLE.join(', ')}.`,
      });
    }

    let active = Boolean(pond.active);
    let reason: string | null = pond.retired_reason ?? null;
    if ('active' in b) {
      if (typeof b.active !== 'boolean') {
        return res.status(400).json({ error: 'active must be true or false' });
      }
      active = b.active;
      const given = typeof b.reason === 'string' ? b.reason.trim() : '';
      if (!active && !given) {
        return res.status(400).json({
          error:
            'Say why it is going out of use — it appears in the audit trail for '
            + 'any credits this pond produced.',
        });
      }
      reason = active ? null : given;
    }

    let label = String(pond.label);
    if ('label' in b) {
      label = typeof b.label === 'string' ? b.label.trim() : '';
      if (!label) return res.status(400).json({ error: 'Give the pond a name' });
    }

    let strain = String(pond.strain);
    if ('strain' in b) {
      const given = typeof b.strain === 'string' ? b.strain.trim() : '';
      if (!given) return res.status(400).json({ error: 'Give the pond a strain' });
      strain = given;
    }

    const dims = {
      lengthM: Number(pond.length_m),
      widthM: Number(pond.width_m),
      depthM: Number(pond.depth_m),
    };
    const WORD = { lengthM: 'length', widthM: 'width', depthM: 'depth' } as const;
    for (const key of ['lengthM', 'widthM', 'depthM'] as const) {
      if (!(key in b)) continue;
      const v = Number(b[key]);
      if (!Number.isFinite(v) || v <= 0) {
        return res.status(400).json({
          error: `${WORD[key]} must be a positive number of metres`,
        });
      }
      dims[key] = v;
    }

    const areaM2 = dims.lengthM * dims.widthM;
    const problem = geometryProblem(areaM2, dims.depthM);
    if (problem) return res.status(422).json({ error: problem });

    // The operating record. `undefined` means untouched, `null` means cleared —
    // COALESCE below keeps the stored value for the former.
    const inletSource = optionalText(b.inletSource, INLET_SOURCES, 'inletSource');
    const liner = optionalText(b.liner, LINERS, 'liner');

    let inoculatedAt: Date | null | undefined;
    if ('inoculatedAt' in b) {
      if (b.inoculatedAt === null || b.inoculatedAt === '') inoculatedAt = null;
      else {
        const at = new Date(String(b.inoculatedAt));
        if (Number.isNaN(at.getTime())) {
          return res.status(400).json({ error: 'inoculatedAt must be a date' });
        }
        if (at.getTime() > Date.now() + 86_400_000) {
          return res.status(422).json({ error: 'A culture cannot have been started in the future.' });
        }
        inoculatedAt = at;
      }
    }

    let paddlewheelKw: number | null | undefined;
    if ('paddlewheelKw' in b) {
      if (b.paddlewheelKw === null || b.paddlewheelKw === '') paddlewheelKw = null;
      else {
        const kw = Number(b.paddlewheelKw);
        // A paddlewheel on a raceway this size is hundreds of watts to a few kW.
        if (!Number.isFinite(kw) || kw <= 0 || kw > 50) {
          return res.status(422).json({
            error: 'paddlewheelKw looks wrong — a raceway paddlewheel is 0.2 to a few kW.',
          });
        }
        paddlewheelKw = kw;
      }
    }

    let targetOd: number | null | undefined;
    if ('targetOd' in b) {
      if (b.targetOd === null || b.targetOd === '') targetOd = null;
      else {
        const od = Number(b.targetOd);
        if (!Number.isFinite(od) || od <= 0 || od > 4) {
          return res.status(422).json({
            error: 'targetOd must be between 0 and 4 — working raceways harvest around 0.6 to 1.5.',
          });
        }
        targetOd = od;
      }
    }

    const notes = 'notes' in b
      ? (typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 2000) : null)
      : undefined;

    const { rows } = await pool.query(
      `UPDATE ponds
          SET label = $2,
              length_m = $3,
              width_m = $4,
              depth_m = $5,
              area_m2 = $6,
              strain = $7,
              active = $8,
              retired_at = CASE WHEN $8 THEN NULL ELSE COALESCE(retired_at, now()) END,
              retired_reason = CASE WHEN $8 THEN NULL ELSE $9 END,
              inoculated_at = COALESCE($10, CASE WHEN $11 THEN NULL ELSE inoculated_at END),
              inlet_source = COALESCE($12, CASE WHEN $13 THEN NULL ELSE inlet_source END),
              liner = COALESCE($14, CASE WHEN $15 THEN NULL ELSE liner END),
              paddlewheel_kw = COALESCE($16, CASE WHEN $17 THEN NULL ELSE paddlewheel_kw END),
              target_od = COALESCE($18, CASE WHEN $19 THEN NULL ELSE target_od END),
              notes = COALESCE($20, CASE WHEN $21 THEN NULL ELSE notes END)
        WHERE id = $1
      RETURNING id, site_id, label, area_m2, depth_m, length_m, width_m, strain,
                active, retired_reason, inoculated_at, inlet_source, liner,
                paddlewheel_kw, target_od, notes`,
      [req.params.id, label, dims.lengthM, dims.widthM, dims.depthM, areaM2,
       strain, active, reason,
       inoculatedAt ?? null, inoculatedAt === null,
       inletSource ?? null, inletSource === null,
       liner ?? null, liner === null,
       paddlewheelKw ?? null, paddlewheelKw === null,
       targetOd ?? null, targetOd === null,
       notes ?? null, notes === null],
    );
    const row = rows[0];

    await pool.query(
      `UPDATE sites SET total_area_m2 =
         (SELECT COALESCE(SUM(area_m2), 0) FROM ponds WHERE site_id = $1 AND active)
       WHERE id = $1`,
      [row.site_id],
    );

    // Crossing the 40 m line changes how this pond gets verified for the rest of
    // its life, so it is said out loud rather than left for the farmer to notice.
    const wasResolvable = Number(pond.width_m) >= 40;
    const nowResolvable = Number(row.width_m) >= 40;
    const changeNotes: string[] = [];
    if (Boolean(pond.active) !== Boolean(row.active)) {
      changeNotes.push(row.active
        ? 'Back in use. New readings will be checked again.'
        : 'Out of use. Its history and any credits it produced are unchanged.');
    }
    if (Number(pond.area_m2) !== Number(row.area_m2)) {
      changeNotes.push(`Area is now ${Math.round(Number(row.area_m2)).toLocaleString('en-IN')} m²`
        + ` (${row.length_m} × ${row.width_m} m).`);
    }
    if (wasResolvable !== nowResolvable) {
      changeNotes.push(nowResolvable
        ? 'Now wide enough for satellite verification.'
        : `At ${row.width_m} m wide this pond is below the 40 m satellites need, so it `
          + 'will be verified by drone or weighbridge instead.');
    }

    res.json({
      id: row.id,
      siteId: row.site_id,
      label: row.label,
      areaM2: Number(row.area_m2),
      lengthM: Number(row.length_m),
      widthM: Number(row.width_m),
      depthM: Number(row.depth_m),
      strain: row.strain,
      active: row.active,
      retiredReason: row.retired_reason,
      inoculatedAt: row.inoculated_at ? row.inoculated_at.toISOString() : null,
      inletSource: row.inlet_source,
      liner: row.liner,
      paddlewheelKw: row.paddlewheel_kw === null ? null : Number(row.paddlewheel_kw),
      targetOd: row.target_od === null ? null : Number(row.target_od),
      notes: row.notes,
      satelliteResolvable: nowResolvable,
      note: changeNotes.join(' ') || 'Saved.',
    });
  } catch (err) {
    send(res, err);
  }
});
