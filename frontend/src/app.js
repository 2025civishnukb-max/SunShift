import { DEFAULTS, simulate, simulateForecastDay, bestApplianceTimes, formatTime } from './sim.js';
import { fetchSolarForecast, weatherDescription, localDateLabel } from './weather.js';

function readLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
const legacySettings = readLocal('sunshift-settings', null);
const legacySchedule = readLocal('sunshift-schedule', []);
const settings = { ...DEFAULTS, ...(legacySettings || {}) };
let applianceSchedule = Array.isArray(legacySchedule) ? legacySchedule : [];
let savedRuns = readLocal('sunshift-runs', []);
let backendOnline = false;
let scenario = { sky: 'clear', outage: false, loadFactor: 1 };
let preferredHour = 13;
let latestResults = simulate({ settings, ...scenario });
let liveForecast = null;
let liveForecastAt = 0;
let activePlanDate = null;
const overlay = document.getElementById('view-overlay');
const dashboardPage = document.getElementById('dashboard-page');
const title = document.getElementById('overlay-title');
const copy = document.getElementById('overlay-copy');
const content = document.getElementById('overlay-content');
const toast = document.getElementById('toast');
const money = amount => `₹${Math.round(amount).toLocaleString('en-IN')}`;
const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
const localDateStamp = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
async function apiRequest(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}
function setServerStatus(online) {
  backendOnline = online;
  setText('server-status', online ? 'Connected · saved' : 'Local only');
}
const sectionCopy = {
  'live-flow': 'See how solar power is split between home use, the battery and the grid. Values use the selected sample scenario.',
  forecast: 'Use the latest weather forecast to estimate hourly solar power and total generation for the next seven days.',
  battery: 'The dispatch model charges from surplus solar and discharges above your reserve when the home needs energy.',
  appliances: 'Compare appliance start times against estimated solar surplus and your preferred window.',
  scenarios: 'Change weather and grid availability, then recalculate the sample energy dispatch.',
  savings: 'Estimated value of solar energy used directly or stored for later, using your sample electricity tariff.',
  history: 'Review the scenarios and weather-based plans you have saved, including the assumptions and estimated energy costs.',
  reports: 'Export hourly scenario dispatch or a CSV of the calculations you have saved in Run history.',
  'energy-plan': 'Turn the weather outlook into a practical day-ahead energy plan with predicted home demand, battery dispatch, grid imports and cost.',
  settings: 'Adjust your home location and panel settings. These values tune the solar forecast and are saved on this computer.'
};

function toastMsg(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastMsg.timer);
  toastMsg.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function updateDateHeader() {
  const now = new Date();
  const dateText = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  setText('page-date', dateText.toUpperCase().replace(',', ' ·'));
  setText('top-date', now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase());
}

async function hydrateServerState() {
  try {
    await apiRequest('/api/health');
    const remote = await apiRequest('/api/settings');
    if (remote.configured) Object.assign(settings, remote.settings);
    else {
      if (legacySettings) Object.assign(settings, legacySettings);
      const stored = await apiRequest('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
      Object.assign(settings, stored.settings);
    }
    const remoteSchedule = await apiRequest('/api/schedule');
    if (!remoteSchedule.items.length && applianceSchedule.length) {
      for (const item of applianceSchedule) {
        try { await apiRequest('/api/schedule', { method: 'POST', body: JSON.stringify({ name: item.name, time: item.time, kwh: Number(item.kwh) || applianceEnergy(item.name) }) }); } catch { /* ignore stale browser-only entries */ }
      }
      applianceSchedule = (await apiRequest('/api/schedule')).items;
    } else applianceSchedule = remoteSchedule.items;
    savedRuns = (await apiRequest('/api/runs?limit=100')).items;
    localStorage.setItem('sunshift-settings', JSON.stringify(settings));
    localStorage.setItem('sunshift-schedule', JSON.stringify(applianceSchedule));
    localStorage.setItem('sunshift-runs', JSON.stringify(savedRuns));
    setServerStatus(true);
  } catch {
    setServerStatus(false);
  }
  setText('home-location', settings.location);
  updateDashboard();
  refreshDashboardForecast();
  if (currentView === 'settings') renderView('settings');
  if (currentView === 'history') renderView('history');
}

function applianceEnergy(name) {
  return { 'Washing machine': 0.8, Dishwasher: 1.2, 'Water heater': 2, 'EV charger': 7 }[name] || 1;
}

async function persistRun(record) {
  try {
    const result = await apiRequest('/api/runs', { method: 'POST', body: JSON.stringify(record) });
    savedRuns.unshift(result.item);
    savedRuns = savedRuns.slice(0, 100);
    localStorage.setItem('sunshift-runs', JSON.stringify(savedRuns));
    return true;
  } catch {
    const item = { ...record, id: crypto.randomUUID(), timestamp: new Date().toISOString() };
    savedRuns.unshift(item);
    savedRuns = savedRuns.slice(0, 100);
    localStorage.setItem('sunshift-runs', JSON.stringify(savedRuns));
    return false;
  }
}

function updateChart(results) {
  const max = Math.max(3, ...results.rows.map(r => Math.max(r.solar, r.load, r.charge + r.discharge)));
  const y = value => 198 - value / max * 174;
  const points = selector => results.rows.map((r, i) => `${i ? 'L' : 'M'} ${(i / (results.rows.length - 1) * 760).toFixed(1)} ${y(selector(r)).toFixed(1)}`).join(' ');
  const solarPath = points(r => r.solar);
  const solar = document.getElementById('solar-line');
  const area = document.getElementById('solar-area');
  if (solar) solar.setAttribute('d', solarPath);
  if (area) area.setAttribute('d', `${solarPath} L760 200 L0 200Z`);
  const home = document.getElementById('home-line');
  const battery = document.getElementById('battery-line');
  if (home) home.setAttribute('d', points(r => r.load));
  if (battery) battery.setAttribute('d', points(r => Math.abs(r.charge - r.discharge)));
}

function updateDashboard(results = latestResults) {
  const solar = results.solarTotal;
  const load = results.loadTotal;
  const batteryPct = Math.round(results.batteryEndPct ?? (results.batteryNow / settings.batteryKwh * 100));
  setText('solar-total', solar.toFixed(1));
  setText('consumption-total', load.toFixed(1));
  setText('battery-level', batteryPct);
  setText('savings-total', Math.round(results.savings));
  setText('co2-avoided', `${(results.co2Avoided ?? results.co2).toFixed(1)} kg CO₂ avoided`);
  setText('battery-capacity-label', `${settings.batteryKwh.toFixed(1)} kWh capacity`);
  const progress = document.querySelector('.battery-progress span');
  if (progress) progress.style.width = `${batteryPct}%`;
  const current = results.rows.reduce((best, row) => row.solar > best.solar ? row : best, results.rows[0]);
  const home = current.load;
  const directSolar = Math.min(current.solar, home);
  const charging = current.charge;
  const exportPower = Math.max(0, current.solar - home - charging);
  setText('flow-solar', current.solar.toFixed(1));
  setText('flow-home', home.toFixed(1));
  setText('flow-battery', charging > 0 ? `+${charging.toFixed(1)}` : `−${(current.discharge || 0).toFixed(1)}`);
  setText('battery-flow-label', charging > 0 ? 'Charging' : 'Discharging');
  const gridPower = current.grid > 0 ? current.grid : exportPower;
  setText('flow-grid', gridPower.toFixed(1));
  setText('flow-grid-label', current.grid > 0 ? 'Grid import' : 'To the grid');
  setText('flow-period-label', `Peak solar · ${formatForecastHour(`${String(current.hour).padStart(2,'0')}:00`)}`);
  setText('solar-coverage', `${Math.round(Math.min(100, directSolar / Math.max(home, .1) * 100))}%`);
  setText('grid-import-total', results.imported.toFixed(1));
  setText('self-sufficiency-total', Math.round(results.selfSufficiency));
  setText('grid-export-total', results.exported.toFixed(1));
  updateChart(results);
}

function readScenario() {
  scenario.sky = content.querySelector('#sky-select')?.value || scenario.sky;
  scenario.outage = Boolean(content.querySelector('#outage-toggle')?.checked);
  scenario.loadFactor = Number(content.querySelector('#demand-select')?.value || scenario.loadFactor);
  latestResults = simulate({ settings, ...scenario });
  updateDashboard(latestResults);
}

function renderScenario() {
  content.innerHTML = `<div class="sim-controls">
    <label>Sky conditions <select id="sky-select"><option value="clear" ${scenario.sky === 'clear' ? 'selected' : ''}>Clear day</option><option value="cloudy" ${scenario.sky === 'cloudy' ? 'selected' : ''}>Cloudy day · reduced solar</option></select></label>
    <label>Household demand <select id="demand-select"><option value="1" ${scenario.loadFactor === 1 ? 'selected' : ''}>Typical day</option><option value="1.35" ${scenario.loadFactor > 1 ? 'selected' : ''}>High demand · +35%</option></select></label>
    <label class="check-label">Grid outage <input class="scenario-toggle" id="outage-toggle" type="checkbox" ${scenario.outage ? 'checked' : ''}><span>Prioritize essential loads and battery reserve</span></label>
    <button id="run-scenario">Recalculate dispatch</button>
  </div><div class="simulation-results" id="scenario-result"></div>`;
  content.querySelector('#run-scenario').onclick = async () => {
    readScenario();
    renderScenarioSummary();
    const saved = await persistRun({ type: 'scenario', title: `${scenario.sky === 'cloudy' ? 'Cloudy' : 'Clear'} day · ${scenario.outage ? 'grid outage' : 'grid available'}`, date: localDateStamp(), sky: scenario.sky, outage: scenario.outage, loadFactor: scenario.loadFactor, location: settings.location, solarKwh: latestResults.solarTotal, homeKwh: latestResults.loadTotal, gridImportKwh: latestResults.imported, estimatedCost: latestResults.imported * settings.tariff, batteryPct: Math.round(latestResults.batteryNow / settings.batteryKwh * 100) });
    toastMsg(saved ? 'Dispatch saved to run history.' : 'Dispatch saved in this browser; server unavailable.');
  };
  renderScenarioSummary();
}

function renderScenarioSummary() {
  const result = content.querySelector('#scenario-result');
  if (!result) return;
  const outageCopy = scenario.outage ? `Grid unavailable. Estimated essential load not served: ${latestResults.unserved.toFixed(1)} kWh; flexible load shed: ${latestResults.shed.toFixed(1)} kWh.` : `Estimated grid imports: ${latestResults.imported.toFixed(1)} kWh. Solar self-sufficiency: ${Math.round(latestResults.selfSufficiency)}%.`;
  const baseline = simulate({ settings, sky: 'clear', outage: false, loadFactor: 1 });
  const savedValue = latestResults.savings - baseline.savings;
  const delta = `${savedValue >= 0 ? '+' : '−'}${money(Math.abs(savedValue))} estimated value versus a typical clear day`;
  result.innerHTML = `<div class="result-grid"><div><small>Solar generated</small><b>${latestResults.solarTotal.toFixed(1)} kWh</b></div><div><small>Home demand</small><b>${latestResults.loadTotal.toFixed(1)} kWh</b></div><div><small>Battery at 1 PM</small><b>${Math.round(latestResults.batteryNow / settings.batteryKwh * 100)}%</b></div><div><small>Solar self-sufficiency</small><b>${Math.round(latestResults.selfSufficiency)}%</b></div></div><p>${outageCopy}</p><small class="simulation-footnote">${delta}. Hourly estimates; no live inverter or utility data.</small>`;
}

function renderAppliances() {
  const savedSchedule = applianceSchedule;
  content.innerHTML = `<div class="sim-controls"><label>Appliance <select id="appliance-select"><option value="0.8">Washing machine · 0.8 kWh</option><option value="1.2">Dishwasher · 1.2 kWh</option><option value="2">Water heater · 2.0 kWh</option><option value="7">EV charger · 7.0 kWh</option></select></label>
    <label>Preferred start <input id="preferred-time" type="range" min="8" max="17" value="${preferredHour}"><output id="time-output">${formatTime(preferredHour)}</output></label></div>
    <div class="planner-results" id="planner-results"></div><button id="remind-button">Add best time to today’s plan</button>
    <div class="schedule-list" id="schedule-list">${savedSchedule.length ? savedSchedule.map(item => `<div class="appliance-row"><span>✓</span>${item.name}<strong>${item.time}</strong></div>`).join('') : '<small>No appliance times saved for today yet.</small>'}</div>`;
  const updateOptions = () => {
    const kwh = Number(content.querySelector('#appliance-select').value);
    const results = bestApplianceTimes({ settings, sky: scenario.sky, applianceKwh: kwh, preferredHour });
    content.querySelector('#planner-results').innerHTML = `<div class="planner-best"><small>BEST SOLAR WINDOW</small><b>${formatTime(results[0].hour)}</b><span>${Math.round(results[0].solarCovered * 100)}% estimated solar coverage · ${money(results[0].savings)} value</span></div><div class="planner-alt"><small>Other good options</small>${results.slice(1).map(r => `<span>${formatTime(r.hour)} <b>${Math.round(r.solarCovered * 100)}%</b></span>`).join('')}</div>`;
    return { kwh, result: results[0] };
  };
  content.querySelector('#preferred-time').oninput = e => { preferredHour = Number(e.target.value); content.querySelector('#time-output').textContent = formatTime(preferredHour); updateOptions(); };
  content.querySelector('#appliance-select').onchange = updateOptions;
  content.querySelector('#remind-button').onclick = async () => {
    const choice = updateOptions();
    const name = content.querySelector('#appliance-select').selectedOptions[0].text.split(' · ')[0];
    const draft = { name, time: formatTime(choice.result.hour), kwh: choice.kwh };
    try {
      const response = await apiRequest('/api/schedule', { method: 'POST', body: JSON.stringify(draft) });
      applianceSchedule = response.items;
      setServerStatus(true);
    } catch {
      applianceSchedule = [...applianceSchedule, { ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString() }];
      localStorage.setItem('sunshift-schedule', JSON.stringify(applianceSchedule));
    }
    drawSchedule(applianceSchedule);
    toastMsg(`${name} added to today’s plan.`);
  };
  function drawSchedule(items) {
    const list = content.querySelector('#schedule-list');
    list.innerHTML = items.length ? items.map((item, i) => `<div class="appliance-row"><span>✓</span><span>${item.name}</span><strong>${item.time}</strong><button class="remove-plan" data-remove="${i}" data-id="${item.id}" aria-label="Remove ${item.name}">×</button></div>`).join('') : '<small>No appliance times saved for today yet.</small>';
    list.querySelectorAll('[data-remove]').forEach(button => button.onclick = async () => {
      const id = button.dataset.id;
      try {
        const response = await apiRequest(`/api/schedule/${encodeURIComponent(id)}`, { method: 'DELETE' });
        applianceSchedule = response.items;
      } catch {
        applianceSchedule = applianceSchedule.filter(item => item.id !== id);
        localStorage.setItem('sunshift-schedule', JSON.stringify(applianceSchedule));
      }
      drawSchedule(applianceSchedule);
      toastMsg('Appliance removed from today’s plan.');
    });
  }
  drawSchedule(savedSchedule);
  updateOptions();
}

function renderForecastPage(forecast, selectedDate = null) {
  const today = localDateStamp();
  const day = forecast.days.find(item => item.date === selectedDate) || forecast.days.find(item => item.date > today) || forecast.days[0];
  if (!day) {
    content.innerHTML = '<div class="forecast-error"><b>No forecast days were returned.</b><button id="forecast-retry">Try again</button></div>';
    content.querySelector('#forecast-retry').onclick = () => loadLiveForecast(true);
    return;
  }
  const updated = forecast.updatedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const peakHour = day.hours.reduce((best, item) => item.powerKw > (best?.powerKw ?? -1) ? item : best, null);
  const maxPower = Math.max(0.1, ...day.hours.map(item => item.powerKw));
  const dayCards = forecast.days.map(item => `<button class="forecast-day-card ${item.date === day.date ? 'selected' : ''}" data-forecast-date="${item.date}"><small>${item.date === today ? 'TODAY' : localDateLabel(item.date, { weekday: 'short' }).toUpperCase()}</small><span>${weatherIcon(item.weatherCode)}</span><b>${item.productionKwh.toFixed(1)} <small>kWh</small></b><span class="day-weather">${weatherDescription(item.weatherCode)}</span><small>${Math.round(item.tempLow ?? 0)}° / ${Math.round(item.tempHigh ?? 0)}° · rain ${Math.round(item.rainChance ?? 0)}%</small></button>`).join('');
  const hoursTable = day.hours.filter(item => Number(item.time.slice(0, 2)) >= 5 && Number(item.time.slice(0, 2)) <= 20).map(item => `<div class="solar-hour-row"><span>${formatForecastHour(item.time)}</span><span>${weatherIcon(day.weatherCode)}</span><span>${item.temperature == null ? '—' : `${Math.round(item.temperature)}°`}</span><span>${Math.round(item.cloudCover ?? 0)}%</span><span>${Math.round(item.rainChance ?? 0)}%</span><b>${item.powerKw.toFixed(2)} kW</b></div>`).join('');
  content.innerHTML = `<div class="forecast-status"><span class="forecast-live-dot"></span><span><b>${forecast.source === 'Open-Meteo' ? 'Live weather forecast' : 'Sample forecast'}</b><small>${forecast.location} · Updated ${updated}</small></span><button id="forecast-refresh">↻ Refresh</button></div>
    <div class="forecast-kpis"><article><small>${day.date === today ? 'TODAY’S ESTIMATED GENERATION' : 'NEXT DAY ESTIMATED GENERATION'}</small><b>${day.productionKwh.toFixed(1)} <span>kWh</span></b><small>From ${settings.solarKw.toFixed(1)} kWp of panels</small></article><article><small>PEAK SOLAR OUTPUT</small><b>${(peakHour?.powerKw ?? 0).toFixed(2)} <span>kW</span></b><small>${peakHour ? `Around ${formatForecastHour(peakHour.time)}` : 'No daylight production forecast'}</small></article><article><small>WEATHER</small><b>${weatherDescription(day.weatherCode)}</b><small>${Math.round(day.tempLow ?? 0)}°–${Math.round(day.tempHigh ?? 0)}°C · rain chance ${Math.round(day.rainChance ?? 0)}%</small></article></div>
    <div class="forecast-section-heading"><div><h2>Next 7 days</h2><p>Tap a day to inspect its expected solar generation</p></div><button id="forecast-csv">Download forecast CSV</button></div>
    <div class="forecast-days">${dayCards}</div>
    <div class="forecast-section-heading selected-day-heading"><div><h2>${localDateLabel(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}</h2><p>${weatherDescription(day.weatherCode)} · Sunrise ${formatForecastHour(day.sunrise.slice(11,16)) || '—'} · Sunset ${formatForecastHour(day.sunset.slice(11,16)) || '—'}</p></div><span class="day-total">${day.productionKwh.toFixed(1)} <small>kWh estimated</small></span></div>
    <div class="forecast-hour-chart">${day.hours.map(item => `<div class="forecast-hour-bar" title="${formatForecastHour(item.time)} · ${item.powerKw.toFixed(2)} kW · ${Math.round(item.temperature ?? 0)}°C"><span style="height:${Math.max(2, item.powerKw / maxPower * 100)}%"></span><small>${item.time.slice(0,2)}</small></div>`).join('')}</div>
    <div class="solar-hour-table"><div class="solar-hour-row solar-hour-head"><span>TIME</span><span>SKY</span><span>TEMP</span><span>CLOUD</span><span>RAIN</span><span>SOLAR POWER</span></div>${hoursTable || '<p>No daylight hours available for this date.</p>'}</div>
    <div class="forecast-method"><b>How the estimate works</b><p>Weather and solar irradiance come from Open-Meteo. Estimated panel output uses irradiance × your system size × an 80% performance factor for inverter and system losses. Daily generation is the sum of hourly estimates; actual output varies with roof direction, shading, dust, temperature and equipment.</p><small>Forecast uncertainty increases further into the week. This is a planning estimate, not a guarantee.</small><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather data: Open-Meteo ↗</a></div>`;
  content.querySelectorAll('[data-forecast-date]').forEach(button => button.onclick = () => renderForecastPage(forecast, button.dataset.forecastDate));
  content.querySelector('#forecast-refresh').onclick = () => loadLiveForecast(true);
  content.querySelector('#forecast-csv').onclick = () => downloadForecastCsv(forecast);
}

function renderEnergyPlanPage(forecast, selectedDate = activePlanDate, loadFactor = 1) {
  const today = localDateStamp();
  const day = forecast.days.find(item => item.date === selectedDate) || forecast.days.find(item => item.date > today) || forecast.days[0];
  if (!day) { content.innerHTML = '<div class="forecast-error"><b>No weather days were returned.</b></div>'; return; }
  activePlanDate = day.date;
  const schedule = applianceSchedule;
  const plan = simulateForecastDay(day, settings, schedule, loadFactor);
  const maxPower = Math.max(1, ...plan.rows.map(row => Math.max(row.solar, row.load)));
  const bars = plan.rows.map(row => `<div class="plan-hour-bar" title="${formatForecastHour(`${String(row.hour).padStart(2,'0')}:00`)} · solar ${row.solar.toFixed(2)} kW · demand ${row.load.toFixed(2)} kW"><span class="plan-solar-bar" style="height:${Math.max(2,row.solar/maxPower*100)}%"></span><span class="plan-load-bar" style="height:${Math.max(2,row.load/maxPower*100)}%"></span><small>${row.hour}</small></div>`).join('');
  const table = plan.rows.filter(row => row.solar > .01 || row.load > .45).map(row => `<div class="plan-table-row"><span>${formatForecastHour(`${String(row.hour).padStart(2,'0')}:00`)}</span><span>${row.solar.toFixed(2)} kW</span><span>${row.load.toFixed(2)} kW</span><span>${row.grid.toFixed(2)} kWh</span><span>${row.batteryPct.toFixed(0)}%</span></div>`).join('');
  const advice = plan.imported > plan.loadTotal * .35
    ? `Grid imports are projected to be relatively high. Try shifting flexible appliances toward ${formatForecastHour(`${String(plan.bestSurplusHour).padStart(2,'0')}:00`)} when solar is strongest.`
    : `Solar and the battery are projected to cover most of the home’s needs. The strongest solar surplus is around ${formatForecastHour(`${String(plan.bestSurplusHour).padStart(2,'0')}:00`)}.`;
  const savedDays = forecast.days.map(item => `<option value="${item.date}" ${item.date === day.date ? 'selected' : ''}>${item.date === today ? 'Today' : localDateLabel(item.date, { weekday:'short', day:'numeric', month:'short' })}</option>`).join('');
  content.innerHTML = `<div class="plan-source"><span class="forecast-live-dot"></span><div><b>${forecast.source === 'Open-Meteo' ? 'Weather-based plan' : 'Sample-data plan'}</b><small>${forecast.location} · ${localDateLabel(day.date,{weekday:'long',day:'numeric',month:'long'})} · ${settings.solarKw.toFixed(1)} kWp solar · ${settings.batteryKwh.toFixed(1)} kWh battery</small></div><button id="plan-refresh">↻ Refresh forecast</button></div>
    <div class="plan-controls"><label>Plan date<select id="plan-date">${savedDays}</select></label><label>Home routine<select id="plan-demand"><option value="1" ${loadFactor===1?'selected':''}>Typical household day</option><option value="1.3" ${loadFactor>1?'selected':''}>Higher-use day · +30%</option></select></label><button id="plan-download">Download this day as CSV</button><button class="secondary-action" id="plan-save">Save plan to run history</button></div>
    <div class="plan-kpis"><article><small>EXPECTED SOLAR</small><b>${plan.solarTotal.toFixed(1)} <span>kWh</span></b><small>${(day.peakKw ?? 0).toFixed(2)} kW peak forecast</small></article><article><small>ESTIMATED HOME USE</small><b>${plan.loadTotal.toFixed(1)} <span>kWh</span></b><small>${loadFactor > 1 ? 'Higher-use routine' : 'Typical routine'} + saved appliance reminders</small></article><article><small>GRID IMPORTS</small><b>${plan.imported.toFixed(1)} <span>kWh</span></b><small>At ${money(settings.tariff)}/kWh, about ${money(plan.projectedGridCost)}</small></article><article><small>SOLAR SELF-SUFFICIENCY</small><b>${Math.round(plan.selfSufficiency)}<span>%</span></b><small>Battery ends at ${plan.batteryEnd.toFixed(1)} kWh (${Math.round(plan.batteryEndPct)}%)</small></article></div>
    <div class="plan-advice"><span>✦</span><div><b>Day-ahead suggestion</b><p>${advice}</p></div><button id="plan-appliances">Review appliance times</button></div>
    <section class="plan-chart-panel"><div class="forecast-section-heading"><div><h2>Predicted hourly balance</h2><p>Weather-based solar output compared with estimated home demand</p></div><div class="plan-legend"><span><i></i>Solar</span><span><i></i>Home use</span></div></div><div class="plan-chart">${bars}</div></section>
    <section class="plan-table-panel"><div class="forecast-section-heading"><div><h2>Dispatch detail</h2><p>Battery charges from surplus and covers demand above the saved reserve</p></div></div><div class="plan-table"><div class="plan-table-row plan-table-head"><span>TIME</span><span>SOLAR</span><span>HOME</span><span>GRID IMPORT</span><span>BATTERY</span></div>${table}</div></section>
    <div class="forecast-method"><b>What this prediction assumes</b><p>Solar comes from the selected day’s weather forecast. Household demand follows a generic hourly routine with a temperature-based cooling allowance. The model applies your battery capacity and reserve, 94% charge efficiency, 92% discharge efficiency, and any saved appliance reminders as if they run on this selected day.</p><small>This is a planning estimate. It does not learn from smart-meter history and is not a guarantee of generation, bill amount or available power.</small></div>`;
  content.querySelector('#plan-date').onchange = event => renderEnergyPlanPage(forecast, event.target.value, Number(content.querySelector('#plan-demand').value));
  content.querySelector('#plan-demand').onchange = event => renderEnergyPlanPage(forecast, day.date, Number(event.target.value));
  content.querySelector('#plan-refresh').onclick = () => loadEnergyPlan(true, day.date, loadFactor);
  content.querySelector('#plan-appliances').onclick = () => setView('appliances');
  content.querySelector('#plan-download').onclick = () => downloadPlanCsv(plan, forecast, day);
  content.querySelector('#plan-save').onclick = async () => {
    const saved = await persistRun({ type: 'day-ahead', title: 'Day-ahead energy plan', date: day.date, sky: day.weatherCode >= 3 ? 'cloudy' : 'clear', outage: false, loadFactor, location: forecast.location, solarKwh: plan.solarTotal, homeKwh: plan.loadTotal, gridImportKwh: plan.imported, estimatedCost: plan.projectedGridCost, batteryPct: Math.round(plan.batteryEndPct) });
    toastMsg(saved ? 'Day-ahead plan saved to run history.' : 'Plan saved in this browser; server connection is unavailable.');
  };
}

async function loadEnergyPlan(force = false, date = activePlanDate, loadFactor = 1) {
  title.textContent = 'Day-ahead energy plan';
  const cacheMatches = liveForecast && liveForecast.panelKw === settings.solarKw && liveForecast.panelTilt === settings.panelTilt && liveForecast.panelAzimuth === settings.panelAzimuth && liveForecast.latitude === settings.latitude && liveForecast.longitude === settings.longitude && Date.now() - liveForecastAt < 15 * 60 * 1000;
  if (!force && cacheMatches) { renderEnergyPlanPage(liveForecast, date, loadFactor); return; }
  content.innerHTML = '<div class="forecast-loading"><span class="loading-orbit">☼</span><b>Building your day-ahead plan…</b><p>Combining the weather forecast with your home and battery settings.</p></div>';
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 15000);
  try {
    liveForecast = await fetchSolarForecast(settings, { signal: abort.signal });
    liveForecastAt = Date.now();
    applyForecastPreview(liveForecast);
    if (currentView === 'energy-plan') renderEnergyPlanPage(liveForecast, date, loadFactor);
  } catch {
    if (currentView === 'energy-plan') renderEnergyPlanPage(makeSampleForecast(), date, loadFactor);
  } finally { clearTimeout(timeout); }
}

function downloadPlanCsv(plan, forecast, day) {
  const rows = [['Date','Hour','Weather','Solar forecast kW','Estimated home demand kW','Grid import kWh','Battery charge kWh','Battery discharge kWh','Battery state %']];
  plan.rows.forEach(row => rows.push([day.date, `${String(row.hour).padStart(2,'0')}:00`, weatherDescription(day.weatherCode), row.solar.toFixed(3), row.load.toFixed(3), row.grid.toFixed(3), row.charge.toFixed(3), row.discharge.toFixed(3), row.batteryPct.toFixed(1)]));
  rows.push(['TOTAL','',forecast.source,plan.solarTotal.toFixed(2),plan.loadTotal.toFixed(2),plan.imported.toFixed(2),'','','']);
  const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"','""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = `sunshift-day-ahead-${day.date}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function weatherIcon(code) {
  if (code === 0 || code === 1) return '☀';
  if (code === 2 || code === 3 || (code >= 45 && code <= 48)) return '☁';
  if (code >= 51 && code <= 82) return '🌧';
  if (code >= 95) return '⛈';
  return '⛅';
}

function applyForecastPreview(forecast) {
  const today = localDateStamp();
  const tomorrow = forecast.days.find(day => day.date > today) || forecast.days[0];
  if (!tomorrow) return;
  const plan = simulateForecastDay(tomorrow, settings, applianceSchedule);
  setText('forecast-expected', tomorrow.productionKwh.toFixed(1));
  setText('forecast-potential', `${tomorrow.peakKw.toFixed(2)}`);
  setText('forecast-confidence', `${Math.round(tomorrow.rainChance ?? 0)}%`);
  setText('forecast-data-note', `${forecast.source === 'Open-Meteo' ? 'Weather forecast' : 'Sample weather'} · ${localDateLabel(tomorrow.date, { weekday: 'long', day: 'numeric', month: 'short' })}`);
  setText('weather-temperature', Math.round(tomorrow.tempHigh ?? 0));
  setText('weather-condition', weatherDescription(tomorrow.weatherCode));
  setText('weather-location', `${forecast.location} · Next-day forecast`);
  setText('weather-icon', weatherIcon(tomorrow.weatherCode));
  setText('weather-sunrise', formatForecastHour(tomorrow.sunrise.slice(11,16)) || '—');
  setText('weather-sunset', formatForecastHour(tomorrow.sunset.slice(11,16)) || '—');
  setText('home-location', forecast.location);
  setText('sidebar-weather', `${weatherDescription(tomorrow.weatherCode)} · ${Math.round(tomorrow.tempHigh ?? 0)}° tomorrow`);
  setText('solar-date-label', `Forecast · ${localDateLabel(tomorrow.date,{weekday:'short',day:'numeric',month:'short'})}`);
  updateDashboard(plan);
}

async function refreshDashboardForecast() {
  try {
    liveForecast = await fetchSolarForecast(settings);
    liveForecastAt = Date.now();
    applyForecastPreview(liveForecast);
  } catch {
    setText('forecast-data-note', 'Weather service unavailable · open Forecast to retry');
    setText('weather-condition', 'Forecast unavailable');
    setText('sidebar-weather', 'Weather feed unavailable');
  }
}

function formatForecastHour(value) {
  if (!value) return '';
  const hour = Number(value.slice(0, 2));
  if (!Number.isFinite(hour)) return value;
  return `${hour % 12 || 12}${hour >= 12 ? ' PM' : ' AM'}`;
}

async function loadLiveForecast(force = false) {
  title.textContent = 'Weather & solar forecast';
  if (!force && liveForecast && Date.now() - liveForecastAt < 15 * 60 * 1000 && liveForecast.panelKw === settings.solarKw && liveForecast.panelTilt === settings.panelTilt && liveForecast.panelAzimuth === settings.panelAzimuth && liveForecast.latitude === settings.latitude && liveForecast.longitude === settings.longitude) {
    applyForecastPreview(liveForecast);
    renderForecastPage(liveForecast);
    return;
  }
  content.innerHTML = '<div class="forecast-loading"><span class="loading-orbit">☼</span><b>Getting the latest forecast…</b><p>Fetching weather and solar radiation for your selected location.</p></div>';
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 15000);
  try {
    liveForecast = await fetchSolarForecast(settings, { signal: abort.signal });
    liveForecastAt = Date.now();
    applyForecastPreview(liveForecast);
    if (currentView === 'forecast') renderForecastPage(liveForecast);
  } catch (error) {
    if (currentView !== 'forecast') return;
    content.innerHTML = `<div class="forecast-error"><span>☁</span><div><b>Live forecast couldn’t load</b><p id="forecast-error-message"></p><small>Check your internet connection or use the sample forecast.</small></div><button id="forecast-retry">Try again</button><button class="secondary-action" id="forecast-demo">Use sample forecast</button></div>`;
    content.querySelector('#forecast-error-message').textContent = error.name === 'AbortError' ? 'The weather service took too long to respond.' : error.message;
    content.querySelector('#forecast-retry').onclick = () => loadLiveForecast(true);
    content.querySelector('#forecast-demo').onclick = () => renderForecastPage(makeSampleForecast());
    setText('forecast-data-note', 'Live forecast unavailable · retry or use clearly labelled sample data');
  } finally {
    clearTimeout(timeout);
  }
}

function makeSampleForecast() {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = localDateStamp(new Date(Date.now() + index * 86400000));
    const cloudy = index === 2 || index === 5;
    const results = simulate({ settings, sky: cloudy ? 'cloudy' : 'clear' });
    const hours = results.rows.map(row => ({ time: `${String(row.hour).padStart(2,'0')}:00`, temperature: 27 + Math.max(0, 5 - Math.abs(row.hour - 13)), rainChance: cloudy ? 55 : 10, cloudCover: cloudy ? 72 : 24, irradiance: row.solar / Math.max(settings.solarKw * .8, .1) * 1000, powerKw: row.solar }));
    return { date, hours, productionKwh: results.solarTotal, peakKw: Math.max(...hours.map(hour => hour.powerKw)), weatherCode: cloudy ? 3 : 1, tempHigh: 32, tempLow: 21, rainChance: cloudy ? 55 : 10, sunrise: `${date}T06:24`, sunset: `${date}T18:03` };
  });
  return { location: 'Pune, Maharashtra', days, updatedAt: new Date(), source: 'Sample model', panelKw: settings.solarKw };
}

function downloadForecastCsv(forecast) {
  const rows = [['Date','Time','Weather','Temperature C','Cloud cover %','Rain probability %','Estimated solar power kW','Estimated solar energy kWh']];
  forecast.days.forEach(day => day.hours.forEach(hour => rows.push([day.date, hour.time, weatherDescription(day.weatherCode), hour.temperature ?? '', hour.cloudCover ?? '', hour.rainChance ?? '', hour.powerKw.toFixed(3), hour.powerKw.toFixed(3)])));
  const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"','""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `sunshift-weather-solar-forecast-${localDateStamp()}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function renderHistory() {
  content.innerHTML = '<div class="forecast-loading"><span class="loading-orbit">↻</span><b>Loading saved run history…</b></div>';
  try { savedRuns = (await apiRequest('/api/runs?limit=100')).items; localStorage.setItem('sunshift-runs', JSON.stringify(savedRuns)); } catch { savedRuns = readLocal('sunshift-runs', []); }
  if (!savedRuns.length) {
    content.innerHTML = `<div class="history-empty"><span>↗</span><h2>No saved calculations yet</h2><p>Run a weather or grid scenario, or save a day-ahead plan, and it will appear here with its assumptions and results.</p><button id="history-run-scenario">Run a scenario</button><button class="secondary-action" id="history-plan">Open day-ahead plan</button><small>Settings and runs are stored by the local SunShift server on this computer.</small></div>`;
    content.querySelector('#history-run-scenario').onclick = () => setView('scenarios');
    content.querySelector('#history-plan').onclick = () => setView('energy-plan');
    return;
  }
  const totalSolar = savedRuns.reduce((sum, run) => sum + run.solarKwh, 0);
  const averageGrid = savedRuns.reduce((sum, run) => sum + run.gridImportKwh, 0) / savedRuns.length;
  content.innerHTML = `<div class="history-summary"><div><small>SAVED CALCULATIONS</small><b>${savedRuns.length}</b></div><div><small>TOTAL FORECAST SOLAR</small><b>${totalSolar.toFixed(1)} kWh</b></div><div><small>AVERAGE GRID IMPORT</small><b>${averageGrid.toFixed(1)} kWh</b></div></div>
    <div class="history-table"><div class="history-row history-head"><span>RUN</span><span>WEATHER / MODE</span><span>SOLAR</span><span>HOME</span><span>GRID</span><span>GRID COST</span></div>${savedRuns.map(run => `<div class="history-row history-data-row"><span><b>${new Date(run.timestamp).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</b><small>${run.location || settings.location}</small></span><span>${run.title}<small>${run.type === 'day-ahead' ? `Forecast · ${run.date}` : `${run.outage ? 'Outage' : 'Grid available'} · ${run.loadFactor > 1 ? 'High demand' : 'Typical demand'}`}</small></span><span>${run.solarKwh.toFixed(1)} kWh</span><span>${run.homeKwh.toFixed(1)} kWh</span><span>${run.gridImportKwh.toFixed(1)} kWh</span><strong>${money(run.estimatedCost)}</strong></div>`).join('')}</div>
    <div class="history-footer"><small>Saved by SunShift on this server. Values are forecasts or scenario calculations, not measured meter history.</small></div>`;
}

function exportReport() {
  const rows = [['Hour','Solar kWh','Home demand kWh','Grid import kWh','Battery charge kWh','Battery discharge kWh','Battery state %']];
  for (const row of latestResults.rows) rows.push([`${row.hour}:00`, row.solar.toFixed(3), row.load.toFixed(3), row.grid.toFixed(3), row.charge.toFixed(3), row.discharge.toFixed(3), row.battery.toFixed(1)]);
  rows.push(['DAILY TOTAL', latestResults.solarTotal.toFixed(2), latestResults.loadTotal.toFixed(2), latestResults.imported.toFixed(2), '', '', '']);
  rows.push(['Scenario', scenario.sky, scenario.outage ? 'Grid outage' : 'Grid available', `Demand ×${scenario.loadFactor}`, '', '', '']);
  const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"','""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `sunshift-energy-report-${localDateStamp()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function renderReports() {
  content.innerHTML = `<div class="result-grid"><div><small>Scenario</small><b>${scenario.sky === 'cloudy' ? 'Cloudy' : 'Clear'} · ${scenario.outage ? 'Outage' : 'Grid available'}</b></div><div><small>Energy tracked</small><b>${latestResults.rows.length} hourly intervals</b></div><div><small>Solar generated</small><b>${latestResults.solarTotal.toFixed(1)} kWh</b></div><div><small>Grid import</small><b>${latestResults.imported.toFixed(1)} kWh</b></div></div><p>Download hourly dispatch for the current scenario or export the calculations you have saved.</p><button id="download-report">Download hourly CSV</button><button class="secondary-action" id="download-history">Download saved run history CSV</button><small class="simulation-footnote">Reports identify calculated results as estimates. They are not meter readings.</small>`;
  content.querySelector('#download-report').onclick = exportReport;
  content.querySelector('#download-history').onclick = () => {
    const rows = [['Saved at','Calculation date','Type','Title','Location','Solar kWh','Home kWh','Grid import kWh','Estimated grid cost INR','Battery %']];
    savedRuns.forEach(run => rows.push([run.timestamp,run.date,run.type,run.title,run.location,run.solarKwh.toFixed(2),run.homeKwh.toFixed(2),run.gridImportKwh.toFixed(2),run.estimatedCost.toFixed(2),run.batteryPct.toFixed(1)]));
    if (!savedRuns.length) { toastMsg('Save a scenario or day-ahead plan before exporting history.'); return; }
    const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"','""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob(['\ufeff',csv], { type: 'text/csv;charset=utf-8' })); link.download = `sunshift-run-history-${localDateStamp()}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
}

function renderSettings() {
  const fields = [['solarKw','Solar system size','2','10','0.2',' kWp'], ['batteryKwh','Battery capacity','2','15','0.5',' kWh'], ['tariff','Grid tariff','4','20','1',' ₹/kWh'], ['reserve','Battery reserve','10','50','1','%'], ['panelTilt','Panel tilt','0','60','1','°'], ['panelAzimuth','Panel direction · 0° is south','-180','180','15','°']];
  const locations = [{ name:'Pune, Maharashtra', lat:18.5204, lon:73.8567 },{ name:'Mumbai, Maharashtra', lat:19.0760, lon:72.8777 },{ name:'Delhi, NCR', lat:28.6139, lon:77.2090 },{ name:'Bengaluru, Karnataka', lat:12.9716, lon:77.5946 },{ name:'Hyderabad, Telangana', lat:17.3850, lon:78.4867 },{ name:'Chennai, Tamil Nadu', lat:13.0827, lon:80.2707 },{ name:'Kolkata, West Bengal', lat:22.5726, lon:88.3639 }];
  content.innerHTML = `<div class="settings-page-group"><h2>Home profile</h2><p>Set your location and solar equipment to tailor forecasts and planning.</p><div class="sim-controls"><label>Forecast location<select id="setting-location">${locations.map(item => `<option value="${item.name}" ${settings.location===item.name?'selected':''}>${item.name}</option>`).join('')}</select></label></div></div><div class="settings-page-group"><h2>Solar and battery</h2><p>These settings affect solar generation, storage, and cost estimates.</p><div class="sim-controls">${fields.map(([id,label,min,max,step,unit]) => `<label>${label}<span class="range-control"><input type="range" id="setting-${id}" min="${min}" max="${max}" step="${step}" value="${settings[id]}"><output id="output-${id}">${settings[id]}${unit}</output></span></label>`).join('')}</div></div><button id="save-settings">Save home settings</button><p class="simulation-footnote">Saved on the SunShift server. Panel tilt and direction affect the weather-based irradiance estimate. Household demand is estimated from the selected routine.</p>`;
  for (const [id,,min,max,step,unit] of fields) {
    const range = content.querySelector(`#setting-${id}`);
    range.oninput = () => { content.querySelector(`#output-${id}`).textContent = `${range.value}${unit}`; };
  }
  content.querySelector('#save-settings').onclick = async () => {
    for (const [id] of fields) settings[id] = Number(content.querySelector(`#setting-${id}`).value);
    const selectedLocation = locations.find(item => item.name === content.querySelector('#setting-location').value) || locations[0];
    settings.location = selectedLocation.name;
    settings.latitude = selectedLocation.lat;
    settings.longitude = selectedLocation.lon;
    settings.batteryStart = Math.max(settings.reserve / 100, Math.min(.95, settings.batteryStart));
    let savedOnServer = false;
    try {
      const saved = await apiRequest('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
      Object.assign(settings, saved.settings);
      setServerStatus(true);
      savedOnServer = true;
    } catch {
      localStorage.setItem('sunshift-settings', JSON.stringify(settings));
      setServerStatus(false);
    }
    setText('home-location', settings.location);
    latestResults = simulate({ settings, ...scenario });
    updateDashboard(latestResults);
    if (currentView === 'forecast') loadLiveForecast(true);
    else if (currentView === 'energy-plan') loadEnergyPlan(true, activePlanDate);
    else refreshDashboardForecast();
    toastMsg(savedOnServer ? 'Home settings saved on the server.' : 'Could not reach the server; settings saved in this browser.');
  };
}

function renderView(key) {
  title.textContent = key === 'forecast' ? 'Weather & solar forecast' : viewLabels[key] || key;
  copy.textContent = sectionCopy[key] || sectionCopy['live-flow'];
  content.innerHTML = '';
  if (key === 'scenarios') renderScenario();
  else if (key === 'appliances') renderAppliances();
  else if (key === 'settings') renderSettings();
  else if (key === 'history') renderHistory();
  else if (key === 'reports') renderReports();
  else if (key === 'forecast') loadLiveForecast();
  else if (key === 'energy-plan') loadEnergyPlan();
  else if (key === 'battery') {
    content.innerHTML = `<div class="result-grid"><div><small>Stored at 1 PM</small><b>${latestResults.batteryNow.toFixed(1)} kWh</b></div><div><small>Capacity</small><b>${settings.batteryKwh.toFixed(1)} kWh</b></div><div><small>Protected reserve</small><b>${settings.reserve}%</b></div></div><p>Battery dispatch follows the selected weather and outage scenario.</p>`;
  } else if (key === 'savings') {
    content.innerHTML = `<div class="result-grid"><div><small>Today</small><b>${money(latestResults.savings)}</b></div><div><small>Monthly run rate</small><b>${money(latestResults.savings * 30)}</b></div><div><small>CO₂ avoided</small><b>${latestResults.co2.toFixed(1)} kg</b></div></div><p>Estimate = solar energy used directly or stored × your saved tariff of ${money(settings.tariff)} per kWh.</p>`;
  } else if (key === 'live-flow') {
    const row = latestResults.rows.find(r => r.hour === 13) || latestResults.rows[7];
    content.innerHTML = `<div class="result-grid"><div><small>Solar at 1 PM</small><b>${row.solar.toFixed(1)} kW</b></div><div><small>Home demand</small><b>${row.load.toFixed(1)} kW</b></div><div><small>Battery power</small><b>${row.charge ? `+${row.charge.toFixed(1)} kW` : `−${row.discharge.toFixed(1)} kW`}</b></div><div><small>Grid import</small><b>${row.grid.toFixed(1)} kW</b></div></div><p>Flow is generated from the sample hourly dispatch model, not measured equipment.</p>`;
  }
}

const viewLabels = Object.fromEntries([...document.querySelectorAll('.nav-item')].map(a => [a.dataset.view, a.textContent.trim()]));
viewLabels['live-flow'] = 'Live flow';
let currentView = 'overview';
function setView(key, push = true) {
  const knownViews = new Set(['overview', ...Object.keys(sectionCopy)]);
  if (!knownViews.has(key)) key = 'overview';
  currentView = key;
  document.title = `${key === 'overview' ? 'Overview' : viewLabels[key] || key} · SunShift India`;
  document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.view === key));
  setText('crumb-current', key === 'overview' ? 'Overview' : viewLabels[key] || key);
  if (push) {
    const nextHash = key === 'overview' ? '#overview' : `#${key}`;
    if (location.hash !== nextHash) history.pushState({ view: key }, '', nextHash);
  }
  dashboardPage.hidden = key !== 'overview';
  overlay.hidden = key === 'overview';
  if (key === 'overview') return;
  renderView(key);
}

document.querySelectorAll('.nav-item').forEach(a => a.addEventListener('click', e => { e.preventDefault(); setView(a.dataset.view); }));
document.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => setView(b.dataset.jump)));
document.getElementById('page-back').onclick = e => { e.preventDefault(); setView('overview'); };
window.addEventListener('popstate', () => setView(location.hash.slice(1) || 'overview', false));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && currentView !== 'overview') history.back(); });
document.getElementById('schedule-button').onclick = () => setView('appliances');
const chart = document.getElementById('energy-chart');
chart.addEventListener('pointermove', e => {
  const rect = chart.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * 760;
  const y = Math.max(25, Math.min(185, 190 - (x / 760) * 115));
  document.getElementById('chart-cursor').setAttribute('x1', x);
  document.getElementById('chart-cursor').setAttribute('x2', x);
  document.getElementById('chart-dot').setAttribute('cx', x);
  document.getElementById('chart-dot').setAttribute('cy', y);
});
updateDateHeader();
updateDashboard();
setView(location.hash.slice(1) || 'overview', false);
hydrateServerState();
