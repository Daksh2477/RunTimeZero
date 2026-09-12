'use client';
import { useEffect, useState } from 'react';
import { clientJson } from './client-api';
import { isSession, type Session } from './auth-contract';
export { ROLE_META, canAccess, sessionHome } from './auth-contract';
export type { Role, Account, Session } from './auth-contract';
const EVENT='rtz-session-change';
let cached: Session|null=null;
let inFlight:Promise<Session|null>|null=null;
export async function refreshSession():Promise<Session|null>{
 if(inFlight)return inFlight;
 inFlight=clientJson<unknown>('/auth/me').then(data=>cached=isSession(data)?data:null).catch(()=>cached=null).finally(()=>{inFlight=null;window.dispatchEvent(new Event(EVENT));});
 return inFlight;
}
export async function signOut(){await clientJson('/auth/logout',{method:'POST',body:'{}'});cached=null;window.dispatchEvent(new Event(EVENT));}
export function useRole(){
 const [session,setSession]=useState<Session|null>(cached);const [ready,setReady]=useState(false);
 useEffect(()=>{
  let active=true;
  const read=()=>{if(active){setSession(cached);setReady(true);}};
  const expired=()=>{cached=null;read();};
  const focus=()=>{void refreshSession();};
  window.addEventListener(EVENT,read);window.addEventListener('rtz-auth-expired',expired);window.addEventListener('focus',focus);
  void refreshSession().then(()=>{if(active)read();});
  return()=>{active=false;window.removeEventListener(EVENT,read);window.removeEventListener('rtz-auth-expired',expired);window.removeEventListener('focus',focus);};
 },[]);
 return {role:session?.account.role??null,account:session?.account??null,session,ready};
}
