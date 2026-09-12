'use client';
import { useEffect, useRef, type ReactNode } from 'react';
export function DetailSheet({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();},[]);
 return <dialog className="detail-sheet" ref={ref} aria-label={title} onClose={onClose} onClick={e=>{if(e.target===ref.current)ref.current.close();}}><div className="detail-sheet-body"><header><h2>{title}</h2><button className="button secondary" onClick={()=>ref.current?.close()}>Close</button></header>{children}</div></dialog>;
}
export function ResourceState({loading,error,empty}:{loading:boolean;error:string|null;empty?:boolean}) {
 return loading?<div className="resource-loading" role="status">Loading…<div/><div/></div>:error?<p role="alert" className="err">{error}</p>:empty?<p className="inline-empty">No records yet.</p>:null;
}
