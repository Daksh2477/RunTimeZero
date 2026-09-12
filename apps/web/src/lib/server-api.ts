import { cookies } from 'next/headers';
import { cache } from 'react';
import { isSession, type Session } from './auth-contract';
export const SESSION_COOKIE = 'algacarbon_session';
export const API_ORIGIN = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export async function serverApiFetch(path: string, init: RequestInit = {}) {
  const token=(await cookies()).get(SESSION_COOKIE)?.value;
  const headers=new Headers(init.headers);
  if(token) headers.set('Authorization',`Bearer ${token}`);
  return fetch(`${API_ORIGIN}${path}`,{...init,headers,cache:'no-store',signal:init.signal??AbortSignal.timeout(15000)});
}
export const serverSession=cache(async():Promise<Session|null>=>{
  if(!(await cookies()).has(SESSION_COOKIE))return null;
  try{const r=await serverApiFetch('/auth/me');const body=await r.json();return r.ok&&isSession(body)?body:null;}catch{return null;}
});
