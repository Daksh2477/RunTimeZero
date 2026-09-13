'use client';
import { useState } from 'react';

type Receipt = { id: string; at: string; kg: number; total: number; buyer: string; method: string };
export function DemoCheckout({ itemId, title, availableKg, inrPerKg, kind }: {
  itemId: string; title: string; availableKg: number; inrPerKg: number; kind: 'credits' | 'produce';
}) {
  const [open, setOpen] = useState(false);
  const [kg, setKg] = useState(Math.min(10, availableKg));
  const [buyer, setBuyer] = useState('Demo buyer');
  const [method, setMethod] = useState('UPI');
  const [review, setReview] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const valid = Number.isFinite(kg) && kg > 0 && kg <= availableKg && buyer.trim().length > 0;
  const money = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
  function confirm() {
    if (!valid || !review || receipt) return;
    setReceipt({ id: `DEMO-${crypto.randomUUID()}`, at: new Date().toISOString(), kg, total: Math.round(kg * inrPerKg * 100) / 100, buyer: buyer.trim(), method });
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...receipt, itemId, title, kind, demo: true, moneyTransferred: false, inventoryTransferred: false }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `${receipt!.id}.json`; a.click(); URL.revokeObjectURL(url);
  }
  return <section className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-3" aria-label="Demo checkout">
    <h3 className="font-semibold">Demo checkout · No real payment</h3>
    <p className="text-sm text-muted-foreground">Preview a purchase using simulated UPI or a simulated blockchain wallet. No money, credits or inventory move. This preview does not change farm revenue.</p>
    {receipt ? <div role="status" className="space-y-3">
      <h4 className="font-semibold">Demo purchase complete</h4>
      <p>{receipt.kg} kg {kind === 'credits' ? 'CO₂ credits' : 'algae'} → {receipt.buyer} · simulated allocation</p>
      <p>{money(receipt.total)} → {title} · simulated seller payment</p>
      <p className="text-sm">{receipt.method} simulation · {new Date(receipt.at).toLocaleString()}</p>
      <p className="reference break-all">{receipt.id}</p>
      <p className="text-sm">Demo receipt only. No payment settlement, blockchain transaction or retirement certificate was created.</p>
      <button className="button secondary" onClick={download}>Download demo receipt</button>
      <button className="button secondary" onClick={() => { setReceipt(null); setReview(false); }}>Start another demo</button>
    </div> : open ? <form className="market-form" onSubmit={e => { e.preventDefault(); if (!valid) return; if (review) confirm(); else setReview(true); }}>
      <fieldset disabled={review} className="market-form">
        <label>Demo quantity (kg)<input aria-label="Demo quantity (kg)" required type="number" min="0.01" step="any" max={availableKg} value={kg} onChange={e => setKg(Number(e.target.value))}/></label>
        <label>Demo buyer name<input aria-label="Demo buyer name" required value={buyer} onChange={e => setBuyer(e.target.value)}/></label>
        <label>Simulated payment method<select aria-label="Simulated payment method" value={method} onChange={e => setMethod(e.target.value)}><option>UPI</option><option>Blockchain wallet</option></select></label>
      </fieldset>
      <p>{kg} kg × {money(inrPerKg)}/kg = {money(kg * inrPerKg)}</p>
      {review && <div className="inline-notice"><h4>Review demo purchase</h4><p>{buyer} receives a simulated allocation from {title}. Seller receives a simulated {money(kg * inrPerKg)} via {method}.</p><button type="button" className="button secondary" onClick={() => setReview(false)}>Edit demo purchase</button></div>}
      <button className="button" disabled={!valid}>{review ? 'Approve simulated payment' : 'Review demo purchase'}</button>
    </form> : <button className="button" disabled={availableKg <= 0} onClick={() => setOpen(true)}>Try demo checkout</button>}
  </section>;
}
