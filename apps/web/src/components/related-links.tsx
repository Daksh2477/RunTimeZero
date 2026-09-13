import Link from 'next/link';
export function RelatedLinks({pondId,siteId,checkId,batchId}:{pondId?:string;siteId?:string;checkId?:string;batchId?:string}) {
 return <nav className="related-chips" aria-label="Related"><Link href="/farm">My ponds</Link>{pondId&&<><Link href={`/console/pond/${pondId}`}>Pond</Link><Link href={`/sim?pond=${pondId}`}>Simulate this pond</Link></>}{siteId&&<><Link href={`/console/site/${siteId}`}>Farm money</Link><Link href={`/console/site/${siteId}#weather`}>Weather</Link><Link href={`/hardware?site=${siteId}`}>Circuit diagram</Link></>}{checkId&&<Link href={`/verify/${checkId}`}>Carbon report</Link>}{batchId&&<Link href={`/verify/batch/${batchId}`}>Batch evidence</Link>}<Link href={`/console/market?${new URLSearchParams({...siteId?{site:siteId}:{},...batchId?{batch:batchId}:{}})}`}>See it on the market</Link></nav>;
}
export function Breadcrumbs({items}:{items:{href:string;label:string}[]}) {
 return <nav aria-label="Breadcrumb" className="related-chips">{items.map((x,i)=><span key={x.href}>{i>0&&<span aria-hidden="true"> / </span>}<Link href={x.href}>{x.label}</Link></span>)}</nav>;
}
