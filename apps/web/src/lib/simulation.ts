export interface SimInputs { areaM2: number; depthM: number; days: number; latDeg: number; }
export interface SimResult {
  daily: { day: number; co2Kg: number; opticalDensity: number; temperatureC: number }[];
  totals: { co2Kg: number; harvestedDryKg: number; ceilingCo2Kg: number; ceilingUtilisation: number; yieldGPerM2PerDay: number; };
  economics: { energyCostInr: number; labourCostInr: number; harvestCostInr: number;
    totalCostInr: number; biomassRevenueInr: number; creditRevenueInr: number; netInr: number;
    assumptions: Record<string, number>; note: string; };
}
export const PRESETS = [
  { name: 'Small garden pond', size: '400 m²', areaM2: 400, depthM: 0.22, latDeg: 21.76 },
  { name: 'Dairy farm pond', size: '1,200 m²', areaM2: 1200, depthM: 0.25, latDeg: 22.56 },
  { name: 'Industrial pond', size: '8,000 m²', areaM2: 8000, depthM: 0.3, latDeg: 21.17 },
  { name: 'Large algae farm', size: '33,000 m²', areaM2: 33000, depthM: 0.3, latDeg: 23.07 },
];
