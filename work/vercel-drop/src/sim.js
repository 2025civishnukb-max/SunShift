const HOURS = Array.from({ length: 15 }, (_, i) => i + 6);
const LOAD = [0.48, 0.54, 0.86, 0.79, 0.62, 0.51, 0.52, 0.65, 0.63, 0.58, 0.66, 0.82, 1.18, 1.38, 1.08];

export const DEFAULTS = { solarKw: 5.2, batteryKwh: 6, tariff: 8, reserve: 20, batteryStart: 0.42, panelTilt: 20, panelAzimuth: 0, location: 'Pune, Maharashtra', latitude: 18.5204, longitude: 73.8567 };

export function solarAt(hour, solarKw, sky = 'clear') {
  const cloudFactor = sky === 'cloudy' ? 0.53 : 1;
  const bell = Math.exp(-0.5 * ((hour - 12.8) / 2.6) ** 2);
  return solarKw * 0.51 * bell * cloudFactor;
}

export function simulate({ settings, sky = 'clear', outage = false, loadFactor = 1, applianceHour = null, applianceKwh = 0 }) {
  let battery = settings.batteryKwh * settings.batteryStart;
  let solarTotal = 0, loadTotal = 0, imported = 0, exported = 0, unserved = 0, shed = 0, directSolar = 0, batteryToHome = 0, curtailedTotal = 0;
  let batteryNow = battery;
  const rows = HOURS.map((hour, i) => {
    const solar = solarAt(hour, settings.solarKw, sky);
    const load = LOAD[i] * loadFactor + (hour === applianceHour ? applianceKwh : 0);
    solarTotal += solar;
    loadTotal += load;
    let grid = 0, charge = 0, discharge = 0, curtailed = 0;
    const essentialLoad = outage ? load * 0.65 : load;
    const usableSolar = Math.min(solar, outage ? essentialLoad : load);
    directSolar += usableSolar;
    const priorityLoad = outage ? essentialLoad : load;
    const net = solar - priorityLoad;
    if (net >= 0) {
      const chargeInput = Math.min(net, settings.batteryKwh * 0.5, Math.max(0, settings.batteryKwh - battery) / 0.94);
      charge = chargeInput;
      battery += chargeInput * 0.94;
      const surplus = Math.max(0, net - chargeInput);
      if (outage) curtailed = surplus;
      else exported += surplus;
      curtailed = Math.max(0, net - chargeInput);
      curtailedTotal += curtailed;
    } else {
      const needed = Math.max(0, priorityLoad - solar);
      const available = Math.max(0, battery - settings.batteryKwh * settings.reserve / 100);
      discharge = Math.min(needed, settings.batteryKwh * 0.5, available * 0.92);
      battery -= discharge / 0.92;
      batteryToHome += discharge;
      grid = outage ? 0 : needed - discharge;
      if (outage) { unserved += Math.max(0, needed - discharge); shed += Math.max(0, load - essentialLoad); }
      imported += grid;
    }
    if (hour === 13) batteryNow = battery;
    return { hour, solar, load, grid, charge, discharge, curtailed, battery: battery / settings.batteryKwh * 100 };
  });
  const selfUse = directSolar + batteryToHome;
  const savings = selfUse * settings.tariff;
  const confidence = sky === 'cloudy' ? 46 : 78;
  const selfSufficiency = loadTotal ? Math.min(100, selfUse / loadTotal * 100) : 0;
  const solarUtilization = solarTotal ? Math.min(100, (solarTotal - exported - curtailedTotal) / solarTotal * 100) : 0;
  return { rows, solarTotal, loadTotal, imported, exported, unserved, shed, savings, co2: selfUse * 0.227, batteryNow, batteryEnd: battery, selfUse, selfSufficiency, solarUtilization, confidence };
}

export function bestApplianceTimes({ settings, sky, applianceKwh, preferredHour }) {
  return HOURS.filter(h => h >= 8 && h <= 17).map(hour => {
    const solar = solarAt(hour, settings.solarKw, sky);
    const load = LOAD[hour - 6];
    const surplus = Math.max(0, solar - load);
    const solarCovered = Math.min(1, surplus / Math.max(0.1, applianceKwh));
    const comfortPenalty = Math.abs(hour - preferredHour) * 0.035;
    const score = solarCovered - comfortPenalty;
    return { hour, solarCovered, savings: applianceKwh * solarCovered * settings.tariff, score };
  }).sort((a, b) => b.score - a.score).slice(0, 3);
}

const NIGHT_LOAD = [0.38, 0.34, 0.32, 0.31, 0.34, 0.4];
const EVENING_LOAD = [0.92, 0.74, 0.58];
const APPLIANCE_KWH = { 'Washing machine': 0.8, Dishwasher: 1.2, 'Water heater': 2, 'EV charger': 7 };

function parseHour(value) {
  const match = /^(\d{1,2}):\d{2}\s*(AM|PM)$/i.exec(value || '');
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[2].toUpperCase() === 'PM') hour += 12;
  return hour;
}

function homeDemand(hour, temperature, loadFactor) {
  let base;
  if (hour < 6) base = NIGHT_LOAD[hour];
  else if (hour <= 20) base = LOAD[hour - 6];
  else base = EVENING_LOAD[hour - 21];
  const cooling = Math.max(0, (Number(temperature) || 26) - 28) * 0.035;
  return (base + cooling) * loadFactor;
}

export function simulateForecastDay(day, settings, schedule = [], loadFactor = 1) {
  let battery = settings.batteryKwh * settings.batteryStart;
  let solarTotal = 0, loadTotal = 0, imported = 0, exported = 0, directSolar = 0, batteryToHome = 0;
  const appliances = schedule.map(item => ({
    name: item.name,
    hour: parseHour(item.time),
    kwh: Number(item.kwh) || APPLIANCE_KWH[item.name] || 1
  })).filter(item => item.hour != null);
  const rows = Array.from({ length: 24 }, (_, hour) => {
    const weatherHour = day.hours.find(item => Number(item.time.slice(0, 2)) === hour);
    const solar = weatherHour?.powerKw || 0;
    const applianceLoad = appliances.filter(item => item.hour === hour).reduce((sum, item) => sum + item.kwh, 0);
    const load = homeDemand(hour, weatherHour?.temperature, loadFactor) + applianceLoad;
    solarTotal += solar;
    loadTotal += load;
    directSolar += Math.min(solar, load);
    let grid = 0, charge = 0, discharge = 0;
    const net = solar - load;
    if (net >= 0) {
      charge = Math.min(net, settings.batteryKwh * 0.5, Math.max(0, settings.batteryKwh - battery) / 0.94);
      battery += charge * 0.94;
      exported += Math.max(0, net - charge);
    } else {
      const needed = -net;
      const available = Math.max(0, battery - settings.batteryKwh * settings.reserve / 100);
      discharge = Math.min(needed, settings.batteryKwh * 0.5, available * 0.92);
      battery -= discharge / 0.92;
      batteryToHome += discharge;
      grid = needed - discharge;
      imported += grid;
    }
    return { hour, solar, load, grid, charge, discharge, batteryPct: battery / settings.batteryKwh * 100, temperature: weatherHour?.temperature ?? null, rainChance: weatherHour?.rainChance ?? null };
  });
  const servedBySolar = directSolar + batteryToHome;
  const savings = servedBySolar * settings.tariff;
  const bestSurplusHour = rows.reduce((best, row) => row.solar - row.load > best.solar - best.load ? row : best, rows[0]);
  return {
    date: day.date,
    rows,
    solarTotal,
    loadTotal,
    imported,
    exported,
    savings,
    projectedGridCost: imported * settings.tariff,
    selfSufficiency: loadTotal ? Math.min(100, servedBySolar / loadTotal * 100) : 0,
    batteryEnd: battery,
    batteryEndPct: battery / settings.batteryKwh * 100,
    co2Avoided: servedBySolar * 0.227,
    bestSurplusHour: bestSurplusHour.hour,
    scheduledAppliances: appliances
  };
}

export function formatTime(hour) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:00 ${suffix}`;
}
