'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from './session';
import { siteAllowed } from './auth-contract';
import { apiData } from './use-api-data';
import type { FleetSite } from './api';
export interface PinSignal {pin:string;channel:string;volts:number|null;raw:number;value:number|boolean;saturated:boolean}
export interface LiveReading {receivedAt?:number;verified?:boolean;deviceId?:string|null;pondId:string;siteId:string|null;at:string;source:'sim'|'device'|null;readings:{tempC:number|null;ph:number|null;doMgL:number|null;od:number|null;paddlewheelOn:boolean|null};signals?:PinSignal[]}
interface Source {pondId:string;siteId:string|null;source:'sim'|'device'|null;lastAt:string}
interface Alert {id:string;pondId:string;type:string;severity:string;message:string;detectedAt:string;arrivedAt:number}
export function useLiveStream({pondId,siteId}:{pondId?:string;siteId?:string}={}) {
 const {session}=useRole();const router=useRouter();
 const [readings,setReadings]=useState<Record<string,LiveReading>>({}),[sources,setSources]=useState<Source[]>([]),[alerts,setAlerts]=useState<Alert[]>([]);
 const [connection,setConnection]=useState<'connecting'|'live'|'polling'|'paused'|'offline'>('connecting'),[error,setError]=useState(''),[now,setNow]=useState(Date.now());
 useEffect(()=>{
  if(!session)return;
  let stopped=false,stream:EventSource|null=null,retry:ReturnType<typeof setTimeout>|undefined,pollTimer:ReturnType<typeof setInterval>|undefined,watchdog:ReturnType<typeof setInterval>|undefined;
  let attempts=0,polling=false,lastEvent=Date.now(),lastRefresh=0;
  const allowedPonds=new Set<string>();const seenAlerts=new Set<string>();let controller=new AbortController();
  const accepts=(p:string,s:string|null)=> (!pondId||p===pondId)&&(!siteId||siteId===s)&&(session.account.role!=='operator'||(!!s&&siteAllowed(session,s)));
  const refresh=()=>{if(Date.now()-lastRefresh>5000){lastRefresh=Date.now();router.refresh();}};
  const addReading=(t:LiveReading,incoming=false)=>{
   if(!accepts(t.pondId,t.siteId))return;
   allowedPonds.add(t.pondId);
   setReadings(old=>{
    const previous=old[t.pondId];
    // Replay events arrive now but describe history; the archive's newest row
    // must not pin the live view to a later simulated date.
    if(!incoming && previous?.receivedAt)return old;
    if(!incoming && previous && Date.parse(previous.at)>Date.parse(t.at))return old;
    if(incoming && t.source!=='sim' && previous && Date.parse(previous.at)>Date.parse(t.at))return old;
    return {...old,[t.pondId]:incoming?{...t,receivedAt:Date.now()}:t};
   });
   setSources(old=>[...old.filter(x=>x.pondId!==t.pondId),{pondId:t.pondId,siteId:t.siteId,source:t.source,lastAt:t.at}]);
  };
  async function poll(){
   if(stopped||document.hidden||polling)return;polling=true;
   try{
    const [status,fleet]=await Promise.allSettled([apiData<{sources:Source[]}>('/live/status',{signal:controller.signal}),apiData<FleetSite[]>('/fleet',{signal:controller.signal})]);
    if(stopped||document.hidden)return;
    if(status.status==='fulfilled')setSources(status.value.sources.filter(s=>accepts(s.pondId,s.siteId)));
    if(fleet.status==='fulfilled')for(const site of fleet.value)for(const p of site.ponds){if(!accepts(p.id,site.id))continue;allowedPonds.add(p.id);if(p.latest&&p.lastReadingAt){const source=status.status==='fulfilled'?status.value.sources.find(s=>s.pondId===p.id)?.source??null:null;addReading({pondId:p.id,siteId:site.id,at:p.lastReadingAt,source,readings:{tempC:p.latest.temperatureC,ph:p.latest.ph,doMgL:p.latest.dissolvedOxygenMgL,od:p.latest.opticalDensity,paddlewheelOn:p.latest.mixing}});}}
    if(status.status==='rejected'&&fleet.status==='rejected'){setError(status.reason instanceof Error?status.reason.message:'Live data unavailable.');setConnection('offline');}else{setError('');}
   }finally{polling=false;}
  }
  const stopTimers=()=>{clearTimeout(retry);clearInterval(pollTimer);clearInterval(watchdog);stream?.close();stream=null;};
  const fail=()=>{if(stopped||document.hidden)return;stream?.close();stream=null;clearInterval(watchdog);setConnection('polling');if(!pollTimer){void poll();pollTimer=setInterval(()=>void poll(),5000);}clearTimeout(retry);retry=setTimeout(connect,Math.min(30000,1000*2**Math.min(attempts++,5)));};
  function connect(){
   if(stopped||document.hidden)return;
   stream?.close();lastEvent=Date.now();setConnection('connecting');
   if(typeof EventSource==='undefined'){fail();return;}
   stream=new EventSource('/api/backend/live/stream');
   stream.onopen=()=>{attempts=0;lastEvent=Date.now();setConnection('live');setError('');clearInterval(pollTimer);pollTimer=undefined;};
   stream.addEventListener('heartbeat',()=>{lastEvent=Date.now();});
   stream.addEventListener('telemetry',e=>{lastEvent=Date.now();try{const t=JSON.parse((e as MessageEvent).data) as LiveReading;if(!t.pondId||!t.readings||!Number.isFinite(Date.parse(t.at)))return;addReading(t,true);}catch{setError('An unreadable live reading was skipped.');}});
   stream.addEventListener('advisory',e=>{lastEvent=Date.now();try{const a=JSON.parse((e as MessageEvent).data) as Alert;if(!a.id||!a.message||(pondId&&a.pondId!==pondId)||!allowedPonds.has(a.pondId)||seenAlerts.has(a.id))return;seenAlerts.add(a.id);setAlerts(old=>[{...a,arrivedAt:Date.now()},...old].slice(0,30));refresh();}catch{setError('An unreadable alert was skipped.');}});
   stream.onerror=fail;clearInterval(watchdog);watchdog=setInterval(()=>{if(Date.now()-lastEvent>45000)fail();},5000);
  }
  const visibility=()=>{stopTimers();pollTimer=undefined;controller.abort();controller=new AbortController();if(document.hidden)setConnection('paused');else{void poll();connect();}};
  setReadings({});setSources([]);setAlerts([]);visibility();
  const clock=setInterval(()=>{if(!document.hidden)setNow(Date.now());},1000);
  document.addEventListener('visibilitychange',visibility);
  return()=>{stopped=true;stopTimers();controller.abort();clearInterval(clock);document.removeEventListener('visibilitychange',visibility);};
 },[session,pondId,siteId,router]);
 return {readings:Object.values(readings),sources,alerts,connection,error,now};
}
