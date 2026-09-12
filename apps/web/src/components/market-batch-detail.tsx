'use client';
import Link from 'next/link';
import { useApiData } from '@/lib/use-api-data';
import { retireCredits, type Listing } from '@/lib/market-api';
import { DetailSheet, ResourceState } from './detail-sheet';
import { RetirePanel } from './retire-panel';
import { PriceHistory, SellerTrust, rupees } from './market-insights';
export function MarketBatchDetail({listing:l,onClose,onChanged}:{listing:Listing;onClose:()=>void;onChanged:()=>void}) {
 const r=useApiData<{checks:{id:string;pondLabel:string;creditableCo2Kg:number}[];retirements:{id:string;kg:number;beneficiary:string}[]}>(`/verify/batch/${l.batchId}`);
 return <DetailSheet title={l.siteName} onClose={onClose}><p>{l.tier} · {l.disposition.replaceAll('_',' ')} · {(l.divergenceBps/100).toFixed(1)}% refused</p><p>{l.availableKg} kg available · {rupees(l.askingInrPerTonne)}/tonne</p><p>{l.anchored?'Anchored on chain':'Not anchored on a public chain'}</p><nav className="related-chips" aria-label="Related"><Link href={`/verify/batch/${l.batchId}`}>Full batch evidence</Link>{l.siteId&&<><Link href={`/console/site/${l.siteId}`}>Farm costs</Link><Link href={`/hardware?site=${l.siteId}`}>Sensor plan</Link></>}</nav><ResourceState {...r}/>{r.data&&<><h3>Evidence windows</h3>{r.data.checks.map(c=><p key={c.id}><Link href={`/verify/${c.id}`}>{c.pondLabel}: {c.creditableCo2Kg} kg supported</Link></p>)}<h3>Certificate history</h3>{r.data.retirements.length?r.data.retirements.map(t=><p key={t.id}><Link href={`/verify/certificate/${t.id}`}>{t.kg} kg for {t.beneficiary}</Link></p>):<p>No retirements yet.</p>}</>}<RetirePanel key={l.batchId} listing={l} onRetired={onChanged} onRetire={retireCredits}/><PriceHistory kind="credit" id={l.batchId}/>{l.siteId&&<SellerTrust siteId={l.siteId}/>}</DetailSheet>;
}
