import { mass, statusInfo } from '@/lib/display';

export function StatusBadge({ verdict }: { verdict?: string | null }) {
  const s = statusInfo(verdict);
  return <span className={`verdict ${s.tone}`}><span aria-hidden="true">{s.tone === 'ok' ? '✓' : s.tone === 'none' ? '○' : '!'}</span> {s.label}</span>;
}

export function CarbonComparison({ claimed, supported }: { claimed: number | null; supported: number | null }) {
  const scale = Math.max(claimed ?? 0, supported ?? 0, 1);
  return <div className="comparison">
    <div className="comparison-row"><div><span>Reported by the farm</span><strong className="num">{mass(claimed)}</strong></div>
      <div className="comparison-track" aria-hidden="true"><span style={{ width: `${Math.max(0, (claimed ?? 0) / scale * 100)}%` }} /></div>
    </div>
    <div className="comparison-row supported"><div><span>Supported by this check</span><strong className="num">{mass(supported)}</strong></div>
      <div className="comparison-track" aria-hidden="true"><span style={{ width: `${Math.max(0, (supported ?? 0) / scale * 100)}%` }} /></div>
    </div>
    <p className="helper">Both amounts are kilograms of carbon dioxide (CO₂). Evidence-supported capture is not an issued carbon credit.</p>
  </div>;
}

export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty"><span className="empty-symbol" aria-hidden="true">○</span><h2>{title}</h2><div>{children}</div></div>;
}
