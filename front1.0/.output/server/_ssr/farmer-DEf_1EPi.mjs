import { i as __toESM } from "../_runtime.mjs";
import { u as require_react } from "../_libs/@floating-ui/react-dom+[...].mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-collection+[...].mjs";
import { t as Button } from "./button-DRsC1qZi.mjs";
import { a as GROWTH_OUTLOOK, d as bandFor, f as statusToken, i as FORECAST_24H, l as USERS, n as EARNED_CREDITS, o as PONDS, r as FIELD_RISKS, u as WEATHER_NOW } from "./mockData-CPGb_Aq0.mjs";
import { A as CircleCheck, F as BellRing, O as Coins, T as Droplets, _ as Navigation, c as TriangleAlert, d as Sun, f as Sprout, i as Waves, k as CloudRain, l as TrendingUp, r as Wind, u as Thermometer } from "../_libs/lucide-react.mjs";
import { a as XAxis, c as CartesianGrid, d as Tooltip, i as YAxis, l as Bar, n as BarChart, o as Area, s as Line, t as AreaChart, u as ResponsiveContainer } from "../_libs/recharts+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/farmer-DEf_1EPi.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var bandClasses = {
	optimal: {
		chip: "bg-status-optimal/12 text-foreground",
		ring: "border-status-optimal/40",
		text: "text-status-optimal",
		dot: "bg-status-optimal"
	},
	warning: {
		chip: "bg-status-warning/16 text-foreground",
		ring: "border-status-warning/50",
		text: "text-status-warning",
		dot: "bg-status-warning"
	},
	critical: {
		chip: "bg-status-critical/14 text-foreground",
		ring: "border-status-critical/50",
		text: "text-status-critical",
		dot: "bg-status-critical"
	}
};
function BigReading({ icon: Icon, label, value, unit, hint, band, spin }) {
	const b = bandClasses[band];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: `rounded-xl border-2 bg-card p-4 shadow-sm ${b.ring}`,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: `size-4 ${b.text} ${spin ? "animate-spin [animation-duration:3s]" : ""}` }), label]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `size-2.5 rounded-full ${b.dot} ${band !== "optimal" ? "animate-pulse" : ""}` })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: `mt-3 font-display text-4xl font-semibold ${b.text}`,
				children: [value, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "ml-1 text-base font-normal text-muted-foreground",
					children: unit
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-xs text-muted-foreground",
				children: hint
			})
		]
	});
}
function FarmerConsole() {
	const farmer = USERS.find((u) => u.role === "farmer");
	const ponds = PONDS.filter((p) => farmer.pondIds.includes(p.id));
	const [acknowledged, setAcknowledged] = (0, import_react.useState)([]);
	const w = WEATHER_NOW;
	const tempBand = bandFor(w.temperatureC, 31, 34);
	const windBand = bandFor(w.windKph, 25, 35);
	const sunBand = bandFor(w.sunlightWm2, 850, 950);
	const rainBand = w.rainfallMm > 8 ? "warning" : "optimal";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mx-auto max-w-7xl px-4 py-6 sm:px-6",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", {
				className: "font-display text-2xl font-semibold tracking-tight",
				children: ["Good day, ", farmer.name.split(" ")[0]]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "mt-1 text-sm text-muted-foreground",
				children: [ponds.length, " ponds assigned to you · synced moments ago"]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-6",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
					className: "font-display text-sm font-semibold tracking-wide text-muted-foreground uppercase",
					children: "On the farm right now"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BigReading, {
							icon: Thermometer,
							label: "Water temp",
							value: w.temperatureC.toFixed(1),
							unit: "°C",
							hint: tempBand === "optimal" ? "Comfortable for growth" : "Rising — watch for heat stress",
							band: tempBand
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BigReading, {
							icon: Wind,
							label: "Wind",
							value: String(w.windKph),
							unit: "km/h",
							hint: `Blowing from the ${w.windDirection}`,
							band: windBand,
							spin: true
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BigReading, {
							icon: Sun,
							label: "Sunlight",
							value: String(w.sunlightWm2),
							unit: "W/m²",
							hint: sunBand === "optimal" ? "Good light for algae" : "Very strong sun",
							band: sunBand
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BigReading, {
							icon: CloudRain,
							label: "Rain",
							value: w.rainfallMm.toFixed(1),
							unit: "mm",
							hint: `Humidity ${w.humidityPct}%`,
							band: rainBand
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl border border-border bg-card p-5 shadow-sm",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Navigation, { className: "size-4 text-accent" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
								className: "font-display text-base font-semibold",
								children: "Next 24 hours"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-xs text-muted-foreground",
							children: "Temperature turns amber above 31°C and red above 34°C. Wind is the dashed line."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "mt-4 h-64",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResponsiveContainer, {
								width: "100%",
								height: "100%",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AreaChart, {
									data: FORECAST_24H,
									margin: {
										left: -18,
										right: 6,
										top: 6
									},
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", {
											id: "tempFill",
											x1: "0",
											y1: "0",
											x2: "0",
											y2: "1",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
													offset: "0%",
													stopColor: "var(--status-critical)",
													stopOpacity: .55
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
													offset: "55%",
													stopColor: "var(--status-warning)",
													stopOpacity: .35
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
													offset: "100%",
													stopColor: "var(--status-optimal)",
													stopOpacity: .15
												})
											]
										}) }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CartesianGrid, {
											strokeDasharray: "3 3",
											stroke: "var(--border)"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(XAxis, {
											dataKey: "hour",
											tick: { fontSize: 11 },
											stroke: "var(--muted-foreground)"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(YAxis, {
											tick: { fontSize: 11 },
											stroke: "var(--muted-foreground)"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tooltip, { contentStyle: {
											background: "var(--card)",
											border: "1px solid var(--border)",
											borderRadius: 8,
											fontSize: 12
										} }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
											type: "monotone",
											dataKey: "temperatureC",
											name: "Temp °C",
											stroke: "var(--status-critical)",
											strokeWidth: 2,
											fill: "url(#tempFill)"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Line, {
											type: "monotone",
											dataKey: "windKph",
											name: "Wind km/h",
											stroke: "var(--panel)",
											strokeDasharray: "5 4",
											strokeWidth: 2,
											dot: false
										})
									]
								})
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "flex items-center gap-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-0.5 w-5 bg-status-critical" }), " Temperature"]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "flex items-center gap-1.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "h-0.5 w-5 border-t-2 border-dashed border-panel" }), " Wind speed"]
							})]
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl border border-border bg-card p-5 shadow-sm",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-base font-semibold",
						children: "What to watch"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "mt-4 space-y-3",
						children: FIELD_RISKS.map((r) => {
							const b = bandClasses[r.severity];
							const Icon = r.severity === "optimal" ? CircleCheck : TriangleAlert;
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
								className: `rounded-lg border p-4 ${b.ring} ${b.chip}`,
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
										className: "flex items-start gap-2 font-display text-sm font-semibold",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: `mt-0.5 size-4 shrink-0 ${b.text}` }), r.title]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1.5 text-xs text-muted-foreground",
										children: r.detail
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-2 text-xs font-semibold",
										children: r.action
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "mt-1 font-mono text-[11px] text-muted-foreground",
										children: r.when
									})
								]
							}, r.id);
						})
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "mt-6 rounded-xl border border-border bg-card p-5 shadow-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-end justify-between gap-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TrendingUp, { className: "size-4 text-status-optimal" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "font-display text-base font-semibold",
							children: "Growth outlook — next 7 days"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 text-xs text-muted-foreground",
						children: [
							"Forecast confidence ",
							GROWTH_OUTLOOK.confidencePct,
							"%"
						]
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "grid grid-cols-3 gap-6",
						children: [
							{
								k: "Biomass now",
								v: `${GROWTH_OUTLOOK.biomassNowGPerL} g/L`
							},
							{
								k: "In 7 days",
								v: `${GROWTH_OUTLOOK.biomassIn7DaysGPerL} g/L`
							},
							{
								k: "Credits this week",
								v: `${GROWTH_OUTLOOK.creditsThisWeek}`
							}
						].map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[11px] tracking-wide text-muted-foreground uppercase",
							children: s.k
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 font-display text-xl font-semibold",
							children: s.v
						})] }, s.k))
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-4 h-48",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResponsiveContainer, {
						width: "100%",
						height: "100%",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(BarChart, {
							data: GROWTH_OUTLOOK.week,
							margin: {
								left: -18,
								right: 6,
								top: 6
							},
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CartesianGrid, {
									strokeDasharray: "3 3",
									stroke: "var(--border)"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(XAxis, {
									dataKey: "day",
									tick: { fontSize: 11 },
									stroke: "var(--muted-foreground)"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(YAxis, {
									tick: { fontSize: 11 },
									stroke: "var(--muted-foreground)"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tooltip, { contentStyle: {
									background: "var(--card)",
									border: "1px solid var(--border)",
									borderRadius: 8,
									fontSize: 12
								} }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bar, {
									dataKey: "biomassGPerL",
									name: "Biomass g/L",
									fill: "var(--status-optimal)",
									radius: [
										4,
										4,
										0,
										0
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Bar, {
									dataKey: "credits",
									name: "Credits",
									fill: "var(--status-warning)",
									radius: [
										4,
										4,
										0,
										0
									]
								})
							]
						})
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "mt-8 font-display text-sm font-semibold tracking-wide text-muted-foreground uppercase",
				children: "Your ponds"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3",
				children: ponds.map((pond) => {
					const s = statusToken(pond.status);
					const done = acknowledged.includes(pond.id);
					const pb = bandClasses[pond.status];
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
						className: `rounded-xl border-2 bg-card p-5 shadow-sm ${pb.ring}`,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex items-start justify-between",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
									className: "font-display text-lg font-semibold",
									children: pond.label
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "font-mono text-xs text-muted-foreground",
									children: pond.id
								})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `size-2.5 rounded-full ${s.color} ${pond.status !== "optimal" ? "animate-pulse" : ""}` }),
										" ",
										s.text
									]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dl", {
								className: "mt-5 grid grid-cols-3 gap-3",
								children: [
									{
										icon: Thermometer,
										k: "Temp",
										v: `${pond.temperatureC}°C`,
										band: bandFor(pond.temperatureC, 31, 34)
									},
									{
										icon: Droplets,
										k: "pH",
										v: pond.ph.toFixed(1),
										band: bandFor(8.4 - pond.ph, 1.2, 1.8)
									},
									{
										icon: Sprout,
										k: "Biomass",
										v: `${pond.biomassGPerL} g/L`,
										band: bandFor(1.4 - pond.biomassGPerL, .3, .7)
									}
								].map(({ icon: Icon, k, v, band }) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "rounded-lg bg-secondary px-3 py-3 text-center",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: `mx-auto size-4 ${bandClasses[band].text}` }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", {
											className: "mt-1 text-[11px] tracking-wide text-muted-foreground uppercase",
											children: k
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
											className: `font-display text-lg font-semibold ${bandClasses[band].text}`,
											children: v
										})
									]
								}, k))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-4 text-sm text-muted-foreground",
								children: pond.note
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-4 grid grid-cols-2 gap-2",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									className: "h-12",
									variant: done ? "secondary" : "default",
									onClick: () => setAcknowledged((a) => [...a, pond.id]),
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BellRing, { className: "size-4" }),
										" ",
										done ? "Acknowledged" : "Acknowledge"
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									variant: "outline",
									className: "h-12",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Waves, { className: "size-4" }), " Run flush"]
								})]
							})
						]
					}, pond.id);
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
				className: "mt-6 rounded-xl border border-border bg-card p-6 shadow-sm",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-wrap items-center justify-between gap-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs tracking-wide text-muted-foreground uppercase",
						children: "Earned carbon credits"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-1 font-display text-4xl font-semibold",
						children: [EARNED_CREDITS.pending, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "ml-2 text-base font-normal text-muted-foreground",
							children: [
								"pending · ",
								EARNED_CREDITS.tokenized,
								" tokenized"
							]
						})]
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						className: "h-12 px-6 text-base",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Coins, { className: "size-4" }), " Submit batch for tokenization"]
					})]
				})
			})
		]
	});
}
//#endregion
export { FarmerConsole as component };
