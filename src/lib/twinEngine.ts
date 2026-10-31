import { CO2_PER_KWH, solarAt } from './engine';

/**
 * Deterministic simulation engine for the Energy Digital Twin page.
 * Isolated from the shared planning engine (lib/engine.ts) so existing pages stay
 * unaffected; it reuses the shared solar output curve and grid-emission factor.
 * Every figure produced here is a simulated estimate — no live sensor data.
 */

export type TwinWeather = 'sunny' | 'cloudy' | 'rain';
export type TwinDemand = 'low' | 'typical' | 'high';

export interface TwinConfig {
  /** Rated solar array size (kWp). */
  solarKw: number;
  /** Usable battery capacity (kWh). */
  batteryKwh: number;
  /** State of charge at the start of the simulated day (%). */
  batteryPct: number;
  /** Number of household occupants. */
  occupants: number;
  /** Modelled household consumption for the day (kWh). */
  dailyKwh: number;
  /** Solar generation efficiency / system derate (%). */
  efficiencyPct: number;
  /** Weather scenario for the simulated day. */
  weather: TwinWeather;
  /** Household demand scenario. */
  demand: TwinDemand;
}

export const TWIN_WEATHER: Record<TwinWeather, { label: string; factor: number }> = {
  sunny: { label: 'Sunny', factor: 1 },
  cloudy: { label: 'Cloudy', factor: 0.58 },
  rain: { label: 'Rainy', factor: 0.42 },
};

export const TWIN_DEMAND: Record<TwinDemand, { label: string; factor: number }> = {
  low: { label: 'Low', factor: 0.7 },
  typical: { label: 'Typical', factor: 1 },
  high: { label: 'High', factor: 1.35 },
};

/** Suggested daily consumption for a household size — each occupant adds ≈4 kWh. */
export function suggestedDailyKwh(occupants: number): number {
  return Math.round(occupants * 4);
}

export const TWIN_DEFAULTS: TwinConfig = {
  solarKw: 5.2,
  batteryKwh: 6,
  batteryPct: 42,
  occupants: 4,
  dailyKwh: suggestedDailyKwh(4),
  efficiencyPct: 90,
  weather: 'sunny',
  demand: 'typical',
};

/** 24-hour household load shape mirroring the shared engine profile, normalised to sum to 1. */
const RAW_PROFILE = [
  0.38, 0.34, 0.32, 0.31, 0.34, 0.4, // 00–05 overnight
  0.48, 0.54, 0.86, 0.79, 0.62, 0.51, 0.52, 0.65, 0.63, 0.58, 0.66, 0.82, 1.18, 1.38, 1.08, // 06–20 daytime
  0.92, 0.74, 0.58, // 21–23 evening
];
const PROFILE_SUM = RAW_PROFILE.reduce((sum, v) => sum + v, 0);
const LOAD_SHAPE = RAW_PROFILE.map((v) => v / PROFILE_SUM);

export interface TwinHourRow {
  hour: number;
  solarKw: number;
  loadKw: number;
  /** Grid import during the hour. */
  gridKw: number;
  /** Surplus solar exported to the grid. */
  exportKw: number;
  chargeKw: number;
  dischargeKw: number;
  /** Battery state of charge at the end of the hour (%). */
  batteryPct: number;
}

export interface TwinResult {
  rows: TwinHourRow[];
  solarKwh: number;
  demandKwh: number;
  chargedKwh: number;
  dischargedKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  directSolarKwh: number;
  selfSufficiencyPct: number;
  solarUtilisationPct: number;
  /** Cost of grid electricity imported (₹). */
  gridCost: number;
  /** CO₂ from grid imports (kg), using the shared grid-emission factor. */
  co2Kg: number;
  /** CO₂ avoided by solar serving the home (kg). */
  co2AvoidedKg: number;
  batteryEndPct: number;
  peakSolarKw: number;
  peakLoadKw: number;
  peakSolarHour: number;
  bestSurplusHour: number;
}

export interface TwinRunOpts {
  /** Grid tariff (₹ per kWh), taken from the saved settings. */
  tariff: number;
  /** Battery reserve floor (% of capacity), taken from the saved settings. */
  reserve: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Simulate one 24-hour day through the twin model.
 * Pure and deterministic: same inputs always produce the same outputs.
 * Dispatch priorities mirror the shared engine: serve load directly, charge the
 * battery (94% efficiency, C/2 max rate), export surplus, discharge before
 * importing (92% efficiency, reserve protected).
 */
export function simulateTwin(config: TwinConfig, opts: TwinRunOpts): TwinResult {
  const weatherFactor = TWIN_WEATHER[config.weather].factor;
  const demandFactor = TWIN_DEMAND[config.demand].factor;
  const capacity = Math.max(0.5, config.batteryKwh);
  const reserveKwh = (capacity * Math.min(100, Math.max(0, opts.reserve))) / 100;
  const startKwh = (capacity * Math.min(100, Math.max(0, config.batteryPct))) / 100;

  let stored = startKwh;
  let solarKwh = 0;
  let demandKwh = 0;
  let chargedKwh = 0;
  let dischargedKwh = 0;
  let gridImportKwh = 0;
  let gridExportKwh = 0;
  let directSolarKwh = 0;

  const rows: TwinHourRow[] = LOAD_SHAPE.map((share, hour) => {
    const solarKw =
      hour >= 6 && hour <= 19
        ? solarAt(hour, config.solarKw) * weatherFactor * (config.efficiencyPct / 100)
        : 0;
    const loadKw = share * config.dailyKwh * demandFactor;
    solarKwh += solarKw;
    demandKwh += loadKw;

    let gridKw = 0;
    let exportKw = 0;
    let chargeKw = 0;
    let dischargeKw = 0;
    const net = solarKw - loadKw;
    if (net >= 0) {
      directSolarKwh += Math.min(solarKw, loadKw);
      chargeKw = Math.min(net, capacity * 0.5, Math.max(0, capacity - stored) / 0.94);
      stored += chargeKw * 0.94;
      exportKw = Math.max(0, net - chargeKw);
      gridExportKwh += exportKw;
    } else {
      const needed = -net;
      const available = Math.max(0, stored - reserveKwh);
      dischargeKw = Math.min(needed, capacity * 0.5, available * 0.92);
      stored -= dischargeKw / 0.92;
      gridKw = needed - dischargeKw;
      gridImportKwh += gridKw;
      dischargedKwh += dischargeKw;
    }

    return {
      hour,
      solarKw: round3(solarKw),
      loadKw: round3(loadKw),
      gridKw: round3(gridKw),
      exportKw: round3(exportKw),
      chargeKw: round3(chargeKw),
      dischargeKw: round3(dischargeKw),
      batteryPct: Math.round((stored / capacity) * 1000) / 10,
    };
  });

  const servedBySolar = directSolarKwh + dischargedKwh;
  const peakSolar = rows.reduce((best, r) => (r.solarKw > best.solarKw ? r : best), rows[6]);
  const bestSurplus = rows.reduce((best, r) => (r.solarKw - r.loadKw > best.solarKw - best.loadKw ? r : best), rows[6]);

  return {
    rows,
    solarKwh: round1(solarKwh),
    demandKwh: round1(demandKwh),
    chargedKwh: round1(chargedKwh),
    dischargedKwh: round1(dischargedKwh),
    gridImportKwh: round1(gridImportKwh),
    gridExportKwh: round1(gridExportKwh),
    directSolarKwh: round1(directSolarKwh),
    selfSufficiencyPct: demandKwh > 0 ? Math.round(Math.min(100, (servedBySolar / demandKwh) * 100) * 10) / 10 : 0,
    solarUtilisationPct: solarKwh > 0 ? Math.round(Math.min(100, ((solarKwh - gridExportKwh) / solarKwh) * 100) * 10) / 10 : 0,
    gridCost: round1(gridImportKwh * opts.tariff),
    co2Kg: round1(gridImportKwh * CO2_PER_KWH),
    co2AvoidedKg: round1(servedBySolar * CO2_PER_KWH),
    batteryEndPct: rows[23].batteryPct,
    peakSolarKw: round3(peakSolar.solarKw),
    peakLoadKw: round3(rows.reduce((max, r) => Math.max(max, r.loadKw), 0)),
    peakSolarHour: peakSolar.hour,
    bestSurplusHour: bestSurplus.hour,
  };
}
