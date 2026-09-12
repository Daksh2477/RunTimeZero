'use client';
import Link from 'next/link';
import { useState } from 'react';
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
interface Mine {siteId:string|null;listings:Listing[];retirements:{id:string;batchId:string;siteName:string;kg:number;beneficiary:string;totalInr:number|null}[];produceOrders:{id:string;siteName:string;kg:number;totalInr:number;placedAt:string}[];produceSales:{id:string;buyerName:string;kg:number;totalInr:number}[]}
export function MarketActivity({revision,onChanged}:{revision:number;onChanged:()=>void}) {
 const r=useApiData<Mine>('/market/mine',revision);if(r.missing)return null;
 return <section className="panel"><h2>My activity</h2><ResourceState {...r}/>{r.data&&<><h3>My credit listings</h3>{!r.data.listings.length&&<p>No listings yet.</p>}{r.data.listings.map(l=><div className="market-record" key={l.batchId}><Link href={`/verify/batch/${l.batchId}`}>{l.siteName} · {l.availableKg} kg</Link><ListingToggle listing={l} onChanged={onChanged}/></div>)}<h3>My retirements</h3>{!r.data.retirements.length&&<p>No retirements yet.</p>}{r.data.retirements.map(t=><p key={t.id}><Link href={`/verify/certificate/${t.id}`}>{t.kg} kg for {t.beneficiary}</Link> · {t.totalInr===null?'Price not recorded':rupees(t.totalInr)}</p>)}<h3>My produce orders</h3>{!r.data.produceOrders.length&&<p>No orders yet.</p>}{r.data.produceOrders.map(o=><p className="market-record" key={o.id}>{o.siteName} · {o.kg} kg · {rupees(o.totalInr)}<br/><small>Order {o.id} · {o.placedAt.slice(0,10)}</small></p>)}<h3>Produce sales</h3>{!r.data.produceSales.length&&<p>No sales yet.</p>}{r.data.produceSales.map(o=><p key={o.id}>{o.buyerName}: {o.kg} kg · {rupees(o.totalInr)}</p>)}</>}</section>;
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
 return <section className="panel"><h2>{role==='operator'?'Interested investors and buyers':'Find a farm to invest in'}</h2>{role!=='operator'&&<div className="market-filters"><label>Maximum investment (₹)<input type="number" min="1" value={max} onChange={e=>setMax(e.target.value)}/></label><label>Evidence tier<select value={tier} onChange={e=>setTier(e.target.value)}><option value="">Any tier</option>{['smallholder','small','mid','facility'].map(t=><option key={t}>{t}</option>)}</select></label></div>}<ResourceState {...r}/>{r.data?.matches?.map(m=><article className="market-record" key={m.listing.id}><h3>{m.listing.headline}</h3><p>{m.listing.siteName} · Seeking {rupees(m.listing.seekingInr)} · Fit {m.fit}/100</p><p>{m.reasons.join(' · ')}</p><p>{m.listing.useOfFunds}</p><Link href={`/console/investor?listing=${m.listing.id}`}>Explore and contact this farm →</Link></article>)}{r.data?.matches?.length===0&&<p>No farms match these criteria.</p>}{r.data?.enquiries?.map(e=><article className="market-record" key={e.id}><h3>{e.investorName} · {e.organisation}</h3><p>{e.headline}</p><p>{e.message}</p><small>{e.at.slice(0,10)}</small></article>)}{r.data?.enquiries?.length===0&&<p>No investor enquiries yet.</p>}{r.data?.buyers?.map(b=><p key={b.beneficiary}>{b.beneficiary} retired {b.kg} kg · {b.lastAt.slice(0,10)}</p>)}</section>;
}
