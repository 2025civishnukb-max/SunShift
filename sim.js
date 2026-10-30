const HOURS = Array.from({ length: 15 }, (_, i) => i + 6);
const LOAD = [0.48, 0.54, 0.86, 0.79, 0.62, 0.51, 0.52, 0.65, 0.63, 0.58, 0.66, 0.82, 1.18, 1.38, 1.08];

export const DEFAULTS = { solarKw: 5.2, batteryKwh: 6, tariff: 8, reserve: 20, batteryStart: 0.42, panelTilt: 20, panelAzimuth: 0 };

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

export function formatTime(hour) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:00 ${suffix}`;
}
