import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, ExternalLink, CreditCard, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CREDIT_BATCHES, PONDS, SITES, statusToken } from "@/lib/mockData";

const PORTFOLIO_SERIES = [
  { month: "Mar", navUsd: 4.1, priceIndex: 26.2 },
  { month: "Apr", navUsd: 4.6, priceIndex: 27.4 },
  { month: "May", navUsd: 5.0, priceIndex: 28.1 },
  { month: "Jun", navUsd: 5.4, priceIndex: 29.6 },
  { month: "Jul", navUsd: 5.9, priceIndex: 30.4 },
  { month: "Aug", navUsd: 6.5, priceIndex: 31.5 },
];

export const Route = createFileRoute("/console/investor")({
  head: () => ({
    meta: [
      { title: "Investor hub — RunTimeZero AlgaCarbon" },
      { name: "description", content: "Live facility performance, a verified carbon credit marketplace and portfolio yield analytics for investors." },
      { property: "og:title", content: "Investor hub — RunTimeZero AlgaCarbon" },
      { property: "og:description", content: "Track facilities, trade verified carbon credits and follow portfolio yield." },
    ],
  }),
  component: InvestorConsole,
});

function InvestorConsole() {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [batchId, setBatchId] = useState(CREDIT_BATCHES[0]!.id);
  const [qty, setQty] = useState(25);
  const batch = CREDIT_BATCHES.find((b) => b.id === batchId)!;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Investor hub</h1>
          <p className="mt-1 text-sm text-muted-foreground">Nordvik Capital · 2 sites · 206 t CO₂ held</p>
        </div>
        <span className="flex items-center gap-2 rounded-full bg-status-optimal/12 px-3 py-1.5 text-xs font-semibold text-foreground">
          <ShieldCheck className="size-4 text-status-optimal" /> Identity verified
        </span>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="font-display text-sm font-semibold">Facility map</h2>
          <p className="text-xs text-muted-foreground">Bird's-eye pond grid, live status</p>
          <div className="mt-4 space-y-5">
            {SITES.map((site) => (
              <div key={site.id}>
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-medium">{site.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {site.region} · {site.biomassTonnes} t biomass
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-12">
                  {Array.from({ length: site.activePonds }).map((_, i) => {
                    const sample = PONDS.filter((p) => p.siteId === site.id);
                    const pond = sample[i % sample.length]!;
                    return (
                      <div
                        key={i}
                        title={`${pond.label} — ${statusToken(pond.status).text}`}
                        className={`aspect-square rounded-md ${statusToken(pond.status).color} opacity-85`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-sm font-semibold">Trade order</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-secondary p-1">
            {(["buy", "sell"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`rounded-md px-3 py-2 text-sm font-semibold capitalize transition-colors ${
                  side === s ? "bg-card shadow-sm" : "text-muted-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <label className="mt-4 block text-xs text-muted-foreground">Batch</label>
          <select
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {CREDIT_BATCHES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.id} — ${b.pricePerTonneUsd}/t
              </option>
            ))}
          </select>

          <label className="mt-4 block text-xs text-muted-foreground">Tonnes CO₂</label>
          <input
            type="number"
            value={qty}
            min={1}
            onChange={(e) => setQty(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />

          <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">Order total</span>
            <span className="font-display text-2xl font-semibold">
              ${(qty * batch.pricePerTonneUsd).toLocaleString()}
            </span>
          </div>
          <Button className="mt-4 w-full">
            <CreditCard className="size-4" /> Pay by card
          </Button>
          <Button variant="outline" className="mt-2 w-full">
            <Coins className="size-4" /> Pay with stablecoin
          </Button>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <h2 className="font-display text-sm font-semibold">Portfolio yield</h2>
          <p className="text-xs text-muted-foreground">Net asset value vs. credit price index</p>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={PORTFOLIO_SERIES}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="navUsd" name="NAV ($k)" stroke="var(--status-optimal)" fill="var(--status-optimal)" fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="priceIndex" name="Price index" stroke="var(--status-warning)" fill="var(--status-warning)" fillOpacity={0.08} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-sm font-semibold">Holdings</h2>
          <dl className="mt-4 space-y-4">
            {[
              ["Credits held", "206 t CO₂"],
              ["Cost basis", "$5,940"],
              ["Market value", "$6,489"],
              ["Unrealised ROI", "+9.2%"],
              ["Retired / certified", "48 t CO₂"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between border-b border-border pb-3 last:border-0 last:pb-0">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-display text-sm font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="mt-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <h2 className="border-b border-border px-5 py-4 font-display text-sm font-semibold">
          Verified credit batches
        </h2>
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-5 py-3 font-medium">Batch</th>
              <th className="px-5 py-3 font-medium">Site</th>
              <th className="px-5 py-3 font-medium">Tonnes</th>
              <th className="px-5 py-3 font-medium">Price</th>
              <th className="px-5 py-3 font-medium">On-chain proof</th>
              <th className="px-5 py-3 font-medium">Certificate</th>
            </tr>
          </thead>
          <tbody>
            {CREDIT_BATCHES.map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td className="px-5 py-3 font-medium">{b.id}</td>
                <td className="px-5 py-3 text-muted-foreground">{b.siteId}</td>
                <td className="px-5 py-3">{b.tonnesCO2}</td>
                <td className="px-5 py-3">${b.pricePerTonneUsd}</td>
                <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{b.verificationHash}</td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-foreground underline-offset-2 hover:underline">
                    View <ExternalLink className="size-3" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
