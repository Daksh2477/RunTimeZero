'use client';
import { useEffect, useState } from 'react';
import { clientFetch } from './client-api';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status=status; }
}
export async function apiData<T>(path: string, init?: RequestInit): Promise<T> {
  const r=await clientFetch(path,{...init,headers:{'Content-Type':'application/json',...init?.headers}});
  let body; try { body=await r.json(); } catch { throw new ApiError('The service returned an unreadable response.',r.status); }
  if(!r.ok) throw new ApiError(body.error??`Request failed (${r.status})`,r.status);
  return body;
}
export function useApiData<T>(path: string | null, revision=0) {
  const [state,setState]=useState<{data:T|null;loading:boolean;error:string|null;missing:boolean}>({data:null,loading:!!path,error:null,missing:false});
  useEffect(()=>{
    const controller=new AbortController();
    setState({data:null,loading:!!path,error:null,missing:false});
    if(!path)return;
    async function load(){try{const data=await apiData<T>(path!,{signal:controller.signal});if(!controller.signal.aborted)setState({data,loading:false,error:null,missing:false});}catch(e){if(!controller.signal.aborted)setState({data:null,loading:false,error:e instanceof Error?e.message:'Could not load.',missing:e instanceof ApiError&&e.status===404});}}
    void load();return()=>controller.abort();
  },[path,revision]);return state;
}
