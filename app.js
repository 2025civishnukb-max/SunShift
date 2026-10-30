import { DEFAULTS, simulate, bestApplianceTimes, formatTime } from './sim.js';
import { fetchSolarForecast, weatherDescription, localDateLabel } from './weather.js';

const saved = JSON.parse(localStorage.getItem('sunshift-settings') || 'null');
const settings = { ...DEFAULTS, ...(saved || {}) };
let scenario = { sky: 'clear', outage: false, loadFactor: 1 };
let preferredHour = 13;
let latestResults = simulate({ settings, ...scenario });
let liveForecast = null;
let liveForecastAt = 0;
const overlay = document.getElementById('view-overlay');
const dashboardPage = document.getElementById('dashboard-page');
const title = document.getElementById('overlay-title');
const copy = document.getElementById('overlay-copy');
const content = document.getElementById('overlay-content');
const toast = document.getElementById('toast');
const money = amount => `₹${Math.round(amount).toLocaleString('en-IN')}`;
const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
const localDateStamp = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const sectionCopy = {
  'live-flow': 'See how solar power is split between home use, the battery and the grid. Values use the selected sample scenario.',
  forecast: 'Use the latest weather forecast to estimate hourly solar power and total generation for the next seven days.',
  battery: 'The dispatch model charges from surplus solar and discharges above your reserve when the home needs energy.',
  appliances: 'Compare appliance start times against estimated solar surplus and your preferred window.',
  scenarios: 'Change weather and grid availability, then recalculate the sample energy dispatch.',
  savings: 'Estimated value of solar energy used directly or stored for later, using your sample electricity tariff.',
  history: 'Review an illustrative seven-day energy history with solar production, household demand, grid imports and estimated savings.',
  reports: 'View and download hourly dispatch details or a seven-day summary as CSV files.',
  settings: 'Adjust home and panel settings. These values tune the solar forecast and are saved in this browser.'
};

function toastMsg(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastMsg.timer);
  toastMsg.timer = setTimeout(() => toast.classList.remove('show'), 2800);
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
  const batteryPct = Math.round(results.batteryNow / settings.batteryKwh * 100);
  setText('solar-total', solar.toFixed(1));
  setText('consumption-total', load.toFixed(1));
  setText('battery-level', batteryPct);
  setText('savings-total', Math.round(results.savings));
  setText('co2-avoided', `${results.co2.toFixed(1)} kg CO₂ avoided`);
  const progress = document.querySelector('.battery-progress span');
  if (progress) progress.style.width = `${batteryPct}%`;
  const current = results.rows.find(r => r.hour === 13) || results.rows[7];
  const home = current.load;
  const directSolar = Math.min(current.solar, home);
  const charging = current.charge;
  const exportPower = Math.max(0, current.solar - home - charging);
  setText('flow-solar', current.solar.toFixed(1));
  setText('flow-home', home.toFixed(1));
  setText('flow-battery', charging.toFixed(1));
  setText('flow-grid', exportPower.toFixed(1));
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
  content.querySelector('#run-scenario').onclick = () => {
    readScenario();
    renderScenarioSummary();
    toastMsg('Dispatch recalculated from the selected sample conditions.');
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
  const savedSchedule = JSON.parse(localStorage.getItem('sunshift-schedule') || '[]');
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
  content.querySelector('#remind-button').onclick = () => {
    const choice = updateOptions();
    const name = content.querySelector('#appliance-select').selectedOptions[0].text.split(' · ')[0];
    const items = JSON.parse(localStorage.getItem('sunshift-schedule') || '[]');
    items.push({ id: crypto.randomUUID(), name, time: formatTime(choice.result.hour) });
    localStorage.setItem('sunshift-schedule', JSON.stringify(items));
    drawSchedule(items);
    toastMsg(`${name} added to today’s plan.`);
  };
  function drawSchedule(items) {
    const list = content.querySelector('#schedule-list');
    list.innerHTML = items.length ? items.map((item, i) => `<div class="appliance-row"><span>✓</span><span>${item.name}</span><strong>${item.time}</strong><button class="remove-plan" data-remove="${i}" aria-label="Remove ${item.name}">×</button></div>`).join('') : '<small>No appliance times saved for today yet.</small>';
    list.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => {
      const next = JSON.parse(localStorage.getItem('sunshift-schedule') || '[]');
      next.splice(Number(button.dataset.remove), 1);
      localStorage.setItem('sunshift-schedule', JSON.stringify(next));
      drawSchedule(next);
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
  setText('forecast-expected', tomorrow.productionKwh.toFixed(1));
  setText('forecast-potential', `${tomorrow.peakKw.toFixed(2)}`);
  setText('forecast-confidence', `${Math.round(tomorrow.rainChance ?? 0)}%`);
  setText('forecast-data-note', `${forecast.source === 'Open-Meteo' ? 'Live' : 'Sample'} weather forecast · ${localDateLabel(tomorrow.date, { weekday: 'long', day: 'numeric', month: 'short' })}`);
}

async function refreshDashboardForecast() {
  try {
    liveForecast = await fetchSolarForecast(settings);
    liveForecastAt = Date.now();
    applyForecastPreview(liveForecast);
  } catch {
    setText('forecast-data-note', 'Live forecast unavailable · open the 7-day outlook to retry');
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
  if (!force && liveForecast && Date.now() - liveForecastAt < 15 * 60 * 1000 && liveForecast.panelKw === settings.solarKw && liveForecast.panelTilt === settings.panelTilt && liveForecast.panelAzimuth === settings.panelAzimuth) {
    applyForecastPreview(liveForecast);
    renderForecastPage(liveForecast);
    return;
  }
  content.innerHTML = '<div class="forecast-loading"><span class="loading-orbit">☼</span><b>Getting the latest forecast…</b><p>Fetching weather and solar radiation for Pune.</p></div>';
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
    setText('forecast-data-note', 'Live forecast unavailable · showing demo when selected');
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

function renderHistory() {
  const weather = ['clear', 'clear', 'cloudy', 'clear', 'cloudy', 'clear', 'clear'];
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.now() - (6 - i) * 86400000);
    const day = i === 6 ? 'Today' : date.toLocaleDateString('en-IN', { weekday: 'short' });
    const results = simulate({ settings, sky: weather[i], loadFactor: i === 2 ? 1.2 : 1 });
    return { day, date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), ...results };
  });
  content.innerHTML = `<div class="history-summary"><div><small>7-DAY SOLAR</small><b>${days.reduce((a, d) => a + d.solarTotal, 0).toFixed(1)} kWh</b></div><div><small>7-DAY SAVINGS ESTIMATE</small><b>${money(days.reduce((a, d) => a + d.savings, 0))}</b></div><div><small>SELF-SUFFICIENCY AVG.</small><b>${Math.round(days.reduce((a, d) => a + d.selfSufficiency, 0) / days.length)}%</b></div></div>
    <div class="history-bars">${days.map(d => `<div class="history-bar-col"><b>${d.solarTotal.toFixed(0)}</b><span style="height:${Math.max(8, Math.min(100, d.solarTotal / Math.max(...days.map(x => x.solarTotal)) * 100))}%"></span><small>${d.day}</small><small>${d.date}</small></div>`).join('')}</div>
    <div class="history-table"><div class="history-row history-head"><span>DAY</span><span>SOLAR</span><span>HOME</span><span>GRID</span><span>SAVINGS</span></div>${days.map(d => `<div class="history-row"><span>${d.day} · ${d.date}</span><span>${d.solarTotal.toFixed(1)} kWh</span><span>${d.loadTotal.toFixed(1)} kWh</span><span>${d.imported.toFixed(1)} kWh</span><span>${money(d.savings)}</span></div>`).join('')}</div>
    <small class="simulation-footnote">Illustrative history generated from sample weather profiles, not measured past readings.</small>`;
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
  content.innerHTML = `<div class="result-grid"><div><small>Scenario</small><b>${scenario.sky === 'cloudy' ? 'Cloudy' : 'Clear'} · ${scenario.outage ? 'Outage' : 'Grid available'}</b></div><div><small>Energy tracked</small><b>${latestResults.rows.length} hourly intervals</b></div><div><small>Solar generated</small><b>${latestResults.solarTotal.toFixed(1)} kWh</b></div><div><small>Grid import</small><b>${latestResults.imported.toFixed(1)} kWh</b></div></div><p>Download a CSV with hourly solar, home demand, grid import and battery dispatch for this scenario.</p><button id="download-report">Download hourly CSV</button><button class="secondary-action" id="download-history">Download 7-day summary CSV</button><small class="simulation-footnote">The report includes simulated values and the current scenario assumptions.</small>`;
  content.querySelector('#download-report').onclick = exportReport;
  content.querySelector('#download-history').onclick = () => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const results = simulate({ settings, sky: i === 2 || i === 4 ? 'cloudy' : 'clear', loadFactor: i === 2 ? 1.2 : 1 });
      return `${localDateStamp(new Date(Date.now() - (6 - i) * 86400000))},${results.solarTotal.toFixed(2)},${results.loadTotal.toFixed(2)},${results.imported.toFixed(2)},${money(results.savings)}`;
    });
    const blob = new Blob(['Date,Solar kWh,Home kWh,Grid import kWh,Estimated savings\r\n', ...days].join('\r\n'), { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'sunshift-seven-day-summary.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
}

function renderSettings() {
  const fields = [['solarKw','Solar system size','2','10','0.2',' kWp'], ['batteryKwh','Battery capacity','2','15','0.5',' kWh'], ['tariff','Grid tariff','4','20','1',' ₹/kWh'], ['reserve','Battery reserve','10','50','1','%'], ['panelTilt','Panel tilt','0','60','1','°'], ['panelAzimuth','Panel direction · 0° is south','-180','180','15','°']];
  content.innerHTML = `<div class="sim-controls">${fields.map(([id,label,min,max,step,unit]) => `<label>${label}<span class="range-control"><input type="range" id="setting-${id}" min="${min}" max="${max}" step="${step}" value="${settings[id]}"><output id="output-${id}">${settings[id]}${unit}</output></span></label>`).join('')}</div><button id="save-settings">Save home settings</button><p class="simulation-footnote">Saved locally in this browser. Panel tilt and direction affect the weather-based irradiance estimate. All generation figures remain estimates.</p>`;
  for (const [id,,min,max,step,unit] of fields) {
    const range = content.querySelector(`#setting-${id}`);
    range.oninput = () => { content.querySelector(`#output-${id}`).textContent = `${range.value}${unit}`; };
  }
  content.querySelector('#save-settings').onclick = () => {
    for (const [id] of fields) settings[id] = Number(content.querySelector(`#setting-${id}`).value);
    settings.batteryStart = Math.max(settings.reserve / 100, Math.min(.95, settings.batteryStart));
    localStorage.setItem('sunshift-settings', JSON.stringify(settings));
    latestResults = simulate({ settings, ...scenario });
    updateDashboard(latestResults);
    if (currentView === 'forecast') loadLiveForecast(true);
    else refreshDashboardForecast();
    toastMsg('Home settings saved and dispatch recalculated.');
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
updateDashboard();
setView(location.hash.slice(1) || 'overview', false);
if (currentView !== 'forecast') refreshDashboardForecast();
