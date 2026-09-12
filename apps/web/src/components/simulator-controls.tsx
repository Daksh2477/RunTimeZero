'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

const tabs = ['Scenario', 'Conditions', 'Sensors', 'Details'] as const;
type Tab = typeof tabs[number];
export function SimulatorControls(props: { scenario: ReactNode; conditions: ReactNode; sensors: ReactNode; details: ReactNode }) {
  const [tab, setTab] = useState<Tab>('Scenario');
  const [mobile, setMobile] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef(0);
  useEffect(() => {
    const query = matchMedia('(max-width: 1023px)');
    const update = () => { setMobile(query.matches); dialog.current?.close(); };
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const content = props[tab.toLowerCase() as keyof typeof props];
  return <aside className="simulator-controls">
    <div className="sim-tabs" aria-label="Simulator controls">{tabs.map(t => <button key={t} aria-pressed={t===tab} aria-haspopup={mobile ? 'dialog' : undefined} onClick={()=>{setTab(t); if(mobile) dialog.current?.showModal();}}>{t}</button>)}</div>
    {mobile ? <dialog ref={dialog} className="sim-sheet" aria-labelledby="sim-sheet-title" onClick={e=>{if(e.target===dialog.current) dialog.current.close();}}>
      <div className="sim-sheet-inner">
        <div className="sim-sheet-handle" onPointerDown={e=>{drag.current=e.clientY;e.currentTarget.setPointerCapture(e.pointerId);}} onPointerUp={e=>{if(e.clientY-drag.current>45) dialog.current?.close();}}><span /></div>
        <header><h2 id="sim-sheet-title">{tab}</h2><button className="button secondary" onClick={()=>dialog.current?.close()}>Close</button></header>
        <div className="sim-control-content">{content}</div>
      </div>
    </dialog> : <div className="sim-control-content" aria-label={tab}>{content}</div>}
  </aside>;
}
