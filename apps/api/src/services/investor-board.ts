/**
 * The investor noticeboard.
 *
 * WHAT THIS DELIBERATELY IS NOT
 *
 * Not a securities platform. We carry a farm's listing alongside its
 * verified production record, and the investor contacts the operator
 * directly. We take no fee, hold no money, and do not introduce parties for
 * consideration — because doing any of those turns this into regulated
 * broking, which a hackathon prototype has no business pretending to be.
 *
 * WHAT MAKES IT WORTH ANYTHING
 *
 * Every listing is stapled to the same verification record the credits use.
 * An operator cannot claim a yield here that their own ponds did not
 * produce, because the production figure is queried, not typed. That is the
 * entire pitch: a farm listing on any other noticeboard is self-reported.
 */

import { pool } from '../db/client.ts';

export interface ListingSummary {
  id: string;
  siteId: string;
  siteName: string;
  tier: string;
  hostIndustry: string;
  headline: string;
  pitch: string;
  seekingInr: number;
  useOfFunds: string;
  expandToM2: number | null;
  currentAreaM2: number;
  status: string;
  createdAt: string;
  /** Queried from verification history, never typed by the operator. */
  verified: {
    creditedCo2Kg: number;
    claimedCo2Kg: number;
    /** How much of what they claimed survived checking, 0..1. */
    claimAccuracy: number | null;
    checkCount: number;
    harvestedKg: number;
    /** Null when nothing has been verified yet — shown as such, not as zero. */
    firstCheckAt: string | null;
  };
  contact: { name: string; email: string; phone: string | null };
}

const SELECT = `
  SELECT l.id, l.site_id, l.headline, l.pitch, l.seeking_inr, l.use_of_funds,
         l.expand_to_m2, l.status, l.created_at,
         l.contact_name, l.contact_email, l.contact_phone,
         s.name AS site_name, s.tier, s.host_industry, s.total_area_m2,
         COALESCE(v.credited, 0)  AS credited,
         COALESCE(v.claimed, 0)   AS claimed,
         COALESCE(v.checks, 0)    AS checks,
         v.first_check_at,
         COALESCE(h.harvested, 0) AS harvested
    FROM investment_listings l
    JOIN sites s ON s.id = l.site_id
    LEFT JOIN LATERAL (
      SELECT SUM(dc.creditable_co2_kg) AS credited,
             SUM(dc.claimed_co2_kg)    AS claimed,
             COUNT(*)                  AS checks,
             MIN(dc.window_start)      AS first_check_at
        FROM divergence_checks dc
        JOIN ponds p ON p.id = dc.pond_id
       WHERE p.site_id = s.id
    ) v ON true
    LEFT JOIN LATERAL (
      SELECT SUM(hr.dry_mass_kg) AS harvested
        FROM harvest_records hr
        JOIN ponds p ON p.id = hr.pond_id
       WHERE p.site_id = s.id
    ) h ON true`;

function shape(r: Record<string, any>): ListingSummary {
  const claimed = Number(r.claimed);
  const credited = Number(r.credited);
  return {
    id: r.id,
    siteId: r.site_id,
    siteName: r.site_name,
    tier: r.tier,
    hostIndustry: r.host_industry,
    headline: r.headline,
    pitch: r.pitch,
    seekingInr: Number(r.seeking_inr),
    useOfFunds: r.use_of_funds,
    expandToM2: r.expand_to_m2 === null ? null : Number(r.expand_to_m2),
    currentAreaM2: Number(r.total_area_m2),
    status: r.status,
    createdAt: r.created_at.toISOString(),
    verified: {
      creditedCo2Kg: credited,
      claimedCo2Kg: claimed,
      // Null rather than 1.0 when nothing was claimed — an unverified farm
      // must not display as a perfectly accurate one.
      claimAccuracy: claimed > 0 ? credited / claimed : null,
      checkCount: Number(r.checks),
      harvestedKg: Number(r.harvested),
      firstCheckAt: r.first_check_at ? r.first_check_at.toISOString() : null,
    },
    contact: {
      name: r.contact_name,
      email: r.contact_email,
      phone: r.contact_phone,
    },
  };
}

export async function listOpportunities(): Promise<ListingSummary[]> {
  const { rows } = await pool.query(
    `${SELECT} WHERE l.status <> 'closed' ORDER BY l.created_at DESC`,
  );
  return rows.map(shape);
}

export async function getOpportunity(id: string): Promise<ListingSummary | null> {
  const { rows } = await pool.query(`${SELECT} WHERE l.id = $1`, [id]);
  return rows[0] ? shape(rows[0]) : null;
}

export interface CreateListingArgs {
  siteId: string;
  headline: string;
  pitch: string;
  seekingInr: number;
  useOfFunds: string;
  expandToM2?: number | null;
  contactName: string;
  contactEmail: string;
  contactPhone?: string | null;
}

export async function createListing(a: CreateListingArgs): Promise<ListingSummary> {
  const { rows } = await pool.query(
    `INSERT INTO investment_listings
       (site_id, headline, pitch, seeking_inr, use_of_funds, expand_to_m2,
        contact_name, contact_email, contact_phone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      a.siteId, a.headline.trim(), a.pitch.trim(), a.seekingInr,
      a.useOfFunds.trim(), a.expandToM2 ?? null,
      a.contactName.trim(), a.contactEmail.trim(), a.contactPhone ?? null,
    ],
  );
  const listing = await getOpportunity(rows[0].id);
  if (!listing) throw new Error('Listing vanished immediately after insert');
  return listing;
}

export interface EnquiryArgs {
  listingId: string;
  investorName: string;
  investorEmail: string;
  organisation?: string | null;
  message: string;
}

/**
 * Register interest. Returns the operator's contact details, because the
 * conversation happens between them and not through us.
 */
export async function enquire(a: EnquiryArgs) {
  const listing = await getOpportunity(a.listingId);
  if (!listing) throw Object.assign(new Error('No such listing'), { status: 404 });
  if (listing.status === 'closed') {
    throw Object.assign(new Error('This listing is closed'), { status: 409 });
  }

  const { rows } = await pool.query(
    `INSERT INTO investor_enquiries
       (listing_id, investor_name, investor_email, organisation, message)
     VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
    [
      a.listingId, a.investorName.trim(), a.investorEmail.trim(),
      a.organisation ?? null, a.message.trim(),
    ],
  );

  return {
    id: rows[0].id,
    createdAt: rows[0].created_at.toISOString(),
    contact: listing.contact,
    note:
      'Your details have been recorded and the operator can see them. '
      + 'Contact them directly — we do not broker the conversation, take a '
      + 'fee, or hold funds.',
  };
}
