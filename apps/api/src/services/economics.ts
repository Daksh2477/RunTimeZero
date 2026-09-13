/**
 * Operating rates shared by the simulator's economics and the finance ledger,
 * so a projection and a real-records P&L never disagree on the same assumption.
 */
export const RATES = {
  biofertiliserInrPerKg: 12,
  paddlewheelWPerM2: 0.5,
  tariffInrPerKwh: 8,
  creditInrPerTonne: 1500,
  labourInrPerDay: 400,
  burialInrPerKg: 2,
  // Harvesting and drying dominate real operating cost, and the method chosen
  // swings it by an order of magnitude. We use a mid-range figure and say so.
  harvestInrPerKg: 6,
};
