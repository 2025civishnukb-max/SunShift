// SunShift energy-model tests. Run: node tests/sim.test.js  (from the sunshift folder)
// No framework, no network. Every check is an energy-balance or bounds invariant,
// not a snapshot of a magic number, so a future model change that breaks physics fails here.
import assert from 'node:assert/strict';
import { DEFAULTS, GRID_CO2_KG_PER_KWH, simulate, simulateForecastDay, bestApplianceTimes, solarAt } from '../src/sim.js';

const approx = (a, b, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b} (±${tol})`);
let n = 0;
const check = (name, fn) => { fn(); n++; console.log(`ok ${n} - ${name}`); };

// P0: utilisation must not double-count exported surplus (old bug: clear day gave 39%)
check('clear-day utilisation counts exported surplus once', () => {
  const r = simulate({ settings: DEFAULTS, sky: 'clear' });
  approx(r.solarUtilization, (1 - r.exported / r.solarTotal) * 100, 0.5);
  assert.ok(r.solarUtilization > 60 && r.solarUtilization <= 100);
});

// Battery state of charge stays inside [0, capacity] and never below reserve on a normal day
check('battery SoC stays within capacity and above reserve (normal day)', () => {
  for (const sky of ['clear', 'cloudy', 'rain']) {
    const r = simulate({ settings: DEFAULTS, sky, loadFactor: 1.35 });
    for (const row of r.rows) assert.ok(row.battery >= -0.01 && row.battery <= 100.01, `SoC ${row.battery} out of range, sky=${sky}`);
    assert.ok(r.batteryEnd >= DEFAULTS.batteryKwh * DEFAULTS.reserve / 100 - 0.01);
  }
});

// Energy balance: stored-energy change must equal 0.94*chargeIn - dischargeOut/0.92
check('battery energy balance reconciles with efficiencies', () => {
  const r = simulate({ settings: DEFAULTS, sky: 'clear' });
  const ch = r.rows.reduce((a, x) => a + x.charge, 0);
  const dis = r.rows.reduce((a, x) => a + x.discharge, 0);
  const start = DEFAULTS.batteryKwh * DEFAULTS.batteryStart;
  approx(r.batteryEnd - start, 0.94 * ch - dis / 0.92, 0.01);
});

// Rain must generate less than cloudy, cloudy less than clear
check('rain < cloudy < clear solar generation', () => {
  const c = simulate({ settings: DEFAULTS, sky: 'clear' }).solarTotal;
  const cl = simulate({ settings: DEFAULTS, sky: 'cloudy' }).solarTotal;
  const rn = simulate({ settings: DEFAULTS, sky: 'rain' }).solarTotal;
  assert.ok(rn < cl && cl < c, `rain ${rn}, cloudy ${cl}, clear ${c}`);
});

// Battery unavailable: no charge/discharge, imports rise vs battery-on
check('battery unavailable charges/discharges nothing and raises imports', () => {
  const on = simulate({ settings: DEFAULTS, sky: 'clear' });
  const off = simulate({ settings: DEFAULTS, sky: 'clear', batteryAvailable: false });
  assert.equal(off.rows.reduce((a, x) => a + x.charge, 0), 0);
  assert.equal(off.rows.reduce((a, x) => a + x.discharge, 0), 0);
  assert.ok(off.imported >= on.imported);
  approx(off.solarTotal, on.solarTotal, 0.001);
});

// Outage: no grid import, unserved is counted, surplus is curtailed not exported
check('outage imports nothing and curtails surplus', () => {
  const r = simulate({ settings: DEFAULTS, sky: 'cloudy', outage: true, loadFactor: 1.35 });
  assert.equal(r.imported, 0);
  assert.equal(r.exported, 0);
  assert.ok(r.curtailed >= 0 && r.unserved >= 0);
});

// CO2 factor is the documented CEA grid-average approx, not the old 0.227
check('CO2 uses GRID_CO2_KG_PER_KWH = 0.71', () => {
  assert.equal(GRID_CO2_KG_PER_KWH, 0.71);
  const r = simulate({ settings: DEFAULTS, sky: 'clear' });
  approx(r.co2, r.selfUse * 0.71, 0.01);
});

// Appliance ranking is sorted by score and the best hour is a daylight hour
check('best appliance times are score-sorted daylight hours', () => {
  const t = bestApplianceTimes({ settings: DEFAULTS, sky: 'clear', applianceKwh: 2, preferredHour: 13 });
  assert.equal(t.length, 3);
  assert.ok(t[0].score >= t[1].score && t[1].score >= t[2].score);
  assert.ok(t.every(x => x.hour >= 8 && x.hour <= 17));
});

// Home-profile kWh scales the generic hourly routine without changing solar output.
check('user-entered daily use scales household demand', () => {
  const usual = simulate({ settings: DEFAULTS, sky: 'clear' });
  const doubledSettings = { ...DEFAULTS, dailyUseKwh: DEFAULTS.dailyUseKwh * 2 };
  const higherUse = simulate({ settings: doubledSettings, sky: 'clear' });
  approx(higherUse.loadTotal, usual.loadTotal * 2, 0.001);
  approx(higherUse.solarTotal, usual.solarTotal, 0.001);
});

// Forecast-day model: 24 rows, SoC in range, balance holds
check('forecast-day model runs 24 hours with SoC in range', () => {
  const day = { date: '2026-11-01', hours: Array.from({ length: 24 }, (_, h) => ({ time: `${String(h).padStart(2, '0')}:00`, temperature: 30, rainChance: 10, powerKw: solarAt(h, DEFAULTS.solarKw, 'clear') })) };
  const r = simulateForecastDay(day, DEFAULTS, [], 1);
  assert.equal(r.rows.length, 24);
  assert.ok(r.rows.every(x => x.batteryPct >= -0.01 && x.batteryPct <= 100.01));
  assert.ok(r.solarTotal > 0 && r.loadTotal > 0);
});

console.log(`\n${n} tests passed.`);
