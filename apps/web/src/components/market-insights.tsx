'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { apiData, ApiError, useApiData } from '@/lib/use-api-data';
import type { Listing, Opportunity } from '@/lib/market-api';
import { ResourceState } from './detail-sheet';
import { useRole } from '@/lib/session';

export const rupees=(n:number)=>`₹${n.toLocaleString('en-IN',{maximumFractionDigits:2})}`;
export interface Trust {score:number|null; suggestedInrPerTonne:number; note:string;components:{key:string;label:string;weight:number;value:number|null;points:number;detail:string}[]}
interface History {unit:string;points:{day:string;volume:number;avgPrice:number}[];projection:{method:string;caveat:string;points:{day:string;price:number;low:number;high:number}[]}|null;projectionUnavailableReason:string|null}
export function PriceHistory({kind,id}:{kind:'credit'|'produce';id:string}) {
 const r=useApiData<History>(`/market/price-history?kind=${kind}&${kind==='credit'?'batchId':'harvestId'}=${encodeURIComponent(id)}`);
 if(r.missing)return null;
 const d=r.data;
 const all=d?[...d.points.map(p=>({day:p.day,price:p.avgPrice})),...(d.projection?.points??[])]:[];
 const lo=Math.min(...all.map(p=>Date.parse(p.day))), hi=Math.max(...all.map(p=>Date.parse(p.day)));
 const max=Math.max(1,...all.map(p=>p.price),...(d?.projection?.points.map(p=>p.high)??[]));
 const x=(day:string)=>30+540*(Date.parse(day)-lo)/Math.max(1,hi-lo), y=(v:number)=>145-120*v/max;
 return <section className="market-record"><h3>Traded price history</h3><ResourceState {...r} empty={d?.points.length===0}/>{d&&<><p>{d.unit}</p>{d.points.length>0&&<svg className="price-chart" viewBox="0 0 600 180" role="img" aria-label="Recorded prices in green; future projection dashed with uncertainty band"><path d="M30 20V145H580" fill="none" stroke="currentColor" opacity=".3"/><text x="30" y="15" fontSize="11">{rupees(max)}</text><polyline points={d.points.map(p=>`${x(p.day)},${y(p.avgPrice)}`).join(' ')} fill="none" stroke="#287746" strokeWidth="3"/>{d.points.map(p=><circle key={p.day} cx={x(p.day)} cy={y(p.avgPrice)} r="4" fill="#287746"><title>{p.day}: {rupees(p.avgPrice)}, volume {p.volume}</title></circle>)}{d.projection&&<><polygon points={[...d.projection.points.map(p=>`${x(p.day)},${y(p.high)}`),...d.projection.points.slice().reverse().map(p=>`${x(p.day)},${y(p.low)}`)].join(' ')} fill="#c9953525"/><polyline points={d.projection.points.map(p=>`${x(p.day)},${y(p.price)}`).join(' ')} fill="none" stroke="#a4711d" strokeWidth="2" strokeDasharray="6 5"/></>}<text x="30" y="170" fontSize="11">{all[0]?.day}</text><text x="580" y="170" textAnchor="end" fontSize="11">{all.at(-1)?.day}</text></svg>}{d.projection?<><h4>Future price projection</h4><p>{d.projection.caveat}</p><p className="helper">{d.projection.method}</p></>:<p>Projection unavailable: {d.projectionUnavailableReason}</p>}<details><summary>Price records</summary>{d.points.map(p=><p key={p.day}>{p.day}: {rupees(p.avgPrice)} · volume {p.volume}</p>)}</details></>}</section>;
}
export function SellerTrust({siteId}:{siteId:string}) {
 const r=useApiData<Trust>(`/market/trust/${encodeURIComponent(siteId)}`);if(r.missing)return null;
 return <section className="market-record"><h3>Seller trust {r.data?.score==null?'':`${r.data.score}/100`}</h3><ResourceState {...r}/>{r.data&&<><p>{r.data.note}</p><details><summary>Score breakdown</summary>{r.data.components.map(c=><p key={c.key}><strong>{c.label}: {c.value===null?'No data':`${c.points}/${c.weight} points`}</strong><br/>{c.detail}</p>)}</details></>}</section>;
}
interface Mine {siteId:string|null;listings:Listing[];retirements:{id:string;batchId:string;siteName:string;kg:number;beneficiary:string;totalInr:number|null}[];produceOrders:{id:string;siteName:string;kg:number;totalInr:number;placedAt:string}[];produceSales:{id:string;buyerName:string;kg:number;totalInr:number;placedAt:string}[]}
export const CARD='rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm backdrop-blur-xl sm:p-5';
const GRID='grid gap-4 sm:grid-cols-2 lg:grid-cols-3';
function Group({title,empty,show,children}:{title:string;empty:string;show:boolean;children:ReactNode[]}) {
 if(!show&&!children.length)return null;
 return <div className="grid gap-3"><h3 className="font-display text-base font-semibold">{title}</h3>{children.length?<div className={GRID}>{children}</div>:<p className="text-sm text-muted-foreground">{empty}</p>}</div>;
}
export function MarketActivity({revision,onChanged}:{revision:number;onChanged:()=>void}) {
 const {role}=useRole();const r=useApiData<Mine>('/market/mine',revision);if(r.missing)return null;
 // Sections belong to a role; an empty one for the other role is noise, not information.
 const seller=!!r.data?.siteId;const buyer=role!=='operator';
 return <div className="grid gap-6"><ResourceState {...r}/>{r.data&&<>
  <Group title="Your credit listings" empty="No credit listings yet. Issue a batch from Create listing." show={seller}>{r.data.listings.map(l=><article className={CARD} key={l.batchId}><p className="text-sm font-semibold">{l.siteName}</p><p className="text-xs text-muted-foreground">{l.listed?'Listed':'Paused'} · ₹{l.askingInrPerTonne.toLocaleString('en-IN')}/tonne</p><p className="mt-3 font-display text-2xl font-bold">{Math.round(l.availableKg).toLocaleString('en-IN')}<span className="ml-1 text-sm font-normal text-muted-foreground">kg available</span></p><Link className="text-sm" href={`/verify/batch/${l.batchId}`}>Batch evidence →</Link><ListingToggle listing={l} onChanged={onChanged}/></article>)}</Group>
  <Group title="Harvests you sold" empty="No harvest sales yet." show={seller}>{r.data.produceSales.map(o=><article className={CARD} key={o.id}><p className="text-sm font-semibold">{o.buyerName}</p><p className="mt-3 font-display text-2xl font-bold">{rupees(o.totalInr)}</p><p className="text-xs text-muted-foreground">{o.kg.toLocaleString('en-IN')} kg · {o.placedAt.slice(0,10)}</p></article>)}</Group>
  <Group title="Credits you retired" empty="No credits retired yet." show={buyer}>{r.data.retirements.map(t=><article className={CARD} key={t.id}><p className="text-sm font-semibold">{t.siteName}</p><p className="text-xs text-muted-foreground">For {t.beneficiary}</p><p className="mt-3 font-display text-2xl font-bold">{t.kg.toLocaleString('en-IN')}<span className="ml-1 text-sm font-normal text-muted-foreground">kg CO₂</span></p><p className="text-xs text-muted-foreground">{t.totalInr===null?'Price not recorded':rupees(t.totalInr)}</p><Link className="text-sm" href={`/verify/certificate/${t.id}`}>Certificate →</Link></article>)}</Group>
  <Group title="Harvest you bought" empty="No harvest bought yet." show={buyer}>{r.data.produceOrders.map(o=><article className={CARD} key={o.id}><p className="text-sm font-semibold">{o.siteName}</p><p className="mt-3 font-display text-2xl font-bold">{rupees(o.totalInr)}</p><p className="text-xs text-muted-foreground">{o.kg.toLocaleString('en-IN')} kg · {o.placedAt.slice(0,10)}</p><small className="text-xs text-muted-foreground">Order {o.id}</small></article>)}</Group>
 </>}</div>;
}
function ListingToggle({listing:l,onChanged}:{listing:Listing;onChanged:()=>void}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[missing,setMissing]=useState(false),[price,setPrice]=useState(l.askingInrPerTonne);
 const trust=useApiData<Trust>(!l.listed?`/market/trust/${l.siteId}`:null);
 async function toggle(){if(busy)return;setBusy(true);setError('');try{await apiData(`/market/${l.batchId}/${l.listed?'unlist':'relist'}`,{method:'POST',body:JSON.stringify(l.listed?{}:{askingInrPerTonne:price})});onChanged();}catch(e){if(e instanceof ApiError&&e.status===404)setMissing(true);else setError(e instanceof Error?e.message:'Could not change listing.');}finally{setBusy(false);}}
 if(missing)return null;
 return <div className="market-form">{!l.listed&&<label>Asking price (₹/tonne)<input type="number" min="1" value={price} onChange={e=>setPrice(Number(e.target.value))}/>{trust.data&&<button className="button secondary" onClick={()=>setPrice(trust.data!.suggestedInrPerTonne)}>Use suggested {rupees(trust.data.suggestedInrPerTonne)}</button>}</label>}<button className="button secondary" disabled={busy||!Number.isFinite(price)||price<=0} onClick={toggle}>{busy?'Saving…':l.listed?'Pause listing':'Relist credits'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
interface Matches {role:string;matches?:{listing:Opportunity;fit:number;trustScore:number|null;reasons:string[]}[];enquiries?:{id:string;investorName:string;organisation:string;message:string;at:string;listingId:string;headline:string}[];buyers?:{beneficiary:string;kg:number;lastAt:string}[]}
export function MarketMatches() {
 const {role}=useRole();const [max,setMax]=useState(''),[tier,setTier]=useState('');
 const r=useApiData<Matches>(`/market/matches?${new URLSearchParams({...max?{maxInr:max}:{},...tier?{tier}:{}})}`);
 if(r.missing)return null;
 return <div className="grid gap-4"><h2 className="font-display text-lg font-semibold">{role==='operator'?'Interested investors and buyers':'Find a farm to invest in'}</h2>{role!=='operator'&&<div className="market-filters"><label>Maximum investment (₹)<input type="number" min="1" value={max} onChange={e=>setMax(e.target.value)}/></label><label>Evidence tier<select value={tier} onChange={e=>setTier(e.target.value)}><option value="">Any tier</option>{['smallholder','small','mid','facility'].map(t=><option key={t}>{t}</option>)}</select></label></div>}<ResourceState {...r}/>
  {r.data?.matches&&<div className={GRID}>{r.data.matches.map(m=><article className={CARD} key={m.listing.id}><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{m.listing.headline}</p><span className="shrink-0 whitespace-nowrap rounded-full bg-status-optimal/15 px-2.5 py-0.5 text-xs font-semibold text-status-optimal">Fit {m.fit}/100</span></div><p className="text-xs text-muted-foreground">{m.listing.siteName}</p><p className="mt-3 font-display text-2xl font-bold">{rupees(m.listing.seekingInr)}<span className="ml-1 text-sm font-normal text-muted-foreground">sought</span></p><p className="text-xs text-muted-foreground">{m.reasons.join(' · ')}</p><p className="mt-2 text-sm">{m.listing.useOfFunds}</p><Link className="text-sm" href={`/console/investor#listing-${m.listing.id}`}>Explore and contact this farm →</Link></article>)}</div>}
  {r.data?.matches?.length===0&&<p className="text-sm text-muted-foreground">No farms match these criteria.</p>}
  {r.data?.enquiries&&<div className={GRID}>{r.data.enquiries.map(e=><article className={CARD} key={e.id}><p className="text-sm font-semibold">{e.investorName}</p><p className="text-xs text-muted-foreground">{e.organisation} · {e.at.slice(0,10)}</p><p className="mt-2 text-xs text-muted-foreground">{e.headline}</p><p className="mt-2 text-sm">{e.message}</p></article>)}</div>}
  {r.data?.enquiries?.length===0&&<p className="text-sm text-muted-foreground">No investor enquiries yet.</p>}
  {!!r.data?.buyers?.length&&<><h3 className="font-display text-base font-semibold">Buyers of your credits</h3><div className={GRID}>{r.data.buyers.map(b=><article className={CARD} key={b.beneficiary}><p className="text-sm font-semibold">{b.beneficiary}</p><p className="mt-3 font-display text-2xl font-bold">{b.kg.toLocaleString('en-IN')}<span className="ml-1 text-sm font-normal text-muted-foreground">kg retired</span></p><p className="text-xs text-muted-foreground">Last {b.lastAt.slice(0,10)}</p></article>)}</div></>}
 </div>;
}
