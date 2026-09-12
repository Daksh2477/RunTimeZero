import { i as __toESM } from "../_runtime.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-collection+[...].mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { E as Download, t as Zap } from "../_libs/lucide-react.mjs";
import { a as XAxis, c as CartesianGrid, d as Tooltip, i as YAxis, r as LineChart, s as Line, u as ResponsiveContainer } from "../_libs/recharts+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/researcher-Bjxdab2p.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function ResearcherConsole() {
	const [irradiance, setIrradiance] = (0, import_react.useState)(720);
	const [nutrient, setNutrient] = (0, import_react.useState)(45);
	const [temp, setTemp] = (0, import_react.useState)(28);
	const series = (0, import_react.useMemo)(() => Array.from({ length: 24 }).map((_, h) => {
		const light = Math.max(0, Math.sin(h / 24 * Math.PI) * (irradiance / 1e3));
		return {
			hour: `${h}:00`,
			biomass: Number((.6 + light * (nutrient / 60) * 1.6).toFixed(3)),
			ph: Number((7.6 + light * .7 - nutrient / 100 * .4).toFixed(2)),
			temperature: Number((temp + light * 4).toFixed(2))
		};
	}), [
		irradiance,
		nutrient,
		temp
	]);
	const sliders = [
		{
			label: "Solar irradiance",
			unit: "W/m²",
			value: irradiance,
			set: setIrradiance,
			min: 100,
			max: 1200,
			step: 10
		},
		{
			label: "Nutrient dosing",
			unit: "mg/L",
			value: nutrient,
			set: setNutrient,
			min: 0,
			max: 100,
			step: 1
		},
		{
			label: "Baseline temperature",
			unit: "°C",
			value: temp,
			set: setTemp,
			min: 18,
			max: 40,
			step: .5
		}
	];
	const download = (format) => {
		const content = format === "json" ? JSON.stringify(series, null, 2) : ["hour,biomass,ph,temperature", ...series.map((r) => `${r.hour},${r.biomass},${r.ph},${r.temperature}`)].join("\n");
		const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
		const a = document.createElement("a");
		a.href = url;
		a.download = `rtz-telemetry.${format}`;
		a.click();
		URL.revokeObjectURL(url);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto max-w-7xl px-4 py-6 sm:px-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "font-display text-2xl font-semibold tracking-tight",
				children: "Research lab"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm text-muted-foreground",
				children: "Parameters bind to the rtz_physics growth engine · global telemetry access"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-6 grid gap-4 lg:grid-cols-[320px_1fr]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "rounded-xl border border-border bg-card p-5 shadow-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-sm font-semibold",
							children: "Engine parameters"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-5 space-y-6",
							children: sliders.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-baseline justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
									className: "text-sm font-medium",
									children: s.label
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "font-mono text-sm",
									children: [
										s.value,
										" ",
										s.unit
									]
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "range",
								min: s.min,
								max: s.max,
								step: s.step,
								value: s.value,
								onChange: (e) => s.set(Number(e.target.value)),
								className: "mt-2 w-full accent-accent"
							})] }, s.label))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							variant: "outline",
							className: "mt-6 w-full",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Zap, { className: "size-4" }), " Inject fault scenario"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-2 grid grid-cols-2 gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								variant: "secondary",
								onClick: () => download("csv"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "size-4" }), " CSV"]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								variant: "secondary",
								onClick: () => download("json"),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "size-4" }), " JSON"]
							})]
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
					className: "space-y-4",
					children: [
						{
							key: "biomass",
							title: "Biomass density (g/L)"
						},
						{
							key: "ph",
							title: "pH drift"
						},
						{
							key: "temperature",
							title: "Temperature curve (°C)"
						}
					].map((chart) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl border border-border bg-card p-5 shadow-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "font-display text-sm font-semibold",
							children: chart.title
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-3 h-44",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResponsiveContainer, {
								width: "100%",
								height: "100%",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(LineChart, {
									data: series,
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CartesianGrid, {
											strokeDasharray: "3 3",
											stroke: "var(--border)"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(XAxis, {
											dataKey: "hour",
											tick: { fontSize: 11 },
											interval: 3,
											stroke: "var(--muted-foreground)"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(YAxis, {
											tick: { fontSize: 11 },
											width: 38,
											stroke: "var(--muted-foreground)",
											domain: ["auto", "auto"]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tooltip, {}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Line, {
											type: "monotone",
											dataKey: chart.key,
											stroke: "var(--accent)",
											strokeWidth: 2,
											dot: false
										})
									]
								})
							})
						})]
					}, chart.key))
				})]
			})
		]
	});
}
//#endregion
export { ResearcherConsole as component };
