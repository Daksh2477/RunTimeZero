import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Droplets,
  Thermometer,
  Sprout,
  BellRing,
  Waves,
  Coins,
  Wind,
  Sun,
  CloudRain,
  TriangleAlert,
  CircleCheck,
  TrendingUp,
  Navigation,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  EARNED_CREDITS,
  FIELD_RISKS,
  FORECAST_24H,
  GROWTH_OUTLOOK,
  PONDS,
  USERS,
  WEATHER_NOW,
  bandFor,
  statusToken,
  type PondStatus,
} from "@/lib/mockData";

export const Route = createFileRoute("/console/farmer")({
  head: () => ({
    meta: [
      { title: "Field console — RunTimeZero AlgaCarbon" },
      {
        name: "description",
        content:
          "Live pond weather, heat and wind warnings, hour-by-hour forecast and growth outlook for algae farmers.",
      },
      { property: "og:title", content: "Field console — RunTimeZero AlgaCarbon" },
      {
        property: "og:description",
        content: "Weather now, what is coming next and how much your ponds will earn this week.",
      },
    ],
  }),
  component: FarmerConsole,
});

const bandClasses: Record<PondStatus, { chip: string; ring: string; text: string; dot: string }> = {
  optimal: {
    chip: "bg-status-optimal/12 text-foreground",
    ring: "border-status-optimal/40",
    text: "text-status-optimal",
    dot: "bg-status-optimal",
  },
  warning: {
    chip: "bg-status-warning/16 text-foreground",
    ring: "border-status-warning/50",
    text: "text-status-warning",
    dot: "bg-status-warning",
  },
  critical: {
    chip: "bg-status-critical/14 text-foreground",
    ring: "border-status-critical/50",
    text: "text-status-critical",
    dot: "bg-status-critical",
  },
};

function BigReading({
  icon: Icon,
  label,
  value,
  unit,
  hint,
  band,
  spin,
}: {
  icon: typeof Wind;
  label: string;
  value: string;
  unit: string;
  hint: string;
  band: PondStatus;
  spin?: boolean;
}) {
  const b = bandClasses[band];
  return (
    <div className={`rounded-xl border-2 bg-card p-4 shadow-sm ${b.ring}`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Icon className={`size-4 ${b.text} ${spin ? "animate-spin [animation-duration:3s]" : ""}`} />
          {label}
        </span>
        <span className={`size-2.5 rounded-full ${b.dot} ${band !== "optimal" ? "animate-pulse" : ""}`} />
      </div>
      <p className={`mt-3 font-display text-4xl font-semibold ${b.text}`}>
        {value}
        <span className="ml-1 text-base font-normal text-muted-foreground">{unit}</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function FarmerConsole() {
  const farmer = USERS.find((u) => u.role === "farmer")!;
  const ponds = PONDS.filter((p) => farmer.pondIds.includes(p.id));
  const [acknowledged, setAcknowledged] = useState<string[]>([]);

  const w = WEATHER_NOW;
  const tempBand = bandFor(w.temperatureC, 31, 34);
  const windBand = bandFor(w.windKph, 25, 35);
  const sunBand = bandFor(w.sunlightWm2, 850, 950);
  const rainBand: PondStatus = w.rainfallMm > 8 ? "warning" : "optimal";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Good day, {farmer.name.split(" ")[0]}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {ponds.length} ponds assigned to you · synced moments ago
      </p>

      {/* Weather right now */}
      <section className="mt-6">
        <h2 className="font-display text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          On the farm right now
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <BigReading
            icon={Thermometer}
            label="Water temp"
            value={w.temperatureC.toFixed(1)}
            unit="°C"
            hint={tempBand === "optimal" ? "Comfortable for growth" : "Rising — watch for heat stress"}
            band={tempBand}
          />
          <BigReading
            icon={Wind}
            label="Wind"
            value={String(w.windKph)}
            unit="km/h"
            hint={`Blowing from the ${w.windDirection}`}
            band={windBand}
            spin
          />
          <BigReading
            icon={Sun}
            label="Sunlight"
            value={String(w.sunlightWm2)}
            unit="W/m²"
            hint={sunBand === "optimal" ? "Good light for algae" : "Very strong sun"}
            band={sunBand}
          />
          <BigReading
            icon={CloudRain}
            label="Rain"
            value={w.rainfallMm.toFixed(1)}
            unit="mm"
            hint={`Humidity ${w.humidityPct}%`}
            band={rainBand}
          />
        </div>
      </section>

      {/* What is coming */}
      <section className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Navigation className="size-4 text-accent" />
            <h2 className="font-display text-base font-semibold">Next 24 hours</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Temperature turns amber above 31°C and red above 34°C. Wind is the dashed line.
          </p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={FORECAST_24H} margin={{ left: -18, right: 6, top: 6 }}>
                <defs>
                  <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--status-critical)" stopOpacity={0.55} />
                    <stop offset="55%" stopColor="var(--status-warning)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--status-optimal)" stopOpacity={0.15} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="temperatureC"
                  name="Temp °C"
                  stroke="var(--status-critical)"
                  strokeWidth={2}
                  fill="url(#tempFill)"
                />
                <Line
                  type="monotone"
                  dataKey="windKph"
                  name="Wind km/h"
                  stroke="var(--panel)"
                  strokeDasharray="5 4"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-5 bg-status-critical" /> Temperature
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-5 border-t-2 border-dashed border-panel" /> Wind speed
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-base font-semibold">What to watch</h2>
          <ul className="mt-4 space-y-3">
            {FIELD_RISKS.map((r) => {
              const b = bandClasses[r.severity];
              const Icon = r.severity === "optimal" ? CircleCheck : TriangleAlert;
              return (
                <li key={r.id} className={`rounded-lg border p-4 ${b.ring} ${b.chip}`}>
                  <p className="flex items-start gap-2 font-display text-sm font-semibold">
                    <Icon className={`mt-0.5 size-4 shrink-0 ${b.text}`} />
                    {r.title}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{r.detail}</p>
                  <p className="mt-2 text-xs font-semibold">{r.action}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">{r.when}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* Growth outlook */}
      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-status-optimal" />
              <h2 className="font-display text-base font-semibold">Growth outlook — next 7 days</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Forecast confidence {GROWTH_OUTLOOK.confidencePct}%
            </p>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {[
              { k: "Biomass now", v: `${GROWTH_OUTLOOK.biomassNowGPerL} g/L` },
              { k: "In 7 days", v: `${GROWTH_OUTLOOK.biomassIn7DaysGPerL} g/L` },
              { k: "Credits this week", v: `${GROWTH_OUTLOOK.creditsThisWeek}` },
            ].map((s) => (
              <div key={s.k}>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{s.k}</p>
                <p className="mt-1 font-display text-xl font-semibold">{s.v}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={GROWTH_OUTLOOK.week} margin={{ left: -18, right: 6, top: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="biomassGPerL" name="Biomass g/L" fill="var(--status-optimal)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="credits" name="Credits" fill="var(--status-warning)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Ponds */}
      <h2 className="mt-8 font-display text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Your ponds
      </h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ponds.map((pond) => {
          const s = statusToken(pond.status);
          const done = acknowledged.includes(pond.id);
          const pb = bandClasses[pond.status];
          return (
            <article
              key={pond.id}
              className={`rounded-xl border-2 bg-card p-5 shadow-sm ${pb.ring}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-display text-lg font-semibold">{pond.label}</h3>
                  <p className="font-mono text-xs text-muted-foreground">{pond.id}</p>
                </div>
                <span className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold">
                  <span
                    className={`size-2.5 rounded-full ${s.color} ${pond.status !== "optimal" ? "animate-pulse" : ""}`}
                  />{" "}
                  {s.text}
                </span>
              </div>

              <dl className="mt-5 grid grid-cols-3 gap-3">
                {[
                  {
                    icon: Thermometer,
                    k: "Temp",
                    v: `${pond.temperatureC}°C`,
                    band: bandFor(pond.temperatureC, 31, 34),
                  },
                  {
                    icon: Droplets,
                    k: "pH",
                    v: pond.ph.toFixed(1),
                    band: bandFor(8.4 - pond.ph, 1.2, 1.8),
                  },
                  {
                    icon: Sprout,
                    k: "Biomass",
                    v: `${pond.biomassGPerL} g/L`,
                    band: bandFor(1.4 - pond.biomassGPerL, 0.3, 0.7),
                  },
                ].map(({ icon: Icon, k, v, band }) => (
                  <div key={k} className="rounded-lg bg-secondary px-3 py-3 text-center">
                    <Icon className={`mx-auto size-4 ${bandClasses[band].text}`} />
                    <dt className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">{k}</dt>
                    <dd className={`font-display text-lg font-semibold ${bandClasses[band].text}`}>{v}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-4 text-sm text-muted-foreground">{pond.note}</p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  className="h-12"
                  variant={done ? "secondary" : "default"}
                  onClick={() => setAcknowledged((a) => [...a, pond.id])}
                >
                  <BellRing className="size-4" /> {done ? "Acknowledged" : "Acknowledge"}
                </Button>
                <Button variant="outline" className="h-12">
                  <Waves className="size-4" /> Run flush
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Earned carbon credits</p>
            <p className="mt-1 font-display text-4xl font-semibold">
              {EARNED_CREDITS.pending}
              <span className="ml-2 text-base font-normal text-muted-foreground">
                pending · {EARNED_CREDITS.tokenized} tokenized
              </span>
            </p>
          </div>
          <Button className="h-12 px-6 text-base">
            <Coins className="size-4" /> Submit batch for tokenization
          </Button>
        </div>
      </section>
    </div>
  );
}
