'use client';

/**
 * The marketplace: carbon credits and the algae itself.
 *
 * Two tabs because they are two genuinely different trades. A tonne of CO₂
 * at Indian voluntary prices is worth a few hundred rupees; the same pond's
 * biomass sold as aquafeed is worth tens of thousands. Carbon is the
 * verification story, produce is the income, and a platform showing only the
 * first would be selling the smaller half.
 *
 * Style follows Chetan's front1.0 export — glass panels, soft background
 * glows, motion on entry. Every number under it is live.
 *
 * The column no competitor shows is "refused": how much of the seller's own
 * claim the evidence did not support. On credits it is the quality signal;
 * on produce the equivalent is `compositionSource`, because a protein figure
 * that was modelled rather than assayed is worth less trust and the buyer
 * should be told which they are getting.
 */

import { useEffect, useState } from 'react';
import {
  getMarket, getProduce, orderProduce, retireCredits,
  type Listing, type Produce,
} from '@/lib/market-api';
import { MarketBatchDetail } from '@/components/market-batch-detail';
import { MarketActivity, MarketMatches, PriceHistory } from '@/components/market-insights';
import { MarketListingForm } from '@/components/market-listing-form';
import { ResourceState } from '@/components/detail-sheet';
import { useRole } from '@/lib/session';
import { useApiData } from '@/lib/use-api-data';

const inr = (v: number) =>
  v >= 10_000_000 ? `₹${(v / 10_000_000).toFixed(2)} Cr`
    : v >= 100_000 ? `₹${(v / 100_000).toFixed(1)} L`
      : `₹${Math.round(v).toLocaleString('en-IN')}`;

type Tab = 'credits' | 'produce' | 'activity' | 'create' | 'matches';

export default function MarketPage() {
  const {role}=useRole();
  const activitySupport=useApiData<unknown>(role?'/market/mine':null);
  const matchSupport=useApiData<unknown>(role?'/market/matches':null);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [tier,setTier]=useState(''),[disposition,setDisposition]=useState(''),[refused,setRefused]=useState(''),[minimum,setMinimum]=useState(''),[sort,setSort]=useState('available');
  const [tab, setTab] = useState<Tab>('credits');
  const [credits, setCredits] = useState<Listing[]>([]);
  const [produce, setProduce] = useState<Produce[]>([]);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [query, setQuery] = useState('');
  const [siteFilter,setSiteFilter]=useState('');

  const load = async () => {
    setLoading(true); setError('');
    const results=await Promise.allSettled([getMarket(),getProduce()]);
    const [c,p]=results;
    if(c.status==='fulfilled'){setCredits(c.value);setSelected(s=>s?c.value.find(l=>l.batchId===s.batchId)??null:c.value.find(l=>l.batchId===new URLSearchParams(location.search).get('batch'))??null);}
    if(p.status==='fulfilled')setProduce(p.value);
    const errors=results.filter(r=>r.status==='rejected').map(r=>String(r.reason instanceof Error?r.reason.message:r.reason));
    setError(errors.join(' · '));setLoading(false);setRevision(n=>n+1);
  };
  useEffect(()=>{setSiteFilter(new URLSearchParams(location.search).get('site')??'');void load();}, []);

  const match = (s: string) => s.toLowerCase().includes(query.toLowerCase());
  const shownCredits = credits.filter(c => match(c.siteName)&&(!siteFilter||c.siteId===siteFilter)&&(!tier||c.tier===tier)&&(!disposition||c.disposition===disposition)&&(!refused||c.divergenceBps/100<=Number(refused))&&(!minimum||c.availableKg>=Number(minimum))).sort((a,b)=>sort==='refused'?a.divergenceBps-b.divergenceBps:sort==='site'?a.siteName.localeCompare(b.siteName):sort==='price'?a.askingInrPerTonne-b.askingInrPerTonne:b.availableKg-a.availableKg);
  const shownProduce = produce.filter((p) => match(`${p.siteName} ${p.gradeLabel} ${p.pondLabel}`));

  const creditKg = credits.reduce((s, c) => s + c.availableKg, 0);
  const produceKg = produce.reduce((s, p) => s + p.availableKg, 0);
  const produceValue = produce.reduce((s, p) => s + p.availableKg * p.askingInrPerKg, 0);

  return (
    <div className="relative min-h-[calc(100vh-64px)] w-full overflow-hidden p-4 sm:p-6 lg:p-10">
      {/* Decorative only — pointer-events-none so they never eat a tap. */}
      <div className="pointer-events-none absolute right-0 top-0 size-[420px] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 size-[420px] rounded-full bg-accent/10 blur-[120px]" />

      <div className="relative z-10 mx-auto max-w-[1800px] space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Marketplace
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Verified carbon credits and the algae itself. Everything here is
              priced in rupees at farm gate, and every figure is queried from
              the verification record.
            </p>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search listings by farm or product" placeholder="Search listings…"
            className="h-11 w-full rounded-xl border border-border bg-card/60 px-4 text-sm backdrop-blur sm:w-64"
          />
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {[
            { label: 'Credits available', value: `${Math.round(creditKg).toLocaleString('en-IN')} kg` },
            { label: 'Algae available', value: `${Math.round(produceKg).toLocaleString('en-IN')} kg` },
            { label: 'Produce value at asking', value: inr(produceValue) },
          ].map((s, i) => (
            <div
              key={s.label}
              style={{ animationDelay: `${i * 80}ms` }}
              className="rise-in rounded-2xl border border-border/60 bg-card/50 p-3 shadow-sm backdrop-blur-md sm:p-5"
            >
              <p className="text-xs font-medium leading-snug text-muted-foreground sm:text-sm">{s.label}</p>
              <h3 className="mt-1 font-display text-lg font-bold sm:mt-1.5 sm:text-3xl">{s.value}</h3>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-border/60 bg-card/40 p-2 backdrop-blur-sm">
          {(['credits', 'produce', ...(role&&!activitySupport.missing?['activity']:[]), ...(role&&!matchSupport.missing?['matches']:[]), ...(['operator','admin'].includes(role??'')?['create']:[])] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors sm:flex-none sm:px-5 ${
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {{credits:'Carbon credits',produce:'Algae produce',activity:'My activity',create:'Create listing',matches:role==='operator'?'Interested investors':'Find farms'}[t]}
            </button>
          ))}
        </div>

        <ResourceState loading={loading} error={error}/>{error&&<button className="button secondary" onClick={()=>void load()}>Retry listings</button>}
        {tab==='activity'?<MarketActivity revision={revision} onChanged={()=>void load()}/>:tab==='create'?<MarketListingForm onChanged={()=>void load()}/>:tab==='matches'?<MarketMatches/>:tab === 'credits' ? (<>
          <div className="market-filters"><label>Farm<select value={siteFilter} onChange={e=>setSiteFilter(e.target.value)}><option value="">All farms</option>{[...new Map(credits.map(c=>[c.siteId,c.siteName])).entries()].map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></label><label>Tier<select value={tier} onChange={e=>setTier(e.target.value)}><option value="">Any tier</option>{[...new Set(credits.map(c=>c.tier))].map(t=><option key={t}>{t}</option>)}</select></label><label>Disposition<select value={disposition} onChange={e=>setDisposition(e.target.value)}><option value="">Any use</option>{[...new Set(credits.map(c=>c.disposition))].map(d=><option key={d}>{d}</option>)}</select></label><label>Maximum refused (%)<input type="number" min="0" max="100" value={refused} onChange={e=>setRefused(e.target.value)}/></label><label>Minimum available (kg)<input type="number" min="0" value={minimum} onChange={e=>setMinimum(e.target.value)}/></label><label>Sort by<select value={sort} onChange={e=>setSort(e.target.value)}><option value="available">Available kg</option><option value="refused">Least refused</option><option value="price">Lowest price</option><option value="site">Farm name</option></select></label></div>
          <div className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shownCredits.map((c, i) => (
                <button
                  key={c.batchId}
                  type="button"
                  onClick={() => setSelected(c)}
                  style={{ animationDelay: `${i * 50}ms` }}
                  className={`rise-in rounded-2xl border bg-card/60 p-4 text-left sm:p-5 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                    selected?.batchId === c.batchId ? 'border-primary' : 'border-border/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{c.siteName}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.tier} · {c.disposition.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      c.divergenceBps < 500
                        ? 'bg-status-optimal/15 text-status-optimal'
                        : 'bg-status-warning/15 text-status-warning'
                    }`}>
                      {(c.divergenceBps / 100).toFixed(1)}% refused
                    </span>
                  </div>
                  <div className="mt-4 flex items-end justify-between sm:mt-6">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Available</p>
                      <p className="font-display text-2xl font-bold">
                        {Math.round(c.availableKg).toLocaleString('en-IN')}
                        <span className="ml-1 text-sm font-normal text-muted-foreground">kg</span>
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {c.anchored ? 'on chain' : 'not anchored'}<br/>₹{c.askingInrPerTonne.toLocaleString('en-IN')}/tonne
                    </p>
                  </div>
                </button>
              ))}
              {!loading && !error && shownCredits.length === 0 && (
                <p className="text-sm text-muted-foreground">No credits match that search.</p>
              )}
            </div>

          </div></>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shownProduce.map((p, i) => (
              <ProduceCard key={p.harvestId} produce={p} index={i} onOrdered={load} />
            ))}
            {!loading && !error && shownProduce.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing is listed for sale right now.
              </p>
            )}
          </div>
        )}
      </div>
      {selected&&<MarketBatchDetail listing={selected} onChanged={()=>void load()} onClose={()=>setSelected(null)}/>}
    </div>
  );
}

function ProduceCard({ produce:p, onOrdered }: {produce:Produce;index:number;onOrdered:()=>void}) {
 const [open,setOpen]=useState(false),[review,setReview]=useState(false),[busy,setBusy]=useState(false);
 const [form,setForm]=useState({kg:Math.min(100,p.availableKg),buyerName:'',buyerEmail:''});
 const [done,setDone]=useState<{id:string;kg:number;totalInr:number}|null>(null),[error,setError]=useState('');
 const valid=Number.isFinite(form.kg)&&form.kg>0&&form.kg<=p.availableKg&&form.buyerName.trim()&&/^\S+@\S+\.\S+$/.test(form.buyerEmail);
 async function submit(){if(busy||!valid)return;setBusy(true);setError('');try{setDone(await orderProduce(p.harvestId,form));onOrdered();}catch(e){setError(e instanceof Error?e.message:'Could not order.');}finally{setBusy(false);}}
 return <article className="panel"><h3>{p.gradeLabel}</h3><p>{p.siteName} · {p.pondLabel} · {p.harvestedAt.slice(0,10)}</p><p><strong>{p.availableKg.toLocaleString('en-IN')} kg</strong> available · ₹{p.askingInrPerKg}/kg</p><p>Grade reference range ₹{p.priceLowInr}–{p.priceHighInr}/kg</p><dl className="kv">{[['Protein',p.protein],['Lipid',p.lipid],['Carbohydrate',p.carbohydrate]].map(([k,v])=><div key={String(k)}><dt>{k}</dt><dd>{v===null?'Not measured':`${(Number(v)*100).toFixed(0)}%`}</dd></div>)}</dl><p className="helper">Composition: {p.compositionSource??'not recorded'}. Modelled composition is not a lab assay.</p><details><summary>Price history and projection</summary><PriceHistory kind="produce" id={p.harvestId}/></details>
 {done?<div role="status"><p>Order confirmed: {done.kg} kg · {inr(done.totalInr)}</p><p className="reference">Order {done.id}</p></div>:open?<form className="market-form" onSubmit={e=>{e.preventDefault();if(review)void submit();else setReview(true);}}><fieldset disabled={busy||review} className="market-form"><label>Quantity (kg)<input required type="number" min="0.01" step="any" max={p.availableKg} value={form.kg} onChange={e=>setForm({...form,kg:Number(e.target.value)})}/></label><label>Your name<input required value={form.buyerName} onChange={e=>setForm({...form,buyerName:e.target.value})}/></label><label>Email<input type="email" required value={form.buyerEmail} onChange={e=>setForm({...form,buyerEmail:e.target.value})}/></label></fieldset>{review&&<><p>Review: {form.kg} kg for {form.buyerName} ({form.buyerEmail}) · {inr(form.kg*p.askingInrPerKg)}.</p><button type="button" className="button secondary" disabled={busy} onClick={()=>setReview(false)}>Edit order</button></>}{error&&<p className="err" role="alert">{error}</p>}<button className="button" disabled={busy||!valid}>{busy?'Ordering…':review?'Confirm order':'Review order →'}</button></form>:<button className="button secondary" onClick={()=>setOpen(true)}>Buy this harvest</button>}
 </article>;
}
