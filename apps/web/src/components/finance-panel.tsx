'use client';
import Link from 'next/link';
import { useRole } from '@/lib/session';
import { useApiData } from '@/lib/use-api-data';
import { ResourceState } from './detail-sheet';
import { rupees } from './market-insights';
interface SiteFinance {site:{id:string;name:string};asOf:string;costs:{buildInr:number;gatewayInr:number;runningInr:number;totalInr:number};revenue:{credits:{retirements:number;kg:number;inr:number;unpricedRetirements:number};produce:{orders:number;kg:number;inr:number};totalInr:number};profitInr:number;projection?:{horizonDays:number;dailyRevenueInr:number;dailyRunningCostInr:number;dailyNetInr:number;unsoldInventoryInr:number;projectedRevenueInr:number;projectedCostInr:number;projectedProfitInr:number;breakEvenInDays:number|null;basis:string};ponds:{pondId:string;label:string;kit:string;nodes:number;build:{items:{ref:string;part:string;qty:number;unitInr:number;totalInr:number}[];totalInr:number};running:{days:number;energyInr:number;labourInr:number;harvestInr:number;totalInr:number}}[];note:string}
interface Mine {role:string;siteId:string|null;site:SiteFinance|null;spend:{creditsInr:number;produceInr:number;totalInr:number}|null}

/** Costs, revenue and profit from recorded activity. With no siteId it shows the signed-in account's own figures. */
export function FinancePanel({siteId}:{siteId?:string}) {
 // Wait for the session read so the first client render matches the server's empty one.
 const {role:signedIn,ready}=useRole();const role=ready?signedIn:null;
 const mine=useApiData<Mine>(role&&!siteId?'/finance/mine':null);
 const site=useApiData<SiteFinance>(role&&siteId?`/finance/site/${encodeURIComponent(siteId)}`:null);
 if(!role||mine.missing||site.missing)return null;
 const r=siteId?site:mine;const f=siteId?site.data:mine.data?.site;const spend=mine.data?.spend;
 return <section className="panel"><h2>Costs, revenue and profit</h2><ResourceState {...r}/>
  {spend&&<div className="summary-grid"><div className="summary-card"><span>Carbon credits retired</span><strong className="num">{rupees(spend.creditsInr)}</strong></div><div className="summary-card"><span>Algae bought</span><strong className="num">{rupees(spend.produceInr)}</strong></div><div className="summary-card"><span>Total spent</span><strong className="num">{rupees(spend.totalInr)}</strong></div></div>}
  {f&&<><div className="summary-grid"><div className="summary-card"><span>Costs</span><strong className="num">{rupees(f.costs.totalInr)}</strong><small>Build {rupees(f.costs.buildInr)} · running {rupees(f.costs.runningInr)}</small></div><div className="summary-card"><span>Revenue</span><strong className="num">{rupees(f.revenue.totalInr)}</strong><small>Credits {rupees(f.revenue.credits.inr)} · algae {rupees(f.revenue.produce.inr)}</small></div><div className={`summary-card${f.profitInr<0?' attention':''}`}><span>{f.profitInr<0?'Loss':'Profit'}</span><strong className="num">{rupees(Math.abs(f.profitInr))}</strong><small>{f.site.name}</small></div></div>
   <p className="helper">{f.note}</p>
   {f.projection&&(p=>
    <><h3>Where this is heading</h3><div className="summary-grid"><div className={`summary-card${p.projectedProfitInr<0?' attention':''}`}><span>Projected 1-year {p.projectedProfitInr<0?'loss':'profit'}</span><strong className="num">{rupees(Math.abs(p.projectedProfitInr))}</strong><small>Revenue {rupees(p.projectedRevenueInr)} · costs {rupees(p.projectedCostInr)}</small></div><div className={`summary-card${p.dailyNetInr<0?' attention':''}`}><span>Net per day now</span><strong className="num">{p.dailyNetInr<0?'−':''}{rupees(Math.abs(p.dailyNetInr))}</strong><small>Sales {rupees(p.dailyRevenueInr)} · running {rupees(p.dailyRunningCostInr)}</small></div><div className="summary-card"><span>Unsold at asking price</span><strong className="num">{rupees(p.unsoldInventoryInr)}</strong><small>{p.breakEvenInDays===null?'No break-even at the current pace':p.breakEvenInDays===0?'Costs covered if unsold listings sell at asking':`Break-even in about ${p.breakEvenInDays} days`}</small></div></div><p className="helper">{p.basis}</p></>)(f.projection)}
   {f.revenue.credits.unpricedRetirements>0&&<p className="helper">{f.revenue.credits.unpricedRetirements} retirement{f.revenue.credits.unpricedRetirements===1?'':'s'} recorded without a price.</p>}
   {f.costs.gatewayInr>0&&<p className="helper">Includes a LoRa gateway: {rupees(f.costs.gatewayInr)}.</p>}
   {f.ponds.map(p=><details className="market-record" key={p.pondId}><summary><strong>{p.label}</strong> · build {rupees(p.build.totalInr)} · running {rupees(p.running.totalInr)} over {p.running.days} days</summary>
    <p><Link href={`/console/pond/${p.pondId}`}>Open pond →</Link> · {p.nodes} × {p.kit} node</p>
    <p>Energy {rupees(p.running.energyInr)} · labour {rupees(p.running.labourInr)} · harvesting {rupees(p.running.harvestInr)}</p>
    <div className="table-scroll"><table><thead><tr><th>Part</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>{p.build.items.map(i=><tr key={i.ref}><td>{i.part}</td><td className="num">{i.qty}</td><td className="num">{rupees(i.unitInr)}</td><td className="num">{rupees(i.totalInr)}</td></tr>)}</tbody></table></div>
   </details>)}</>}
 </section>;
}
