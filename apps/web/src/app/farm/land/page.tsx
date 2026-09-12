'use client';

/**
 * A farmer managing their own ponds.
 *
 * PONDS ARE DISABLED, NEVER DELETED.
 *
 * A pond that produced credits in 2025 has to still resolve in 2030 when
 * somebody audits them, so there is no delete button anywhere on this page.
 * Taking one out of use asks for a reason, because that reason lands in the
 * audit trail beside every credit the pond ever produced.
 *
 * The geometry fields do real work: width decides whether a satellite can
 * see the pond at all (Sentinel-2's 20 m bands need about 40 m), and depth
 * decides how fast the culture shades itself. The form says what each choice
 * costs rather than silently accepting a number that will disappoint later.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

const BASE = '/api/backend';

interface Pond {
  id: string; label: string; areaM2: number; depthM: number;
  lengthM: number; widthM: number; strain: string; active: boolean;
  retiredAt: string | null; retiredReason: string | null;
  lastReadingAt: string | null; checkCount: number;
  satelliteResolvable: boolean; sensorsNeeded: number;
}
interface Site { id: string; name: string; tier: string }

/** What can be changed about an existing pond. Area is never edited directly. */
interface Draft {
  label: string; lengthM: number; widthM: number; depthM: number; strain: string;
}

export default function LandPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [ponds, setPonds] = useState<Pond[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ label: '', lengthM: 100, widthM: 20, depthM: 0.25 });
  const [busy, setBusy] = useState(false);
  /* Editing one pond at a time, in place. A modal would hide the list you are
   * comparing against, and the numbers only make sense next to the others. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const loadPonds = useCallback((id: string) => {
    if (!id) return;
    fetch(`${BASE}/land/site/${id}/ponds`, { cache: 'no-store' })
      .then((r) => r.json()).then(setPonds).catch(() => setPonds([]));
  }, []);

  useEffect(() => {
    fetch(`${BASE}/fleet`, { cache: 'no-store' }).then((r) => r.json())
      .then((s: Site[]) => { setSites(s); setSiteId((c) => c || s[0]?.id || ''); })
      .catch(() => {});
  }, []);
  useEffect(() => { loadPonds(siteId); }, [siteId, loadPonds]);

  const call = async (path: string, init: RequestInit) => {
    const res = await fetch(`${BASE}${path}`, {
      ...init, headers: { 'content-type': 'application/json' },
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Request failed');
    return body;
  };

  const addPond = async () => {
    setBusy(true); setError(null);
    try {
      await call(`/land/site/${siteId}/ponds`, {
        method: 'POST', body: JSON.stringify(form),
      });
      setForm({ label: '', lengthM: 100, widthM: 20, depthM: 0.25 });
      loadPonds(siteId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the pond');
    } finally { setBusy(false); }
  };

  const setActive = async (pond: Pond, active: boolean) => {
    setError(null);
    let reason = '';
    if (!active) {
      reason = window.prompt(
        `Why is ${pond.label} going out of use?\n\n`
        + 'This appears in the audit trail for any credits it produced.',
      ) ?? '';
      if (!reason.trim()) return;
    }
    try {
      await call(`/land/ponds/${pond.id}`, {
        method: 'PATCH', body: JSON.stringify({ active, reason }),
      });
      loadPonds(siteId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the pond');
    }
  };

  const startEdit = (pond: Pond) => {
    setError(null);
    setEditingId(pond.id);
    setDraft({
      label: pond.label,
      lengthM: pond.lengthM,
      widthM: pond.widthM,
      depthM: pond.depthM,
      strain: pond.strain,
    });
  };

  const saveEdit = async (pond: Pond) => {
    if (!draft) return;
    setBusy(true); setError(null);
    try {
      // Only what actually changed. The API treats an absent key as "leave it
      // alone", so sending the whole object would rewrite fields the farmer
      // never touched — and would overwrite a change someone else just made.
      const changed: Partial<Draft> = {};
      if (draft.label.trim() !== pond.label) changed.label = draft.label.trim();
      if (draft.lengthM !== pond.lengthM) changed.lengthM = draft.lengthM;
      if (draft.widthM !== pond.widthM) changed.widthM = draft.widthM;
      if (draft.depthM !== pond.depthM) changed.depthM = draft.depthM;
      if (draft.strain.trim() !== pond.strain) changed.strain = draft.strain.trim();

      if (Object.keys(changed).length === 0) {
        setEditingId(null); setDraft(null); return;
      }
      await call(`/land/ponds/${pond.id}`, {
        method: 'PATCH', body: JSON.stringify(changed),
      });
      setEditingId(null); setDraft(null);
      loadPonds(siteId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the pond');
    } finally { setBusy(false); }
  };

  const area = form.lengthM * form.widthM;

  return (
    <main className="wrap" style={{ paddingBlock: '20px 48px' }}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR LAND</p>
          <h1>Ponds and sites</h1>
          <p>
            Add a pond, edit one, or take it out of use. Nothing is ever
            deleted — a pond that earned credits has to stay on the record for
            anyone auditing them later.
          </p>
        </div>
      </div>

      {sites.length > 1 && (
        <label className="land-site-picker">
          <span>Site</span>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}

      {error && <p className="inline-notice" role="alert">{error}</p>}

      <div className="land-grid">
        <section className="land-add">
          <h2>Add a pond</h2>
          <label><span>Name</span>
            <input value={form.label} placeholder="RW-04"
              onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </label>
          <div className="land-dims">
            {([['lengthM', 'Length', 'm'], ['widthM', 'Width', 'm']] as const).map(([k, l, u]) => (
              <label key={k}><span>{l} ({u})</span>
                <input type="number" min={1} value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
              </label>
            ))}
            <label><span>Depth (cm)</span>
              <input type="number" min={10} max={80} value={Math.round(form.depthM * 100)}
                onChange={(e) => setForm({ ...form, depthM: Number(e.target.value) / 100 })} />
            </label>
          </div>

          <dl className="land-preview">
            <div><dt>Area</dt><dd>{area.toLocaleString('en-IN')} m²</dd></div>
            <div><dt>Sensors</dt><dd>1 sonde + node</dd></div>
            <div><dt>Kit cost</dt><dd>₹32,500</dd></div>
          </dl>

          <p className="helper">
            {form.widthM >= 40
              ? 'Wide enough for satellite verification, which is the cheapest evidence there is.'
              : `At ${form.widthM} m wide, satellites cannot resolve this pond — `
                + 'it will be verified by drone or weighbridge. Above 40 m wide they can.'}
          </p>

          <button type="button" className="button" disabled={busy || !form.label.trim()}
            onClick={addPond}>
            {busy ? 'Adding…' : 'Add pond'}
          </button>
        </section>

        <section className="land-list">
          <h2>Your ponds</h2>
          {ponds.map((p) => (
            <article key={p.id} className={`land-row${p.active ? '' : ' is-off'}`}>
              <div>
                <strong>{p.label}</strong>
                <span className="land-meta">
                  {Math.round(p.areaM2).toLocaleString('en-IN')} m² ·{' '}
                  {Math.round(p.depthM * 100)} cm · {p.strain}
                  {p.satelliteResolvable ? ' · satellite' : ' · drone/weighbridge'}
                </span>
                {!p.active && p.retiredReason && (
                  <span className="land-reason">Out of use: {p.retiredReason}</span>
                )}
                {p.checkCount > 0 && (
                  <span className="land-meta">
                    {p.checkCount} verification window{p.checkCount === 1 ? '' : 's'} on record
                  </span>
                )}
              </div>
              <div className="land-row-actions">
                <button type="button" className="button small"
                  onClick={() => (editingId === p.id ? setEditingId(null) : startEdit(p))}>
                  {editingId === p.id ? 'Cancel' : 'Edit'}
                </button>
                <button type="button" className="button secondary small"
                  onClick={() => setActive(p, !p.active)}>
                  {p.active ? 'Take out of use' : 'Put back in use'}
                </button>
              </div>

              {editingId === p.id && draft && (
                <form className="land-edit" onSubmit={(e) => { e.preventDefault(); void saveEdit(p); }}>
                  <label><span>Name</span>
                    <input value={draft.label}
                      onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                  </label>
                  <label><span>Length (m)</span>
                    <input type="number" min={1} value={draft.lengthM}
                      onChange={(e) => setDraft({ ...draft, lengthM: Number(e.target.value) })} />
                  </label>
                  <label><span>Width (m)</span>
                    <input type="number" min={1} value={draft.widthM}
                      onChange={(e) => setDraft({ ...draft, widthM: Number(e.target.value) })} />
                  </label>
                  <label><span>Depth (cm)</span>
                    <input type="number" min={10} max={80} value={Math.round(draft.depthM * 100)}
                      onChange={(e) => setDraft({ ...draft, depthM: Number(e.target.value) / 100 })} />
                  </label>
                  <label><span>Strain</span>
                    <input value={draft.strain}
                      onChange={(e) => setDraft({ ...draft, strain: e.target.value })} />
                  </label>

                  <p className="helper land-edit-note">
                    Area becomes{' '}
                    <strong>
                      {Math.round(draft.lengthM * draft.widthM).toLocaleString('en-IN')} m²
                    </strong>
                    {' — '}
                    {draft.lengthM * draft.widthM > 12_000
                      ? 'too large for one paddlewheel to mix evenly. Split it into two ponds.'
                      : draft.widthM >= 40
                        ? 'wide enough for satellite verification.'
                        : `at ${draft.widthM} m wide, verification falls back to drone or weighbridge.`}
                  </p>

                  <div className="land-edit-actions">
                    <button type="submit" className="button small" disabled={busy}>
                      {busy ? 'Saving…' : 'Save changes'}
                    </button>
                    <button type="button" className="button secondary small"
                      onClick={() => { setEditingId(null); setDraft(null); }}>
                      Discard
                    </button>
                  </div>
                </form>
              )}
            </article>
          ))}
          {ponds.length === 0 && <p className="helper">No ponds here yet.</p>}
          <p className="helper">
            Looking for readings? <Link href="/farm">Your ponds today</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}
