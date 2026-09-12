'use client';
import Link from 'next/link';
import { useApiData } from '@/lib/use-api-data';
import { ResourceState } from './detail-sheet';
export function SiteConnections({siteId}:{siteId:string}) {
 const fleet=useApiData<{id:string;name:string;ponds:{id:string;label:string}[]}[]>('/fleet');
 const batches=useApiData<{id:string;periodEnd:string;creditableCo2Kg:number}[]>(`/batches/site/${siteId}`);
 const weather=useApiData<{headline:string;source:string;fetchedAt:string;days:{date:string;tempMinC:number;tempMaxC:number;rainMm:number;note:string}[]}>(`/weather/site/${siteId}`);
 const site=fleet.data?.find(s=>s.id===siteId);
 return <><section className="panel"><h2>{site?.name??'Farm'} · ponds and batches</h2><ResourceState {...fleet}/><div className="related-chips">{site?.ponds.map(p=><Link key={p.id} href={`/console/pond/${p.id}`}>{p.label}</Link>)}</div><ResourceState {...batches} empty={batches.data?.length===0}/>{batches.data?.map(b=><p key={b.id}><Link href={`/verify/batch/${b.id}`}>{b.creditableCo2Kg} kg · period ending {b.periodEnd.slice(0,10)}</Link></p>)}</section><section id="weather" className="panel"><h2>Weather ahead</h2><ResourceState {...weather}/>{weather.data&&<><p>{weather.data.headline}</p><p className="helper">{weather.data.source} · fetched {new Date(weather.data.fetchedAt).toLocaleString()}</p>{weather.data.days.map(d=><article className="market-record" key={d.date}><strong>{d.date} · {d.tempMinC}–{d.tempMaxC} °C · {d.rainMm} mm rain</strong><p>{d.note}</p></article>)}</>}</section></>;
}
