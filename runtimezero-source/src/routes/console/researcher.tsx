import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Line,
  LineChart as RCLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/console/researcher")({
  head: () => ({
    meta: [
      { title: "Research lab — RunTimeZero AlgaCarbon" },
      { name: "description", content: "Drive the WebAssembly growth engine, inspect pond time-series telemetry and export raw datasets." },
      { property: "og:title", content: "Research lab — RunTimeZero AlgaCarbon" },
      { property: "og:description", content: "Simulation controls, telemetry deep-dive and one-click data export." },
    ],
  }),
  component: ResearcherConsole,
});

function ResearcherConsole() {
  const [irradiance, setIrradiance] = useState(720);
  const [nutrient, setNutrient] = useState(45);
  const [temp, setTemp] = useState(28);

  const series = useMemo(
    () =>
      Array.from({ length: 24 }).map((_, h) => {
        const light = Math.max(0, Math.sin((h / 24) * Math.PI) * (irradiance / 1000));
        return {
          hour: `${h}:00`,
          biomass: Number((0.6 + light * (nutrient / 60) * 1.6).toFixed(3)),
          ph: Number((7.6 + light * 0.7 - (nutrient / 100) * 0.4).toFixed(2)),
          temperature: Number((temp + light * 4).toFixed(2)),
        };
      }),
    [irradiance, nutrient, temp],
  );

  const sliders = [
    { label: "Solar irradiance", unit: "W/m²", value: irradiance, set: setIrradiance, min: 100, max: 1200, step: 10 },
    { label: "Nutrient dosing", unit: "mg/L", value: nutrient, set: setNutrient, min: 0, max: 100, step: 1 },
    { label: "Baseline temperature", unit: "°C", value: temp, set: setTemp, min: 18, max: 40, step: 0.5 },
  ];

  const download = (format: "csv" | "json") => {
    const content =
      format === "json"
        ? JSON.stringify(series, null, 2)
        : ["hour,biomass,ph,temperature", ...series.map((r) => `${r.hour},${r.biomass},${r.ph},${r.temperature}`)].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rtz-telemetry.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Research lab</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Parameters bind to the rtz_physics growth engine · global telemetry access
      </p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr]">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-display text-sm font-semibold">Engine parameters</h2>
          <div className="mt-5 space-y-6">
            {sliders.map((s) => (
              <div key={s.label}>
                <div className="flex items-baseline justify-between">
                  <label className="text-sm font-medium">{s.label}</label>
                  <span className="font-mono text-sm">
                    {s.value} {s.unit}
                  </span>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={s.value}
                  onChange={(e) => s.set(Number(e.target.value))}
                  className="mt-2 w-full accent-accent"
                />
              </div>
            ))}
          </div>
          <Button variant="outline" className="mt-6 w-full">
            <Zap className="size-4" /> Inject fault scenario
          </Button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => download("csv")}>
              <Download className="size-4" /> CSV
            </Button>
            <Button variant="secondary" onClick={() => download("json")}>
              <Download className="size-4" /> JSON
            </Button>
          </div>
        </section>

        <section className="space-y-4">
          {[
            { key: "biomass", title: "Biomass density (g/L)" },
            { key: "ph", title: "pH drift" },
            { key: "temperature", title: "Temperature curve (°C)" },
          ].map((chart) => (
            <div key={chart.key} className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h3 className="font-display text-sm font-semibold">{chart.title}</h3>
              <div className="mt-3 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <RCLineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={3} stroke="var(--muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} width={38} stroke="var(--muted-foreground)" domain={["auto", "auto"]} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey={chart.key}
                      stroke="var(--accent)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </RCLineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
