'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRole } from '@/lib/session';
import { apiData, useApiData } from '@/lib/use-api-data';
import { dateLabel, mass } from '@/lib/display';
import { rupees } from './market-insights';
interface Eligible {pondId:string;label:string;siteId:string;readings:{firstAt:string|null;lastAt:string|null};checkedJustNow:boolean;credits:{checks:number;flaggedChecks:number;periodStart:string|null;periodEnd:string|null;creditableKg:number;suggestedInrPerTonne:number;estInr:number;disposition:string};harvests:{harvestId:string;harvestedAt:string;kg:number;grade:string;suggestedInrPerKg:number;estInr:number}[]}
interface Approved {pondId:string;batch:{id:string;creditableCo2Kg:number;anchored:boolean;note:string}|null;creditNote:string|null;listedHarvests:{harvestId:string;listedKg:number;availableKg:number}[]}

/** What this pond could put on the market now, listed with one approval. */
export function EligibleToSell({pondId}:{pondId:string}) {
 const {role,ready}=useRole();const [revision,setRevision]=useState(0);
 const r=useApiData<Eligible>(ready&&role?`/market/eligible/pond/${encodeURIComponent(pondId)}`:null,revision);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState<Approved|null>(null);
 // Hidden for anyone the API refuses; a buyer has nothing to approve here.
 if(!ready||!role||r.missing||r.error)return null;
 const d=r.data;const canApprove=role==='operator'||role==='admin';
 const harvestInr=d?d.harvests.reduce((n,h)=>n+h.estInr,0):0;const nothing=!!d&&d.credits.creditableKg<=0&&d.harvests.length===0;
 async function approve(){if(busy)return;setBusy(true);setError('');try{setDone(await apiData<Approved>(`/market/eligible/pond/${encodeURIComponent(pondId)}/approve`,{method:'POST',body:'{}'}));setRevision(n=>n+1);}catch(e){setError(e instanceof Error?e.message:'Could not list.');}finally{setBusy(false);}}
 return <section className="panel"><p className="eyebrow">MARKETPLACE</p><h2>Eligible to sell</h2>
  {r.loading&&!d&&<p role="status">Checking this pond’s records…</p>}
  {d&&<><p className="sub">{d.readings.firstAt&&d.readings.lastAt?`Readings from ${dateLabel(d.readings.firstAt)} to ${dateLabel(d.readings.lastAt)}`:'No stored readings yet.'}{d.checkedJustNow?' · carbon check run just now':''}</p>
   <div className="summary-grid"><div className="summary-card"><span>Carbon credits</span><strong className="num">{mass(d.credits.creditableKg)}</strong><small>{d.credits.checks} checks{d.credits.flaggedChecks?` · ${d.credits.flaggedChecks} flagged`:''} · estimated {rupees(d.credits.estInr)} at {rupees(d.credits.suggestedInrPerTonne)}/tonne</small></div><div className="summary-card"><span>Unlisted harvests</span><strong className="num">{d.harvests.length}</strong><small>Estimated {rupees(harvestInr)} at suggested prices</small></div></div>
   {d.harvests.length>0&&<details><summary>Harvests that would be listed</summary>{d.harvests.map(h=><p key={h.harvestId}>{dateLabel(h.harvestedAt)} · {mass(h.kg)} · {h.grade} · {rupees(h.suggestedInrPerKg)}/kg</p>)}</details>}
   {done?<div role="status" className="inline-notice"><p>{done.batch?`Batch issued: ${mass(done.batch.creditableCo2Kg)}. ${done.batch.note}`:done.creditNote}</p><p>{done.listedHarvests.length} {done.listedHarvests.length===1?'harvest':'harvests'} listed.</p>{done.batch&&<Link href={`/verify/batch/${done.batch.id}`}>Inspect batch →</Link>} <Link href="/console/market">See it on the market →</Link></div>
    :canApprove&&<button className="button" disabled={busy||nothing} onClick={approve}>{busy?'Listing…':'Approve and list'}</button>}
   {nothing&&!done&&<p className="helper">Nothing from this pond is ready to list yet.</p>}
   {error&&<p role="alert" className="err">{error}</p>}</>}
 </section>;
}
