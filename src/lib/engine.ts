import type { City, DayForecast, DispatchResult, MonthGeneration, Settings, WeatherKind } from './types';

/**
 * Pure planning engine for SunShift India.
 * Ported from the SunShift Node engine (src/sim.js) so the dashboard can later be
 * connected to the real energy engine / Supabase without changing the UI layer.
 * All numbers are modelled estimates, not measured data.
 */

export const DAY_HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 6:00 – 20:00
export const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

const LOAD = [0.48, 0.54, 0.86, 0.79, 0.62, 0.51, 0.52, 0.65, 0.63, 0.58, 0.66, 0.82, 1.18, 1.38, 1.08];
const NIGHT_LOAD = [0.38, 0.34, 0.32, 0.31, 0.34, 0.4];
const EVENING_LOAD = [0.92, 0.74, 0.58];
export const CO2_PER_KWH = 0.227; // kg CO2 avoided per kWh of grid energy displaced (India grid average factor used by the engine)

export const DEFAULT_SETTINGS: Settings = {
  solarKw: 5.2,
  batteryKwh: 6,
  tariff: 8,
  reserve: 20,
  batteryStart: 0.42,
  panelTilt: 20,
  panelAzimuth: 0,
  location: 'Pune, Maharashtra',
  latitude: 18.5204,
  longitude: 73.8567,
};

export const CITIES: City[] = [
  { name: 'Pune, Maharashtra', state: 'Maharashtra', latitude: 18.5204, longitude: 73.8567, yieldPerKwp: 1500 },
  { name: 'Mumbai, Maharashtra', state: 'Maharashtra', latitude: 19.076, longitude: 72.8777, yieldPerKwp: 1400 },
  { name: 'Delhi, NCR', state: 'Delhi', latitude: 28.6139, longitude: 77.209, yieldPerKwp: 1450 },
  { name: 'Bengaluru, Karnataka', state: 'Karnataka', latitude: 12.9716, longitude: 77.5946, yieldPerKwp: 1450 },
  { name: 'Hyderabad, Telangana', state: 'Telangana', latitude: 17.385, longitude: 78.4867, yieldPerKwp: 1500 },
  { name: 'Chennai, Tamil Nadu', state: 'Tamil Nadu', latitude: 13.0827, longitude: 80.2707, yieldPerKwp: 1450 },
  { name: 'Kolkata, West Bengal', state: 'West Bengal', latitude: 22.5726, longitude: 88.3639, yieldPerKwp: 1350 },
];

export function cityByName(name: string): City {
  return CITIES.find((c) => c.name === name) ?? CITIES[0];
}

export function solarAt(hour: number, solarKw: number, sky: 'clear' | 'cloudy' = 'clear'): number {
  const cloudFactor = sky === 'cloudy' ? 0.53 : 1;
  const bell = Math.exp(-0.5 * ((hour - 12.8) / 2.6) ** 2);
  return solarKw * 0.51 * bell * cloudFactor;
}

function homeDemand(hour: number, temperature: number | null, loadFactor: number): number {
  let base: number;
  if (hour < 6) base = NIGHT_LOAD[hour];
  else if (hour <= 20) base = LOAD[hour - 6];
  else base = EVENING_LOAD[hour - 21];
  const cooling = Math.max(0, (Number(temperature) || 26) - 28) * 0.035;
  return (base + cooling) * loadFactor;
}

export interface ScenarioInput {
  settings: Settings;
  sky?: 'clear' | 'cloudy';
  outage?: boolean;
  loadFactor?: number;
}

/** Core hourly dispatch model — same priorities as the Node engine. */
export function simulate({ settings, sky = 'clear', outage = false, loadFactor = 1 }: ScenarioInput): DispatchResult {
  let battery = settings.batteryKwh * settings.batteryStart;
  let solarTotal = 0;
  let loadTotal = 0;
  let imported = 0;
  let exported = 0;
  let unserved = 0;
  let shed = 0;
  let directSolar = 0;
  let batteryToHome = 0;
  let curtailedTotal = 0;
  let batteryNow = battery;

  const rows = DAY_HOURS.map((hour) => {
    const solar = solarAt(hour, settings.solarKw, sky);
    const load = LOAD[hour - 6] * loadFactor;
    solarTotal += solar;
    loadTotal += load;

    let grid = 0;
    let charge = 0;
    let discharge = 0;
    const essentialLoad = outage ? load * 0.65 : load;
    const priorityLoad = outage ? essentialLoad : load;
    directSolar += Math.min(solar, priorityLoad);
    const net = solar - priorityLoad;
    if (net >= 0) {
      const chargeInput = Math.min(net, settings.batteryKwh * 0.5, Math.max(0, settings.batteryKwh - battery) / 0.94);
      charge = chargeInput;
      battery += chargeInput * 0.94;
      const surplus = Math.max(0, net - chargeInput);
      if (outage) curtailedTotal += surplus;
      else exported += surplus;
    } else {
      const needed = Math.max(0, priorityLoad - solar);
      const available = Math.max(0, battery - (settings.batteryKwh * settings.reserve) / 100);
      discharge = Math.min(needed, settings.batteryKwh * 0.5, available * 0.92);
      battery -= discharge / 0.92;
      batteryToHome += discharge;
      grid = outage ? 0 : needed - discharge;
      if (outage) {
        unserved += Math.max(0, needed - discharge);
        shed += Math.max(0, load - essentialLoad);
      }
      imported += grid;
    }
    if (hour === 13) batteryNow = battery;
    return { hour, solar, load, grid, charge, discharge, batteryPct: (battery / settings.batteryKwh) * 100 };
  });

  const selfUse = directSolar + batteryToHome;
  const savings = selfUse * settings.tariff;
  const confidence = sky === 'cloudy' ? 46 : 78;
  const selfSufficiency = loadTotal ? Math.min(100, (selfUse / loadTotal) * 100) : 0;
  const solarUtilization = solarTotal ? Math.min(100, ((solarTotal - exported - curtailedTotal) / solarTotal) * 100) : 0;
  return {
    rows,
    solarTotal,
    loadTotal,
    imported,
    exported,
    unserved,
    shed,
    savings,
    co2: selfUse * CO2_PER_KWH,
    batteryNow,
    batteryEnd: battery,
    selfSufficiency,
    solarUtilization,
    confidence,
  };
}

/** 24-hour demand + dispatch for a forecast day (used by Day-ahead plan). */
export function simulateForecastDay(day: DayForecast, settings: Settings, schedule: { hour: number; kwh: number }[] = [], loadFactor = 1) {
  let battery = settings.batteryKwh * settings.batteryStart;
  let solarTotal = 0;
  let loadTotal = 0;
  let imported = 0;
  let exported = 0;
  let directSolar = 0;
  let batteryToHome = 0;

  const rows = ALL_HOURS.map((hour) => {
    const weatherHour = day.hours.find((h) => h.hour === hour);
    const solar = weatherHour?.powerKw ?? 0;
    const applianceLoad = schedule.filter((a) => a.hour === hour).reduce((sum, a) => sum + a.kwh, 0);
    const load = homeDemand(hour, weatherHour?.temperature ?? null, loadFactor) + applianceLoad;
    solarTotal += solar;
    loadTotal += load;
    directSolar += Math.min(solar, load);
    let grid = 0;
    let charge = 0;
    let discharge = 0;
    const net = solar - load;
    if (net >= 0) {
      charge = Math.min(net, settings.batteryKwh * 0.5, Math.max(0, settings.batteryKwh - battery) / 0.94);
      battery += charge * 0.94;
      exported += Math.max(0, net - charge);
    } else {
      const needed = -net;
      const available = Math.max(0, battery - (settings.batteryKwh * settings.reserve) / 100);
      discharge = Math.min(needed, settings.batteryKwh * 0.5, available * 0.92);
      battery -= discharge / 0.92;
      batteryToHome += discharge;
      grid = needed - discharge;
      imported += grid;
    }
    return { hour, solar, load, grid, charge, discharge, batteryPct: (battery / settings.batteryKwh) * 100 };
  });

  const servedBySolar = directSolar + batteryToHome;
  const bestSurplusHour = rows.reduce((best, row) => (row.solar - row.load > best.solar - best.load ? row : best), rows[0]);
  return {
    date: day.date,
    rows,
    solarTotal,
    loadTotal,
    imported,
    exported,
    savings: servedBySolar * settings.tariff,
    projectedGridCost: imported * settings.tariff,
    selfSufficiency: loadTotal ? Math.min(100, (servedBySolar / loadTotal) * 100) : 0,
    batteryEnd: battery,
    batteryEndPct: (battery / settings.batteryKwh) * 100,
    co2Avoided: servedBySolar * CO2_PER_KWH,
    bestSurplusHour: bestSurplusHour.hour,
  };
}

/** Best sunny start windows for an appliance run. */
export function bestApplianceTimes({ settings, sky = 'clear', applianceKwh, preferredHour = 13 }: {
  settings: Settings;
  sky?: 'clear' | 'cloudy';
  applianceKwh: number;
  preferredHour?: number;
}) {
  return DAY_HOURS.filter((h) => h >= 8 && h <= 17)
    .map((hour) => {
      const solar = solarAt(hour, settings.solarKw, sky);
      const load = LOAD[hour - 6];
      const surplus = Math.max(0, solar - load);
      const solarCovered = Math.min(1, surplus / Math.max(0.1, applianceKwh));
      const comfortPenalty = Math.abs(hour - preferredHour) * 0.035;
      const score = solarCovered - comfortPenalty;
      return { hour, solarCovered, savings: applianceKwh * solarCovered * settings.tariff, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/* ------------------------------------------------------------------ */
/* Monthly generation model (sample climatology for Indian cities)     */
/* ------------------------------------------------------------------ */

const MONTH_SEASON: { month: string; fullMonth: string; factor: number; weather: WeatherKind; rainDays: number }[] = [
  { month: 'Jan', fullMonth: 'January', factor: 0.88, weather: 'sunny', rainDays: 0 },
  { month: 'Feb', fullMonth: 'February', factor: 0.95, weather: 'sunny', rainDays: 0 },
  { month: 'Mar', fullMonth: 'March', factor: 1.04, weather: 'sunny', rainDays: 1 },
  { month: 'Apr', fullMonth: 'April', factor: 1.08, weather: 'sunny', rainDays: 1 },
  { month: 'May', fullMonth: 'May', factor: 1.05, weather: 'partly', rainDays: 2 },
  { month: 'Jun', fullMonth: 'June', factor: 0.74, weather: 'rain', rainDays: 12 },
  { month: 'Jul', fullMonth: 'July', factor: 0.63, weather: 'rain', rainDays: 17 },
  { month: 'Aug', fullMonth: 'August', factor: 0.66, weather: 'rain', rainDays: 14 },
  { month: 'Sep', fullMonth: 'September', factor: 0.78, weather: 'rain', rainDays: 9 },
  { month: 'Oct', fullMonth: 'October', factor: 0.92, weather: 'partly', rainDays: 3 },
  { month: 'Nov', fullMonth: 'November', factor: 0.94, weather: 'sunny', rainDays: 1 },
  { month: 'Dec', fullMonth: 'December', factor: 0.87, weather: 'sunny', rainDays: 0 },
];

const AVERAGE_DAY_FACTOR = MONTH_SEASON.reduce((s, m) => s + m.factor, 0) / 12;

/** Deterministic pseudo-random in [0,1) from a string seed. */
function seeded(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/** Monthly generation estimate for the configured system, per month of the current year. */
export function monthlyGeneration(settings: Settings, year = new Date().getFullYear()): MonthGeneration[] {
  const city = cityByName(settings.location);
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return MONTH_SEASON.map((m, i) => {
    const dailyKwh = ((settings.solarKw * city.yieldPerKwp) / 365) * (m.factor / AVERAGE_DAY_FACTOR);
    const wobble = 0.97 + seeded(`${year}-${m.month}-${settings.solarKw}`) * 0.06;
    return {
      month: m.month,
      fullMonth: m.fullMonth,
      kwh: Math.round(dailyKwh * daysInMonth[i] * wobble),
      weather: m.weather,
      rainDays: m.rainDays,
    };
  });
}

/** Estimated generation for one date (used by weekly chart + forecast). */
export function generationForDate(settings: Settings, date: Date): number {
  const city = cityByName(settings.location);
  const m = MONTH_SEASON[date.getMonth()];
  const dailyKwh = ((settings.solarKw * city.yieldPerKwp) / 365) * (m.factor / AVERAGE_DAY_FACTOR);
  const wobble = 0.86 + seeded(date.toISOString().slice(0, 10)) * 0.28;
  return Math.round(dailyKwh * wobble * 10) / 10;
}

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  sunny: 'Sunny',
  partly: 'Partly cloudy',
  cloudy: 'Cloudy',
  rain: 'Rain showers',
};

export function weatherForDate(date: Date): { weather: WeatherKind; rainChance: number; tempHigh: number; tempLow: number } {
  const seed = seeded(`wx-${date.toISOString().slice(0, 10)}`);
  const m = MONTH_SEASON[date.getMonth()];
  const weather: WeatherKind =
    seed < 0.55 ? 'sunny' : seed < 0.75 ? 'partly' : m.weather === 'rain' ? (seed < 0.9 ? 'rain' : 'cloudy') : seed < 0.9 ? 'cloudy' : 'partly';
  const rainChance = weather === 'sunny' ? Math.round(seed * 12) : weather === 'partly' ? 18 + Math.round(seed * 22) : weather === 'cloudy' ? 40 + Math.round(seed * 25) : 62 + Math.round(seed * 30);
  const monsoonBoost = m.weather === 'rain' ? 3 : 0;
  return {
    weather,
    rainChance,
    tempHigh: 30 + Math.round(seed * 5) + (m.weather === 'rain' ? -4 : 0) + monsoonBoost,
    tempLow: 20 + Math.round(seed * 3),
  };
}

export function forecastHours(settings: Settings, weather: WeatherKind): { hour: number; powerKw: number; temperature: number }[] {
  const cloudFactor = weather === 'sunny' ? 1 : weather === 'partly' ? 0.82 : weather === 'cloudy' ? 0.58 : 0.42;
  return ALL_HOURS.map((hour) => ({
    hour,
    powerKw: hour < 6 || hour > 19 ? 0 : solarAt(hour, settings.solarKw) * cloudFactor,
    temperature: 24 + Math.round(6 * Math.exp(-0.5 * ((hour - 14) / 3.4) ** 2)),
  }));
}

/** Seven-day sample forecast (clearly labelled as modelled, not live). */
export function makeForecast(settings: Settings, startDate = new Date()): DayForecast[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    const iso = date.toISOString().slice(0, 10);
    const wx = weatherForDate(date);
    const wobble = 0.88 + seeded(`fc-${iso}-${settings.solarKw}`) * 0.24; // day-to-day variance
    const hours = forecastHours(settings, wx.weather).map((h) => ({
      ...h,
      powerKw: Math.round(h.powerKw * wobble * 100) / 100,
    }));
    const productionKwh = hours.reduce((s, h) => s + h.powerKw, 0);
    return {
      date: iso,
      label: date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      weather: wx.weather,
      condition: WEATHER_LABEL[wx.weather],
      tempHigh: wx.tempHigh,
      tempLow: wx.tempLow,
      rainChance: wx.rainChance,
      productionKwh: Math.round(productionKwh * 10) / 10,
      peakKw: Math.max(...hours.map((h) => h.powerKw)),
      sunrise: '6:24 AM',
      sunset: '6:03 PM',
      hours,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Rooftop estimator & solar calculator maths                          */
/* ------------------------------------------------------------------ */

export const PANEL_WATTS = [390, 440, 545, 575] as const;
/** Roof area per kWp for standard tilted panels (m²). */
export const AREA_PER_KWP = 8.5;
/** Typical installed cost per kWp in India before subsidy (₹). */
export const COST_PER_KWP = 55000;

/** PM Surya Ghar style central financial assistance (modelled). */
export function subsidyFor(kw: number): number {
  if (kw <= 0) return 0;
  if (kw <= 2) return Math.round(kw * 30000);
  if (kw <= 3) return 60000 + Math.round((kw - 2) * 18000);
  return 78000;
}

export interface RoofEstimate {
  panels: number;
  capacityKw: number;
  yearlyKwh: number;
  monthlyAvgKwh: number;
  yearlySavings: number;
  co2Tonnes: number;
  estimatedCost: number;
  subsidy: number;
  netCost: number;
  paybackYears: number;
}

export function estimateRoof(opts: { areaSqm: number; panelWatt: number; shading: number; tilt: number; city: string; tariff: number }): RoofEstimate {
  const { areaSqm, panelWatt, shading, tilt, city, tariff } = opts;
  const cityYield = cityByName(city).yieldPerKwp;
  const rawCapacity = areaSqm / AREA_PER_KWP;
  const capacityKw = Math.max(0, Math.round((rawCapacity * (panelWatt / 500)) * 100) / 100);
  const tiltFactor = 1 - Math.min(0.12, Math.abs(tilt - 18) / 200);
  const orientationFactor = 1; // azimuth captured separately in advanced mode; planning default south-facing
  const shadingFactor = 1 - shading / 100;
  const yearlyKwh = Math.round(capacityKw * cityYield * tiltFactor * shadingFactor * orientationFactor);
  const yearlySavings = Math.round(yearlyKwh * tariff);
  const estimatedCost = Math.round(capacityKw * COST_PER_KWP);
  const subsidy = subsidyFor(capacityKw);
  const netCost = estimatedCost - subsidy;
  const paybackYears = yearlySavings > 0 ? Math.round((netCost / yearlySavings) * 10) / 10 : 0;
  return {
    panels: Math.max(0, Math.floor(areaSqm / (AREA_PER_KWP * (500 / panelWatt)))),
    capacityKw,
    yearlyKwh,
    monthlyAvgKwh: Math.round(yearlyKwh / 12),
    yearlySavings,
    co2Tonnes: Math.round(((yearlyKwh * CO2_PER_KWH) / 1000) * 10) / 10,
    estimatedCost,
    subsidy,
    netCost,
    paybackYears,
  };
}

export interface CalcResult {
  suggestedKw: number;
  yearlyKwh: number;
  yearlySavings: number;
  monthlySavings: number;
  estimatedCost: number;
  subsidy: number;
  netCost: number;
  paybackYears: number;
  billOffsetPct: number;
  co2Tonnes25: number;
  lifetime: { year: number; savings: number; cumulative: number }[];
}

export function calculateSavings(opts: { monthlyBill: number; tariff: number; targetOffsetPct: number; city: string; degradation?: boolean }): CalcResult {
  const { monthlyBill, tariff, targetOffsetPct, city } = opts;
  const cityYield = cityByName(city).yieldPerKwp;
  const monthlyUnits = tariff > 0 ? monthlyBill / tariff : 0;
  const dailyUnits = monthlyUnits / 30;
  const dailyKwhPerKw = cityYield / 365;
  const suggestedKw = Math.max(0, Math.round(((dailyUnits * targetOffsetPct) / 100 / dailyKwhPerKw) * 10) / 10);
  const yearlyKwh = Math.round(suggestedKw * cityYield);
  const yearlySavings = Math.round(yearlyKwh * tariff);
  const monthlySavings = Math.round(yearlySavings / 12);
  const estimatedCost = Math.round(suggestedKw * COST_PER_KWP);
  const subsidy = subsidyFor(suggestedKw);
  const netCost = estimatedCost - subsidy;
  const paybackYears = yearlySavings > 0 ? Math.round((netCost / yearlySavings) * 10) / 10 : 0;
  const billOffsetPct = monthlyBill > 0 ? Math.min(100, Math.round((monthlySavings / monthlyBill) * 100)) : 0;
  let cumulative = 0;
  const lifetime = Array.from({ length: 25 }, (_, i) => {
    const year = new Date().getFullYear() + i + 1;
    const degradation = Math.pow(0.995, i); // 0.5% yearly panel degradation
    const savings = Math.round(yearlySavings * degradation);
    cumulative += savings;
    return { year, savings, cumulative };
  });
  return {
    suggestedKw,
    yearlyKwh,
    yearlySavings,
    monthlySavings,
    estimatedCost,
    subsidy,
    netCost,
    paybackYears,
    billOffsetPct,
    co2Tonnes25: Math.round(((yearlyKwh * 25 * 0.9 * CO2_PER_KWH) / 1000) * 10) / 10,
    lifetime,
  };
}

export function formatTime(hour: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:00 ${suffix}`;
}
