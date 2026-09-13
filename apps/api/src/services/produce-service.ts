/**
 * Selling the algae itself, not the carbon.
 *
 * WHY THIS MATTERS MORE THAN THE CREDITS
 *
 * A tonne of CO₂ at Indian voluntary-market prices is worth a few hundred
 * rupees. The same pond's biomass sold as feed is worth tens of thousands.
 * Carbon is the verification story; produce is where the farm's income
 * actually comes from, and a platform that only sold credits would be
 * solving the smaller half of the problem.
 *
 * Grade — and therefore price — comes from composition, which is why
 * `packages/physics/src/composition.rs` exists. Protein ≥55% is food grade
 * and worth roughly forty times fertiliser; the same dry mass at 39% protein
 * is animal feed. That gap is the single biggest lever a farmer has, and it
 * is set by how they manage nitrogen weeks before harvest.
 */

import { pool } from '../db/client.ts';

/** Indian farm-gate wholesale, ₹/kg. Mirrors apps/web/src/lib/pricing.ts. */
const PRICE_INR: Record<string, { low: number; mid: number; high: number; label: string }> = {
  food: { low: 450, mid: 650, high: 900, label: 'Food-grade spirulina' },
  lipid: { low: 90, mid: 115, high: 140, label: 'Oil-rich biomass' },
  feed: { low: 180, mid: 240, high: 320, label: 'Aquafeed / poultry feed' },
  fertiliser: { low: 8, mid: 12, high: 18, label: 'Soil input' },
};

function gradeOf(protein: number | null, lipid: number | null): string {
  if (protein === null || lipid === null) return 'fertiliser';
  if (protein >= 0.55) return 'food';
  if (lipid >= 0.25) return 'lipid';
  if (protein >= 0.40) return 'feed';
  return 'fertiliser';
}

export interface ProduceListing {
  harvestId: string;
  siteName: string;
  pondLabel: string;
  harvestedAt: string;
  dryMassKg: number;
  availableKg: number;
  grade: string;
  gradeLabel: string;
  protein: number | null;
  lipid: number | null;
  carbohydrate: number | null;
  /** 'lab', 'nir' or 'modelled'. Shown to the buyer — it changes what the
   *  number is worth trusting. */
  compositionSource: string | null;
  askingInrPerKg: number;
  suggestedInrPerKg: number;
  priceLowInr: number;
  priceHighInr: number;
}

export async function listProduce(): Promise<ProduceListing[]> {
  const { rows } = await pool.query(
    `SELECT h.id, h.harvested_at, h.dry_mass_kg, h.listed_kg, h.sold_kg,
            h.asking_inr_per_kg, h.protein_frac, h.lipid_frac,
            h.carbohydrate_frac, h.composition_source,
            p.label AS pond_label, s.name AS site_name
       FROM harvest_records h
       JOIN ponds p ON p.id = h.pond_id
       JOIN sites s ON s.id = p.site_id
      WHERE h.listed_kg IS NOT NULL AND h.listed_kg > h.sold_kg
      ORDER BY h.harvested_at DESC`,
  );

  return rows.map((r) => {
    const protein = r.protein_frac === null ? null : Number(r.protein_frac);
    const lipid = r.lipid_frac === null ? null : Number(r.lipid_frac);
    const grade = gradeOf(protein, lipid);
    const price = PRICE_INR[grade]!;
    return {
      harvestId: r.id,
      siteName: r.site_name,
      pondLabel: r.pond_label,
      harvestedAt: r.harvested_at.toISOString(),
      dryMassKg: Number(r.dry_mass_kg),
      availableKg: Number(r.listed_kg) - Number(r.sold_kg),
      grade,
      gradeLabel: price.label,
      protein,
      lipid,
      carbohydrate: r.carbohydrate_frac === null ? null : Number(r.carbohydrate_frac),
      compositionSource: r.composition_source,
      askingInrPerKg: r.asking_inr_per_kg === null ? price.mid : Number(r.asking_inr_per_kg),
      suggestedInrPerKg: price.mid,
      priceLowInr: price.low,
      priceHighInr: price.high,
    };
  });
}

/** Harvests a farmer could put up for sale, with what each is worth. */
export async function sellableHarvests(siteId: string) {
  const { rows } = await pool.query(
    `SELECT h.id, h.harvested_at, h.dry_mass_kg, h.listed_kg, h.sold_kg,
            h.protein_frac, h.lipid_frac, h.composition_source, p.label AS pond_label
       FROM harvest_records h
       JOIN ponds p ON p.id = h.pond_id
      WHERE p.site_id = $1
      ORDER BY h.harvested_at DESC LIMIT 40`,
    [siteId],
  );

  return rows.map((r) => {
    const protein = r.protein_frac === null ? null : Number(r.protein_frac);
    const lipid = r.lipid_frac === null ? null : Number(r.lipid_frac);
    const grade = gradeOf(protein, lipid);
    const price = PRICE_INR[grade]!;
    const dry = Number(r.dry_mass_kg);
    return {
      harvestId: r.id,
      pondLabel: r.pond_label,
      harvestedAt: r.harvested_at.toISOString(),
      dryMassKg: dry,
      listedKg: r.listed_kg === null ? null : Number(r.listed_kg),
      soldKg: Number(r.sold_kg),
      grade,
      gradeLabel: price.label,
      protein,
      lipid,
      compositionSource: r.composition_source,
      worthInr: Math.round(dry * price.mid),
      // What the same mass would fetch at the bottom grade. The gap is what
      // managing the culture well is worth, in rupees.
      floorInr: Math.round(dry * PRICE_INR.fertiliser!.mid),
    };
  });
}

export async function listForSale(harvestId: string, kg: number, askingInrPerKg: number | null) {
  const { rows } = await pool.query(
    `UPDATE harvest_records
        SET listed_kg = sold_kg + $2, asking_inr_per_kg = $3
      WHERE id = $1 AND $2 <= dry_mass_kg - sold_kg
      RETURNING id, listed_kg, sold_kg`,
    [harvestId, kg, askingInrPerKg],
  );
  if (!rows[0]) {
    throw Object.assign(
      new Error('That is more than the harvest has left, or no such harvest'),
      { status: 409 },
    );
  }
  // listed_kg is lifetime (sold + on offer) so ordering can keep subtracting sold_kg.
  return {
    harvestId: rows[0].id,
    listedKg: Number(rows[0].listed_kg),
    availableKg: Number(rows[0].listed_kg) - Number(rows[0].sold_kg),
  };
}

/** Place an order. Locked, so two buyers cannot take the same sack. */
export async function orderProduce(a: {
  harvestId: string; buyerName: string; buyerEmail: string; kg: number;
  accountId?: string | null;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT listed_kg, sold_kg, asking_inr_per_kg, protein_frac, lipid_frac
         FROM harvest_records WHERE id = $1 FOR UPDATE`,
      [a.harvestId],
    );
    const h = rows[0];
    if (!h || h.listed_kg === null) {
      throw Object.assign(new Error('That harvest is not for sale'), { status: 404 });
    }
    const available = Number(h.listed_kg) - Number(h.sold_kg);
    if (a.kg > available) {
      throw Object.assign(
        new Error(`Only ${available.toFixed(0)} kg is left of this harvest`),
        { status: 409 },
      );
    }

    const grade = gradeOf(
      h.protein_frac === null ? null : Number(h.protein_frac),
      h.lipid_frac === null ? null : Number(h.lipid_frac),
    );
    const rate = h.asking_inr_per_kg === null
      ? PRICE_INR[grade]!.mid : Number(h.asking_inr_per_kg);

    const { rows: orderRows } = await client.query(
      `INSERT INTO produce_orders (harvest_id, buyer_name, buyer_email, kg, inr_per_kg, account_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, placed_at`,
      [a.harvestId, a.buyerName.trim(), a.buyerEmail.trim(), a.kg, rate, a.accountId ?? null],
    );
    await client.query(
      'UPDATE harvest_records SET sold_kg = sold_kg + $2 WHERE id = $1',
      [a.harvestId, a.kg],
    );
    await client.query('COMMIT');

    return {
      id: orderRows[0].id,
      kg: a.kg,
      inrPerKg: rate,
      totalInr: Math.round(a.kg * rate),
      placedAt: orderRows[0].placed_at.toISOString(),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
