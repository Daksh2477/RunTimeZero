declare module '*rtz_physics.js' {
  export function physics_ceiling_co2_kg(lat: number, area: number, depth: number, day: number, days: number, temp: number): number;
  export function version(): string;
  export function co2_from_biomass(kg: number): number;
  export interface Reading { ph: number; dissolved_oxygen_mg_l: number; temperature_c: number;
    optical_density: number; reported_co2_kg: number; hour: number; day_of_year: number; free(): void; }
  export class WasmPond {
    constructor(lat: number, area: number, depth: number, seed: bigint, day: number);
    step(): Reading;
    harvest(fraction: number): number;
    inject_overstatement(factor: number, start: number, duration: number): void;
    inject_crash(severity: number, start: number, duration: number): void;
    standing_biomass_kg(): number;
    ground_truth_co2_kg_offline_scoring_only(): number;
    free(): void;
  }
}
