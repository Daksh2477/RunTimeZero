/**
 * Unified mock state for RunTimeZero (AlgaCarbon).
 * Every console reads from here so the UI is fully interactive without a backend.
 * Swap these for real reads via the hooks in `lib/api.ts` when apps/api is live.
 */

export type Role = "farmer" | "investor" | "researcher";
export type PondStatus = "optimal" | "warning" | "critical";

export interface Pond {
  id: string;
  label: string;
  siteId: string;
  status: PondStatus;
  temperatureC: number;
  ph: number;
  biomassGPerL: number;
  lastSyncMinutes: number;
  note: string;
}

export interface Site {
  id: string;
  name: string;
  region: string;
  activePonds: number;
  biomassTonnes: number;
  creditsIssued: number;
}

export interface CreditBatch {
  id: string;
  siteId: string;
  tonnesCO2: number;
  pricePerTonneUsd: number;
  verificationHash: string;
  verifiedAt: string;
  status: "listed" | "held" | "retired";
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  walletAddress: string;
  kycStatus: "verified" | "pending" | "not_started";
  pondIds: string[];
  permissionKeys: string[];
}

export const SITES: Site[] = [
  { id: "SITE-01", name: "Kutch Coastal Array", region: "Gujarat, IN", activePonds: 12, biomassTonnes: 41.6, creditsIssued: 1840 },
  { id: "SITE-02", name: "Thoothukudi Basin", region: "Tamil Nadu, IN", activePonds: 8, biomassTonnes: 27.2, creditsIssued: 1130 },
];

export const PONDS: Pond[] = [
  { id: "PND-1041", label: "Pond 1", siteId: "SITE-01", status: "optimal", temperatureC: 28.4, ph: 7.9, biomassGPerL: 1.42, lastSyncMinutes: 2, note: "Growth on target" },
  { id: "PND-1042", label: "Pond 2", siteId: "SITE-01", status: "warning", temperatureC: 31.2, ph: 6.4, biomassGPerL: 0.98, lastSyncMinutes: 3, note: "Low pH warning" },
  { id: "PND-1043", label: "Pond 3", siteId: "SITE-01", status: "optimal", temperatureC: 27.8, ph: 8.1, biomassGPerL: 1.55, lastSyncMinutes: 1, note: "Growth on target" },
  { id: "PND-2007", label: "Pond 7", siteId: "SITE-02", status: "critical", temperatureC: 34.9, ph: 5.8, biomassGPerL: 0.51, lastSyncMinutes: 12, note: "Heat stress — flush advised" },
];

export const CREDIT_BATCHES: CreditBatch[] = [
  { id: "BATCH-0091", siteId: "SITE-01", tonnesCO2: 120, pricePerTonneUsd: 31.5, verificationHash: "0x7ac1…9f42", verifiedAt: "2026-08-28", status: "listed" },
  { id: "BATCH-0092", siteId: "SITE-02", tonnesCO2: 85, pricePerTonneUsd: 29.9, verificationHash: "0x21be…c034", verifiedAt: "2026-09-02", status: "listed" },
  { id: "BATCH-0088", siteId: "SITE-01", tonnesCO2: 64, pricePerTonneUsd: 28.4, verificationHash: "0x9d70…41aa", verifiedAt: "2026-07-19", status: "held" },
];

export const USERS: AppUser[] = [
  {
    id: "USR-001",
    name: "Meera Patel",
    email: "meera@runtimezero.farm",
    role: "farmer",
    walletAddress: "0x4Ba2…81C9",
    kycStatus: "not_started",
    pondIds: ["PND-1041", "PND-1042", "PND-1043"],
    permissionKeys: ["pond.read", "pond.action", "batch.submit"],
  },
  {
    id: "USR-002",
    name: "Nordvik Capital",
    email: "desk@nordvik.capital",
    role: "investor",
    walletAddress: "0x88F1…2De4",
    kycStatus: "verified",
    pondIds: [],
    permissionKeys: ["site.read", "market.trade", "portfolio.read"],
  },
  {
    id: "USR-003",
    name: "Dr. A. Rao",
    email: "a.rao@lab.runtimezero.io",
    role: "researcher",
    walletAddress: "0x03Cd…7B10",
    kycStatus: "verified",
    pondIds: [],
    permissionKeys: ["telemetry.global", "sim.write", "fault.inject", "export.raw"],
  },
];

export const EARNED_CREDITS = { pending: 18.4, tokenized: 142.6 };

export const ROLE_META: Record<
  Role,
  { label: string; tagline: string; authMode: string; consolePath: string; selfServe: boolean }
> = {
  farmer: {
    label: "Farmer",
    tagline: "Field & operations console",
    authMode: "Passwordless — SMS OTP or email magic link",
    consolePath: "/console/farmer",
    selfServe: true,
  },
  investor: {
    label: "Investor",
    tagline: "Commercial assets & marketplace",
    authMode: "Corporate email, Google or LinkedIn + KYC",
    consolePath: "/console/investor",
    selfServe: true,
  },
  researcher: {
    label: "Researcher",
    tagline: "Simulation & science lab",
    authMode: "Invitation only — provisioned by an admin",
    consolePath: "/console/researcher",
    selfServe: false,
  },
};

export interface WeatherNow {
  temperatureC: number;
  windKph: number;
  windDirection: string;
  sunlightWm2: number;
  rainfallMm: number;
  humidityPct: number;
}

export const WEATHER_NOW: WeatherNow = {
  temperatureC: 33.6,
  windKph: 27,
  windDirection: "SW",
  sunlightWm2: 880,
  rainfallMm: 0,
  humidityPct: 61,
};

export interface ForecastHour {
  hour: string;
  temperatureC: number;
  windKph: number;
  sunlightWm2: number;
  rainChancePct: number;
  biomassGPerL: number;
}

/** Next 24 hours, 2-hour steps. */
export const FORECAST_24H: ForecastHour[] = [
  { hour: "Now", temperatureC: 33.6, windKph: 27, sunlightWm2: 880, rainChancePct: 5, biomassGPerL: 1.42 },
  { hour: "15:00", temperatureC: 35.1, windKph: 31, sunlightWm2: 910, rainChancePct: 5, biomassGPerL: 1.44 },
  { hour: "17:00", temperatureC: 36.4, windKph: 38, sunlightWm2: 720, rainChancePct: 10, biomassGPerL: 1.45 },
  { hour: "19:00", temperatureC: 33.2, windKph: 34, sunlightWm2: 240, rainChancePct: 20, biomassGPerL: 1.46 },
  { hour: "21:00", temperatureC: 30.1, windKph: 25, sunlightWm2: 0, rainChancePct: 35, biomassGPerL: 1.47 },
  { hour: "23:00", temperatureC: 28.4, windKph: 18, sunlightWm2: 0, rainChancePct: 45, biomassGPerL: 1.48 },
  { hour: "01:00", temperatureC: 27.2, windKph: 14, sunlightWm2: 0, rainChancePct: 30, biomassGPerL: 1.49 },
  { hour: "03:00", temperatureC: 26.5, windKph: 12, sunlightWm2: 0, rainChancePct: 15, biomassGPerL: 1.5 },
  { hour: "05:00", temperatureC: 26.1, windKph: 11, sunlightWm2: 60, rainChancePct: 10, biomassGPerL: 1.51 },
  { hour: "07:00", temperatureC: 27.8, windKph: 15, sunlightWm2: 320, rainChancePct: 5, biomassGPerL: 1.53 },
  { hour: "09:00", temperatureC: 30.3, windKph: 20, sunlightWm2: 640, rainChancePct: 5, biomassGPerL: 1.56 },
  { hour: "11:00", temperatureC: 32.7, windKph: 24, sunlightWm2: 850, rainChancePct: 5, biomassGPerL: 1.59 },
];

export interface FieldRisk {
  id: string;
  severity: PondStatus;
  title: string;
  detail: string;
  action: string;
  when: string;
}

export const FIELD_RISKS: FieldRisk[] = [
  {
    id: "RSK-1",
    severity: "critical",
    title: "Heat stress likely by 17:00",
    detail: "Water temperature is heading to 36°C in Pond 2 — growth stops above 35°C.",
    action: "Run flush sequence before 16:00",
    when: "In about 3 hours",
  },
  {
    id: "RSK-2",
    severity: "warning",
    title: "Strong wind building",
    detail: "Gusts up to 38 km/h from the south-west can push surface foam and spill.",
    action: "Lower paddle speed, check pond covers",
    when: "16:00 – 20:00",
  },
  {
    id: "RSK-3",
    severity: "optimal",
    title: "Good growing night ahead",
    detail: "Cooler night and low wind — biomass should climb to 1.51 g/L by sunrise.",
    action: "No action needed",
    when: "Tonight",
  },
];

export const GROWTH_OUTLOOK = {
  biomassNowGPerL: 1.42,
  biomassIn7DaysGPerL: 1.94,
  creditsThisWeek: 6.2,
  creditsNextWeek: 7.8,
  confidencePct: 86,
  week: [
    { day: "Mon", biomassGPerL: 1.42, credits: 0.8 },
    { day: "Tue", biomassGPerL: 1.51, credits: 0.9 },
    { day: "Wed", biomassGPerL: 1.58, credits: 0.9 },
    { day: "Thu", biomassGPerL: 1.66, credits: 1.0 },
    { day: "Fri", biomassGPerL: 1.75, credits: 1.1 },
    { day: "Sat", biomassGPerL: 1.85, credits: 1.2 },
    { day: "Sun", biomassGPerL: 1.94, credits: 1.3 },
  ],
};

/** Colour band helpers: green -> amber -> red as a reading gets worse. */
export function bandFor(value: number, warn: number, critical: number): PondStatus {
  if (value >= critical) return "critical";
  if (value >= warn) return "warning";
  return "optimal";
}

export function statusToken(status: PondStatus) {
  return status === "optimal"
    ? { text: "Optimal", color: "bg-status-optimal" }
    : status === "warning"
      ? { text: "Warning", color: "bg-status-warning" }
      : { text: "Critical", color: "bg-status-critical" };
}
