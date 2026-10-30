import { DEFAULTS, simulate, simulateForecastDay, bestApplianceTimes, formatTime } from './sim.js';
import { fetchSolarForecast, weatherDescription, localDateLabel } from './weather.js';
import { renderRooftopEstimator, renderSolarSavingsCalculator } from './solar-tools.js';

function readLocal(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
const legacySettings = readLocal('sunshift-settings', null);
const legacySchedule = readLocal('sunshift-schedule', []);
const settings = { ...DEFAULTS, ...(legacySettings || {}) };
let applianceSchedule = Array.isArray(legacySchedule) ? legacySchedule : [];
let savedRuns = readLocal('sunshift-runs', []);
let backendOnline = false;
let supabaseConfig = null;
let authSession = readLocal('sunshift-auth-session', null);
let signedInUser = null;
let scenario = { sky: 'clear', outage: false, loadFactor: 1, batteryAvailable: true, tariff: null };
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
  if (supabaseConfig?.configured && authSession?.access_token) return cloudDataRequest(path, options);
  // FIX: the deployed site has no /api backend, so every server call used to hang until the
  // browser gave up (~20s on Run history). Cap it at 5s and fall back to localStorage.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  let response;
  try { response = await fetch(path, { signal: controller.signal, ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } }); }
  finally { clearTimeout(timer); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}
function authHeaders(token = authSession?.access_token) { return { apikey: supabaseConfig.anonKey, Authorization: `Bearer ${token || supabaseConfig.anonKey}`, 'Content-Type': 'application/json' }; }
async function authFetch(path, body, token) {
  const response = await fetch(`${supabaseConfig.url}${path}`, { method: 'POST', headers: authHeaders(token), body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.msg || result.message || result.error_description || result.error || `Authentication failed (${response.status})`);
  return result;
}
function saveSession(session) {
  authSession = session;
  if (session) {
    session.expires_at = session.expires_at || Math.floor(Date.now()/1000) + (session.expires_in || 3600);
    localStorage.setItem('sunshift-auth-session', JSON.stringify(session));
  } else localStorage.removeItem('sunshift-auth-session');
}
async function validAccessToken() {
  if (!authSession?.access_token) throw new Error('Sign in to use cloud storage.');
  if (authSession.expires_at > Math.floor(Date.now()/1000) + 60) return authSession.access_token;
  const refreshed = await authFetch('/auth/v1/token?grant_type=refresh_token', { refresh_token: authSession.refresh_token });
  saveSession(refreshed);
  return authSession.access_token;
}
async function cloudRest(table, query = '', options = {}) {
  const token = await validAccessToken();
  const response = await fetch(`${supabaseConfig.url}/rest/v1/${table}${query}`, { ...options, headers: { ...authHeaders(token), ...(options.headers || {}) } });
  const body = await response.json().catch(() => null);
  if (response.status === 401) { saveSession(null); signedInUser = null; updateAccountUi(); }
  if (!response.ok) throw new Error(body?.message || body?.hint || `Cloud storage failed (${response.status})`);
  return body;
}
async function cloudDataRequest(path, options = {}) {
  const method = options.method || 'GET';
  if (path === '/api/health') return { ok: true };
  if (path === '/api/settings' && method === 'GET') {
    const rows = await cloudRest('home_settings', `?select=settings&user_id=eq.${signedInUser.id}&limit=1`);
    return rows.length ? { configured: true, settings: rows[0].settings } : { configured: false, settings };
  }
  if (path === '/api/settings' && method === 'PUT') {
    const payload = JSON.parse(options.body || '{}');
    const rows = await cloudRest('home_settings', '?on_conflict=user_id', { method: 'POST', body: JSON.stringify({ user_id: signedInUser.id, settings: payload }), headers: { Prefer: 'resolution=merge-duplicates,return=representation' } });
    return { configured: true, settings: rows[0]?.settings || payload };
  }
  if (path.startsWith('/api/schedule')) {
    if (method === 'GET') return { items: await cloudRest('appliance_schedule', `?select=id,name,time,kwh,date,created_at&user_id=eq.${signedInUser.id}&order=date.asc,created_at.asc`) };
    if (method === 'POST') {
      const item = JSON.parse(options.body || '{}');
      const rows = await cloudRest('appliance_schedule', '?on_conflict=user_id,name,date,time', { method: 'POST', body: JSON.stringify({ user_id: signedInUser.id, name: item.name, time: item.time, kwh: Number(item.kwh) || applianceEnergy(item.name), date: item.date || localDateStamp() }), headers: { Prefer: 'resolution=ignore-duplicates,return=representation' } });
      return { item: rows[0] || null, created: rows.length > 0, items: await cloudDataRequest('/api/schedule') };
    }
    if (method === 'DELETE') {
      const id = decodeURIComponent(path.split('/').pop());
      await cloudRest('appliance_schedule', `?id=eq.${encodeURIComponent(id)}&user_id=eq.${signedInUser.id}`, { method: 'DELETE' });
      return { items: await cloudDataRequest('/api/schedule') };
    }
  }
  if (path.startsWith('/api/runs')) {
    if (method === 'GET') {
      const limit = Math.min(100, Math.max(1, Number(new URLSearchParams(path.split('?')[1] || '').get('limit')) || 100));
      const rows = await cloudRest('energy_runs', `?select=record&user_id=eq.${signedInUser.id}&order=created_at.desc&limit=${limit}`);
      return { items: rows.map(row => row.record) };
    }
    if (method === 'POST') {
      const record = JSON.parse(options.body || '{}');
      record.id ||= crypto.randomUUID(); record.timestamp ||= new Date().toISOString();
      await cloudRest('energy_runs', '', { method: 'POST', body: JSON.stringify({ user_id: signedInUser.id, record }), headers: { Prefer: 'return=minimal' } });
      return { item: record };
    }
  }
  throw new Error('Unsupported cloud data request.');
}
function updateAccountUi(message = '') {
  const button = document.getElementById('account-button');
  const status = document.getElementById('account-status');
  const form = document.getElementById('account-form');
  const signed = document.getElementById('account-signed-in');
  if (!button) return;
  button.textContent = signedInUser ? (signedInUser.email.split('@')[0] || 'Account') : 'Sign in';
  button.setAttribute('aria-label', signedInUser ? `Account: ${signedInUser.email}` : 'Sign in to sync your home data');
  if (status) status.textContent = message || (signedInUser ? `Signed in as ${signedInUser.email}. Home settings, reminders, and estimates sync to your account.` : supabaseConfig?.configured ? 'Sign in to sync your home profile and saved estimates across devices.' : 'Cloud sign-in is not configured yet. You can still use this browser locally.');
  if (form) form.hidden = Boolean(signedInUser);
  if (signed) signed.hidden = !signedInUser;
}
async function bootAccountBackend() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Account backend is not configured.');
    supabaseConfig = await response.json();
    if (!supabaseConfig.configured) throw new Error('Account backend is not configured.');
  } catch {
    supabaseConfig = null; setServerStatus(false); updateAccountUi(); return;
  }
  if (!authSession?.access_token) { setServerStatus(false); setText('server-status', 'Sign in to sync'); updateAccountUi(); return; }
  try {
    const token = await validAccessToken();
    const response = await fetch(`${supabaseConfig.url}/auth/v1/user`, { headers: authHeaders(token) });
    if (!response.ok) throw new Error('Your session expired. Please sign in again.');
    signedInUser = await response.json();
    if (localStorage.getItem('sunshift-data-owner') && localStorage.getItem('sunshift-data-owner') !== signedInUser.id) {
      Object.assign(settings, DEFAULTS); applianceSchedule = []; savedRuns = [];
    }
    updateAccountUi();
    await hydrateServerState();
  } catch {
    saveSession(null); signedInUser = null; setServerStatus(false); setText('server-status', 'Sign in to sync'); updateAccountUi('Your session expired. Sign in again to sync your home data.');
  }
}
function setServerStatus(online) {
  backendOnline = online;
  setText('server-status', online ? 'Connected · saved' : signedInUser ? 'Account sync unavailable' : 'Local only');
}
const sectionCopy = {
  'live-flow': 'See how solar power is split between home use, the battery and the grid. Values use the selected sample scenario.',
  forecast: 'Use the latest weather forecast to estimate hourly solar power and total generation for the next seven days.',
  battery: 'The dispatch model charges from surplus solar and discharges above your reserve when the home needs energy.',
  appliances: 'Compare appliance start times against estimated solar surplus and your preferred window.',
  'roof-estimator': 'Trace a roof outline to estimate usable area, panel capacity and monthly generation. The drawing and results are illustrative, not satellite or AI analysis.',
  'solar-calculator': 'Estimate a system size, bill offset, simple payback and indicative costs from your monthly bill and electricity rate.',
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
  let synced = false;
  try {
    await apiRequest('/api/health');
    const remote = await apiRequest('/api/settings');
    if (remote.configured) Object.assign(settings, remote.settings);
    else {
      const owner = localStorage.getItem('sunshift-data-owner');
      if (!owner && legacySettings) Object.assign(settings, legacySettings);
      const stored = await apiRequest('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
      Object.assign(settings, stored.settings);
    }
    const remoteSchedule = await apiRequest('/api/schedule');
    const localOwner = localStorage.getItem('sunshift-data-owner');
    if (!remoteSchedule.items.length && applianceSchedule.length && !localOwner) {
      for (const item of applianceSchedule) {
        try { await apiRequest('/api/schedule', { method: 'POST', body: JSON.stringify({ name: item.name, time: item.time, date: item.date, kwh: Number(item.kwh) || applianceEnergy(item.name) }) }); } catch { /* ignore stale browser-only entries */ }
      }
      applianceSchedule = (await apiRequest('/api/schedule')).items;
    } else applianceSchedule = remoteSchedule.items;
    const remoteRuns = (await apiRequest('/api/runs?limit=100')).items;
    if (!remoteRuns.length && savedRuns.length && !localOwner) {
      for (const item of savedRuns.slice(0, 100).reverse()) { try { await apiRequest('/api/runs', { method: 'POST', body: JSON.stringify(item) }); } catch { /* keep syncing remaining history */ } }
      savedRuns = (await apiRequest('/api/runs?limit=100')).items;
    } else savedRuns = remoteRuns;
    localStorage.setItem('sunshift-settings', JSON.stringify(settings));
    localStorage.setItem('sunshift-schedule', JSON.stringify(applianceSchedule));
    localStorage.setItem('sunshift-runs', JSON.stringify(savedRuns));
    localStorage.setItem('sunshift-data-owner', signedInUser.id);
    setServerStatus(true);
    synced = true;
  } catch (error) {
    setServerStatus(false);
    updateAccountUi(`Signed in, but cloud data could not load: ${error.message}. Check the Supabase setup.`);
  }
  setText('home-location', settings.location);
  updateDashboard();
  refreshDashboardForecast();
  if (currentView === 'settings') renderView('settings');
  if (currentView === 'history') renderView('history');
  return synced;
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
  setText('flow-battery', charging > 0 ? `+${charging.toFixed(1)}` : (current.discharge || 0) > 0.005 ? `−${(current.discharge || 0).toFixed(1)}` : '0.0');
  setText('battery-flow-label', charging > 0 ? 'Charging' : (current.discharge || 0) > 0.005 ? 'Discharging' : 'Idle');
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
  scenario.batteryAvailable = content.querySelector('#battery-toggle') ? Boolean(content.querySelector('#battery-toggle').checked) : scenario.batteryAvailable;
  scenario.loadFactor = Number(content.querySelector('#demand-select')?.value || scenario.loadFactor);
  scenario.tariff = Number(content.querySelector('#tariff-input')?.value || settings.tariff);
  const effSettings = { ...settings, tariff: scenario.tariff };
  latestResults = simulate({ settings: effSettings, sky: scenario.sky, outage: scenario.outage, loadFactor: scenario.loadFactor, batteryAvailable: scenario.batteryAvailable });
  updateDashboard(latestResults);
}

function renderScenario() {
  content.innerHTML = `<div class="sim-controls">
    <label>Sky conditions <select id="sky-select"><option value="clear" ${scenario.sky === 'clear' ? 'selected' : ''}>Clear day</option><option value="cloudy" ${scenario.sky === 'cloudy' ? 'selected' : ''}>Cloudy day · reduced solar</option><option value="rain" ${scenario.sky === 'rain' ? 'selected' : ''}>Rain · heavily reduced solar</option></select></label>
    <label>Household demand <select id="demand-select"><option value="1" ${scenario.loadFactor === 1 ? 'selected' : ''}>Typical day</option><option value="1.35" ${scenario.loadFactor > 1 ? 'selected' : ''}>High demand · +35%</option></select></label>
    <label>Grid tariff (₹/kWh) <input id="tariff-input" type="number" min="4" max="20" step="1" value="${scenario.tariff ?? settings.tariff}"></label>
    <label class="check-label">Grid outage <input class="scenario-toggle" id="outage-toggle" type="checkbox" ${scenario.outage ? 'checked' : ''}><span>Prioritize essential loads and battery reserve</span></label>
    <label class="check-label">Battery available <input class="scenario-toggle" id="battery-toggle" type="checkbox" ${scenario.batteryAvailable ? 'checked' : ''}><span>Untick to simulate a battery fault / unavailable battery</span></label>
    <button id="run-scenario">Recalculate dispatch</button>
  </div><div class="simulation-results" id="scenario-result"></div>`;
  content.querySelector('#run-scenario').onclick = async () => {
    readScenario();
    renderScenarioSummary();
    const saved = await persistRun({ type: 'scenario', title: `${scenario.sky === 'cloudy' ? 'Cloudy' : 'Clear'} day · ${scenario.outage ? 'grid outage' : 'grid available'}`, date: localDateStamp(), sky: scenario.sky, outage: scenario.outage, loadFactor: scenario.loadFactor, batteryAvailable: scenario.batteryAvailable, location: settings.location, solarKwh: latestResults.solarTotal, homeKwh: latestResults.loadTotal, gridImportKwh: latestResults.imported, estimatedCost: latestResults.imported * (scenario.tariff ?? settings.tariff), batteryPct: Math.round(latestResults.batteryNow / settings.batteryKwh * 100) });
    toastMsg(saved ? 'Dispatch saved to run history.' : 'Dispatch saved in this browser; server unavailable.');
  };
  renderScenarioSummary();
}

function renderScenarioSummary() {
  const result = content.querySelector('#scenario-result');
  if (!result) return;
  const tariff = scenario.tariff ?? settings.tariff;
  const outageCopy = scenario.outage ? `Grid unavailable. Estimated essential load not served: ${latestResults.unserved.toFixed(1)} kWh; flexible load shed: ${latestResults.shed.toFixed(1)} kWh.` : `Estimated grid imports: ${latestResults.imported.toFixed(1)} kWh. Solar self-sufficiency: ${Math.round(latestResults.selfSufficiency)}%.`;
  // Baseline uses the SAME tariff so the comparison isolates weather/demand/outage/battery, not price.
  const baseline = simulate({ settings: { ...settings, tariff }, sky: 'clear', outage: false, loadFactor: 1, batteryAvailable: true });
  const d = (a, b) => `${a >= b ? '+' : '−'}${Math.abs(a - b).toFixed(1)}`;
  const row = (label, unit, cur, base) => `<div class="plan-table-row"><span>${label}</span><span>${cur.toFixed(1)} ${unit}</span><span>${base.toFixed(1)} ${unit}</span><span>${d(cur, base)} ${unit}</span></div>`;
  const recs = [];
  if (latestResults.imported > baseline.imported + 0.5) recs.push(`Grid imports rise by ${(latestResults.imported - baseline.imported).toFixed(1)} kWh vs baseline — shift flexible loads toward the solar peak (around 1 PM in this sample model) and let the battery discharge only above its ${settings.reserve}% reserve.`);
  if (!scenario.batteryAvailable) recs.push('With the battery unavailable, no solar can be stored: surplus is exported and evening demand comes from the grid. This is why imports rise even though solar generation is unchanged.');
  if (scenario.outage && latestResults.unserved > 0) recs.push(`In an outage, ${(latestResults.unserved).toFixed(1)} kWh of essential load is unserved — raising the protected reserve or shedding flexible loads earlier would reduce this, at the cost of less evening battery use on normal days.`);
  if (latestResults.batteryEndPct < settings.reserve + 10) recs.push(`The battery ends near its reserve (${Math.round(latestResults.batteryEndPct)}%). Charge from surplus solar before the low-generation period instead of exporting it.`);
  if (!recs.length) recs.push('This scenario stays close to baseline: solar plus battery covers most demand, so no load shift is needed.');
  result.innerHTML = `<div class="result-grid"><div><small>Solar generated</small><b>${latestResults.solarTotal.toFixed(1)} kWh</b></div><div><small>Home demand</small><b>${latestResults.loadTotal.toFixed(1)} kWh</b></div><div><small>Battery at 1 PM</small><b>${Math.round(latestResults.batteryNow / settings.batteryKwh * 100)}%</b></div><div><small>Solar self-sufficiency</small><b>${Math.round(latestResults.selfSufficiency)}%</b></div></div><p>${outageCopy}</p>
  <div class="plan-table"><div class="plan-table-row plan-table-head"><span>BEFORE / AFTER (vs clear, typical, grid on, battery on)</span><span>SCENARIO</span><span>BASELINE</span><span>CHANGE</span></div>${row('Solar generated', 'kWh', latestResults.solarTotal, baseline.solarTotal)}${row('Grid imported', 'kWh', latestResults.imported, baseline.imported)}${row('Grid cost', '₹', latestResults.imported * tariff, baseline.imported * tariff)}${row('Battery at end', '%', latestResults.batteryEndPct, baseline.batteryEndPct)}${row('Solar self-sufficiency', '%', latestResults.selfSufficiency, baseline.selfSufficiency)}${row('CO₂ avoided', 'kg', latestResults.co2, baseline.co2)}</div>
  <div class="forecast-method"><b>Why — heuristic recommendations (rule-based, not machine learning)</b><p>${recs.map(r => `• ${r}`).join('<br>')}</p><small>Sample dispatch, 6 AM–8 PM only; it is not a full 24-hour day and not meter data. Solar utilisation (corrected): ${Math.round(latestResults.solarUtilization)}% of generated solar used at home or stored.</small></div>`;
}

function renderAppliances() {
  const savedSchedule = applianceSchedule;
  const selectedDate = localDateStamp();
  const catalog = [
    { name:'Washing machine', kwh:0.8 }, { name:'Dishwasher', kwh:1.2 }, { name:'Water heater', kwh:2.0 }, { name:'EV charger', kwh:7.0 },
    { name:'Microwave oven', kwh:0.15 }, { name:'Electric kettle', kwh:0.12 }, { name:'Induction cooktop', kwh:1.5 }, { name:'Rice cooker', kwh:0.6 },
    { name:'Air conditioner', kwh:1.2 }, { name:'Ceiling fan', kwh:0.06 }, { name:'Clothes iron', kwh:0.8 }, { name:'Water pump', kwh:0.75 },
    { name:'Laptop or computer', kwh:0.12 }, { name:'Vacuum cleaner', kwh:0.6 }
  ];
  let selectedName = 'Washing machine';
  let savingReminder = false;
  content.innerHTML = `<div class="sim-controls"><label>Search or choose appliance <input id="appliance-search" type="search" list="appliance-options" value="${selectedName}" placeholder="Type an appliance name" autocomplete="off" aria-describedby="appliance-units"><datalist id="appliance-options">${catalog.map(item => `<option value="${item.name}" label="${item.kwh} kWh estimate per use"></option>`).join('')}</datalist><small id="appliance-units">14 choices · energy figures are estimates per scheduled use.</small></label>
    <label>Preferred start <input id="preferred-time" type="range" min="8" max="17" value="${preferredHour}"><output id="time-output">${formatTime(preferredHour)}</output></label><label>Plan date <input id="appliance-date" type="date" value="${selectedDate}" min="${selectedDate}"></label></div>
    <div class="planner-results" id="planner-results"></div><button id="remind-button">Add best time to selected date</button><p id="reminder-status" class="reminder-status" aria-live="polite"></p>
    <h2 class="schedule-heading">Saved appliance reminders</h2><div class="schedule-list" id="schedule-list"></div>`;
  if (applianceSchedule.length >= 50) content.querySelector('#reminder-status').textContent = 'Reminder limit reached (50). Remove one before adding another.';
  const updateOptions = () => {
    const appliance = catalog.find(item => item.name.toLowerCase() === content.querySelector('#appliance-search').value.trim().toLowerCase());
    selectedName = appliance?.name || '';
    const addButton = content.querySelector('#remind-button');
    addButton.disabled = savingReminder || !appliance || applianceSchedule.length >= 50;
    if (!appliance) {
      content.querySelector('#planner-results').innerHTML = '<p>Choose one of the listed appliances to compare its schedule.</p>';
      return null;
    }
    const kwh = appliance.kwh;
    const results = bestApplianceTimes({ settings, sky: scenario.sky, applianceKwh: kwh, preferredHour });
    const params = { settings, ...scenario };
    const baseline = simulate(params);
    const cmp = hour => simulate({ ...params, applianceHour: hour, applianceKwh: kwh });
    const variants = [{ label: `Best window ${formatTime(results[0].hour)}`, hour: results[0].hour }, { label: `Preferred ${formatTime(preferredHour)}`, hour: preferredHour }, { label: 'Evening 7 PM', hour: 19 }].map(item => ({ ...item, result: cmp(item.hour) }));
    const dischargeTotal = result => result.rows.reduce((sum, row) => sum + row.discharge, 0);
    const directAt = (result, hour) => { const row = result.rows.find(item => item.hour === hour); return row ? Math.min(row.solar, row.load) : 0; };
    const rows = variants.map(({label, hour, result}) => `<div class="plan-table-row"><span>${label}</span><span>${(result.imported - baseline.imported).toFixed(2)} kWh</span><span>${(directAt(result, hour) - directAt(baseline, hour)).toFixed(2)} kWh</span><span>${(dischargeTotal(result) - dischargeTotal(baseline)).toFixed(2)} kWh</span><span>${result.exported.toFixed(2)} kWh</span><span>${money(result.imported * (scenario.tariff ?? settings.tariff))}</span><span>${Math.round(result.batteryEndPct)}%</span></div>`).join('');
    content.querySelector('#planner-results').innerHTML = `<div class="planner-best"><small>BEST SOLAR WINDOW</small><b>${formatTime(results[0].hour)}</b><span>${Math.round(results[0].solarCovered * 100)}% estimated solar coverage · ${money(results[0].savings)} value</span></div><div class="planner-alt"><small>Other good options</small>${results.slice(1).map(r => `<span>${formatTime(r.hour)} <b>${Math.round(r.solarCovered * 100)}%</b></span>`).join('')}</div><div class="appliance-comparison"><p>Whole-day system results compared with the same scenario and no added appliance. Grid import can stay unchanged when the appliance uses solar that would otherwise be exported.</p><div class="plan-table"><div class="plan-table-row plan-table-head"><span>SCHEDULE</span><span>GRID CHANGE</span><span>SOLAR USED AT START Δ</span><span>BATTERY USED Δ</span><span>EXPORTED</span><span>GRID COST</span><span>BATTERY END</span></div>${rows}</div></div>`;
    return { kwh, name:appliance.name, result: results[0], date: content.querySelector('#appliance-date').value };
  };
  content.querySelector('#preferred-time').oninput = e => { preferredHour = Number(e.target.value); content.querySelector('#time-output').textContent = formatTime(preferredHour); updateOptions(); };
  content.querySelector('#appliance-search').oninput = updateOptions;
  content.querySelector('#remind-button').onclick = async () => {
    const choice = updateOptions();
    if (!choice || savingReminder) return;
    const name = choice.name;
    const draft = { name, time: formatTime(choice.result.hour), kwh: choice.kwh, date: choice.date };
    const duplicate = applianceSchedule.some(item => item.name === draft.name && (item.date || localDateStamp()) === draft.date && item.time === draft.time);
    if (duplicate) { content.querySelector('#reminder-status').textContent = 'That reminder is already saved for this date and time.'; toastMsg('Duplicate reminder blocked.'); return; }
    if (applianceSchedule.length >= 50) { content.querySelector('#reminder-status').textContent = 'Reminder limit reached (50). Remove one before adding another.'; return; }
    savingReminder = true;
    const addButton = content.querySelector('#remind-button'); addButton.disabled = true; addButton.textContent = 'Saving…';
    try {
      const response = await apiRequest('/api/schedule', { method: 'POST', body: JSON.stringify(draft) });
      if (response.created === false) { applianceSchedule = response.items; drawSchedule(applianceSchedule); content.querySelector('#reminder-status').textContent = 'That reminder already exists in your account database.'; toastMsg('Duplicate reminder blocked.'); return; }
      applianceSchedule = response.items;
      setServerStatus(true);
      content.querySelector('#reminder-status').textContent = signedInUser ? 'Reminder added to your account database.' : 'Reminder saved on this device. Sign in to sync it across devices.';
      toastMsg(signedInUser ? 'Reminder added to your account database.' : 'Reminder saved on this device.');
    } catch (error) {
      if (signedInUser) { setServerStatus(false); content.querySelector('#reminder-status').textContent = error.message.includes('Reminder limit reached') ? error.message : 'Could not save this reminder to the account database. Check your connection and try again.'; toastMsg('Reminder was not added to the database.'); return; }
      applianceSchedule = [...applianceSchedule, { ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString() }];
      localStorage.setItem('sunshift-schedule', JSON.stringify(applianceSchedule));
      content.querySelector('#reminder-status').textContent = 'Reminder saved on this device only; account database is unavailable.';
      toastMsg('Reminder saved on this device only.');
    } finally {
      savingReminder = false; addButton.textContent = 'Add best time to selected date';
      if (content.contains(addButton)) updateOptions();
    }
    drawSchedule(applianceSchedule);
  };
  function drawSchedule(items) {
    const list = content.querySelector('#schedule-list');
    const date = content.querySelector('#appliance-date').value;
    const shown = items.map((item, index) => ({ ...item, index })).filter(item => (item.date || localDateStamp()) === date);
    list.innerHTML = shown.length ? shown.map(item => `<div class="appliance-row"><span>✓</span><span>${item.name}<small>${item.date || 'Today'}</small></span><strong>${item.time}</strong><button class="remove-plan" data-remove="${item.index}" data-id="${item.id}" aria-label="Remove ${item.name}">×</button></div>`).join('') : '<small>No appliance reminders saved for this date.</small>';
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
  content.querySelector('#appliance-date').onchange = () => drawSchedule(applianceSchedule);
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
    <div class="forecast-kpis"><article><small>${day.date === today ? 'TODAY’S ESTIMATED GENERATION' : 'SELECTED DAY ESTIMATED GENERATION'}</small><b>${day.productionKwh.toFixed(1)} <span>kWh</span></b><small>From ${settings.solarKw.toFixed(1)} kWp of panels</small></article><article><small>PEAK SOLAR OUTPUT</small><b>${(peakHour?.powerKw ?? 0).toFixed(2)} <span>kW</span></b><small>${peakHour ? `Around ${formatForecastHour(peakHour.time)}` : 'No daylight production forecast'}</small></article><article><small>WEATHER</small><b>${weatherDescription(day.weatherCode)}</b><small>${Math.round(day.tempLow ?? 0)}°–${Math.round(day.tempHigh ?? 0)}°C · rain chance ${Math.round(day.rainChance ?? 0)}%</small></article></div>
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
  // FIX: reminders saved 'for today' used to leak into every future day's plan (e.g. a 1 PM
  // water-heater spike on Sun 1 Nov). Only apply reminders dated for the planned day;
  // undated legacy reminders apply only to today.
  const schedule = applianceSchedule.filter(item => item.date ? item.date === day.date : day.date === localDateStamp());
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
  const plan = simulateForecastDay(tomorrow, settings, applianceSchedule.filter(item => item.date === tomorrow.date));
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
    content.innerHTML = `<div class="history-empty"><span>↗</span><h2>No saved calculations yet</h2><p>Run a weather or grid scenario, or save a day-ahead plan, and it will appear here with its assumptions and results.</p><button id="history-run-scenario">Run a scenario</button><button class="secondary-action" id="history-plan">Open day-ahead plan</button><small>Settings and runs are stored in this browser on this device.</small></div>`;
    content.querySelector('#history-run-scenario').onclick = () => setView('scenarios');
    content.querySelector('#history-plan').onclick = () => setView('energy-plan');
    return;
  }
  const totalSolar = savedRuns.reduce((sum, run) => sum + run.solarKwh, 0);
  const averageGrid = savedRuns.reduce((sum, run) => sum + run.gridImportKwh, 0) / savedRuns.length;
  content.innerHTML = `<div class="history-summary"><div><small>SAVED CALCULATIONS</small><b>${savedRuns.length}</b></div><div><small>TOTAL FORECAST SOLAR</small><b>${totalSolar.toFixed(1)} kWh</b></div><div><small>AVERAGE GRID IMPORT</small><b>${averageGrid.toFixed(1)} kWh</b></div></div>
    <div class="history-table"><div class="history-row history-head"><span>RUN</span><span>WEATHER / MODE</span><span>SOLAR</span><span>HOME</span><span>GRID</span><span>GRID COST</span></div>${savedRuns.map(run => `<div class="history-row history-data-row"><span><b>${new Date(run.timestamp).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</b><small>${run.location || settings.location}</small></span><span>${run.title}<small>${run.type === 'day-ahead' ? `Forecast · ${run.date}` : `${run.outage ? 'Outage' : 'Grid available'} · ${run.loadFactor > 1 ? 'High demand' : 'Typical demand'}`}</small></span><span>${run.solarKwh.toFixed(1)} kWh</span><span>${run.homeKwh.toFixed(1)} kWh</span><span>${run.gridImportKwh.toFixed(1)} kWh</span><strong>${money(run.estimatedCost)}</strong></div>`).join('')}</div>
    <div class="history-footer"><small>Saved in this browser on this device. Values are forecasts or scenario calculations, not measured meter history.</small></div>`;
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
  const fields = [['solarKw','Solar system size','0.5','10','0.1',' kWp'], ['batteryKwh','Battery capacity','2','15','0.5',' kWh'], ['tariff','Grid tariff','4','20','1',' ₹/kWh'], ['reserve','Battery reserve','10','50','1','%'], ['panelTilt','Panel tilt','0','60','1','°'], ['panelAzimuth','Panel direction · 0° is south','-180','180','15','°']];
  const locations = [{ name:'Pune, Maharashtra', lat:18.5204, lon:73.8567 },{ name:'Mumbai, Maharashtra', lat:19.0760, lon:72.8777 },{ name:'Delhi, NCR', lat:28.6139, lon:77.2090 },{ name:'Bengaluru, Karnataka', lat:12.9716, lon:77.5946 },{ name:'Hyderabad, Telangana', lat:17.3850, lon:78.4867 },{ name:'Chennai, Tamil Nadu', lat:13.0827, lon:80.2707 },{ name:'Kolkata, West Bengal', lat:22.5726, lon:88.3639 }];
  content.innerHTML = `<div class="settings-page-group"><h2>Home profile</h2><p>Set your location and enter your typical daily electricity use to personalize the household demand estimate.</p><div class="sim-controls"><label>Forecast location<select id="setting-location">${locations.map(item => `<option value="${item.name}" ${settings.location===item.name?'selected':''}>${item.name}</option>`).join('')}</select></label><label>Average daily home use<span class="range-control"><input type="range" id="setting-dailyUseKwh" min="3" max="60" step="0.25" value="${settings.dailyUseKwh}"><output id="output-dailyUseKwh">${Number(settings.dailyUseKwh).toFixed(2)} kWh/day</output></span></label></div></div><div class="settings-page-group"><h2>Solar and battery</h2><p>These settings affect solar generation, storage, and cost estimates.</p><div class="sim-controls">${fields.map(([id,label,min,max,step,unit]) => `<label>${label}<span class="range-control"><input type="range" id="setting-${id}" min="${min}" max="${max}" step="${step}" value="${settings[id]}"><output id="output-${id}">${settings[id]}${unit}</output></span></label>`).join('')}</div></div><button id="save-settings">Save home settings</button><p class="simulation-footnote">${signedInUser ? 'Saved to your SunShift account and synced across devices.' : 'Saved in this browser on this device. Sign in to sync your home settings across devices.'} Demand uses your typical daily kWh as a personalized estimate over a generic hourly shape. This is not a meter reading.</p>`;
  for (const [id,,min,max,step,unit] of fields) {
    const range = content.querySelector(`#setting-${id}`);
    range.oninput = () => { content.querySelector(`#output-${id}`).textContent = `${range.value}${unit}`; };
  }
  content.querySelector('#setting-dailyUseKwh').oninput = event => { content.querySelector('#output-dailyUseKwh').textContent = `${Number(event.target.value).toFixed(2)} kWh/day`; };
  content.querySelector('#save-settings').onclick = async () => {
    for (const [id] of fields) settings[id] = Number(content.querySelector(`#setting-${id}`).value);
    settings.dailyUseKwh = Number(content.querySelector('#setting-dailyUseKwh').value);
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
    toastMsg(savedOnServer ? (signedInUser ? 'Home settings synced to your account.' : 'Home settings saved.') : 'Cloud save failed; home settings saved in this browser.');
  };
}

function renderView(key) {
  title.textContent = key === 'forecast' ? 'Weather & solar forecast' : viewLabels[key] || key;
  copy.textContent = sectionCopy[key] || sectionCopy['live-flow'];
  content.innerHTML = '';
  if (key === 'scenarios') renderScenario();
  else if (key === 'appliances') renderAppliances();
  else if (key === 'roof-estimator') renderRooftopEstimator(content, applySolarCapacity, settings);
  else if (key === 'solar-calculator') renderSolarSavingsCalculator(content, applySolarCapacity, settings);
  else if (key === 'settings') renderSettings();
  else if (key === 'history') renderHistory();
  else if (key === 'reports') renderReports();
  else if (key === 'forecast') loadLiveForecast();
  else if (key === 'energy-plan') loadEnergyPlan();
  else if (key === 'battery') {
    const battRows = latestResults.rows.map(r => `<div class="plan-table-row"><span>${formatForecastHour(`${String(r.hour).padStart(2,'0')}:00`)}</span><span>${r.battery.toFixed(0)}%</span><span>${r.charge > 0 ? `+${r.charge.toFixed(2)} kWh` : r.discharge > 0 ? `−${r.discharge.toFixed(2)} kWh` : '—'}</span><span>${r.grid.toFixed(2)} kWh</span></div>`).join('');
    content.innerHTML = `<div class="result-grid"><div><small>Stored at 1 PM</small><b>${latestResults.batteryNow.toFixed(1)} kWh</b></div><div><small>Capacity</small><b>${settings.batteryKwh.toFixed(1)} kWh</b></div><div><small>Protected reserve</small><b>${settings.reserve}% (${(settings.batteryKwh * settings.reserve / 100).toFixed(1)} kWh)</b></div><div><small>End of sample day</small><b>${latestResults.batteryEnd.toFixed(1)} kWh (${Math.round(latestResults.batteryEndPct)}%)</b></div></div><p>Battery charges from surplus solar (94% efficiency) and discharges above the reserve (92% efficiency), capped at ${(settings.batteryKwh * 0.5).toFixed(1)} kW per hour in this model. It never discharges below the protected reserve on a normal day.</p><div class="plan-table"><div class="plan-table-row plan-table-head"><span>TIME</span><span>BATTERY</span><span>CHARGE / DISCHARGE</span><span>GRID IMPORT</span></div>${battRows}</div><small class="simulation-footnote">Sample dispatch 6 AM–8 PM from the Scenarios settings, not live inverter data.</small>`;
  } else if (key === 'savings') {
    const fcDay = liveForecast ? (liveForecast.days.find(x => x.date > localDateStamp()) || liveForecast.days[0]) : null;
    const fcPlan = fcDay ? simulateForecastDay(fcDay, settings, applianceSchedule.filter(item => item.date === fcDay.date)) : null;
    const fcBlock = fcPlan ? `<div class="result-grid" style="margin-top:14px"><div><small>Next-day forecast value</small><b>${money(fcPlan.savings)}</b></div><div><small>Next-day grid cost</small><b>${money(fcPlan.projectedGridCost)}</b></div><div><small>Next-day CO₂ avoided</small><b>${fcPlan.co2Avoided.toFixed(1)} kg</b></div></div><p>From the live Open-Meteo forecast for ${localDateLabel(fcDay.date, { weekday: 'short', day: 'numeric', month: 'short' })} (${fcPlan.solarTotal.toFixed(1)} kWh solar, ${fcPlan.imported.toFixed(1)} kWh grid import). This and the sample figures below are different models — do not add them together.</p>` : '<p>No live forecast loaded yet — open Forecast first for next-day figures.</p>';
    content.innerHTML = `<div class="result-grid"><div><small>Sample dispatch — today</small><b>${money(latestResults.savings)}</b></div><div><small>Sample monthly run rate</small><b>${money(latestResults.savings * 30)}</b></div><div><small>Sample CO₂ avoided</small><b>${latestResults.co2.toFixed(1)} kg</b></div></div><p>Sample estimate (6 AM–8 PM dispatch) = solar energy used directly or stored × your saved tariff of ${money(settings.tariff)} per kWh. Monthly run rate is simply the sample day × 30, not a bill forecast.</p>${fcBlock}`;
  } else if (key === 'live-flow') {
    const row = latestResults.rows.find(r => r.hour === 13) || latestResults.rows[7];
    const fcNote = liveForecast ? (() => { const d = liveForecast.days.find(x => x.date > localDateStamp()) || liveForecast.days[0]; const pk = d.hours.reduce((b, h) => h.powerKw > b.powerKw ? h : b, d.hours[0]); return `<p>Live forecast (Open-Meteo) for ${localDateLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}: peak ${pk.powerKw.toFixed(2)} kW around ${formatForecastHour(pk.time)}, ${d.productionKwh.toFixed(1)} kWh for the day. The numbers above are the sample dispatch at 1 PM and will differ — they are not the same model.</p>`; })() : '<p>No live forecast loaded yet — open Forecast to load one.</p>';
    content.innerHTML = `<div class="result-grid"><div><small>Solar at 1 PM</small><b>${row.solar.toFixed(1)} kW</b></div><div><small>Home demand</small><b>${row.load.toFixed(1)} kW</b></div><div><small>Battery power</small><b>${row.charge ? `+${row.charge.toFixed(1)} kW` : row.discharge ? `−${row.discharge.toFixed(1)} kW` : '0.0 kW'}</b></div><div><small>Grid import</small><b>${row.grid.toFixed(1)} kW</b></div></div><p>Flow is generated from the sample hourly dispatch model, not measured equipment.</p>${fcNote}`;
  }
}

async function applySolarCapacity(kw) {
  const size = Math.max(0.5, Math.min(10, Math.round(Number(kw) * 10) / 10));
  settings.solarKw = size;
  let cloudSaved = false;
  try {
    const result = await apiRequest('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
    Object.assign(settings, result.settings); cloudSaved = Boolean(signedInUser);
    if (signedInUser) setServerStatus(true);
  } catch { localStorage.setItem('sunshift-settings', JSON.stringify(settings)); if (signedInUser) setServerStatus(false); }
  latestResults = simulate({ settings, ...scenario });
  updateDashboard(latestResults);
  liveForecast = null;
  const limitNote = Number(kw) > 10 ? ' (limited to the app maximum of 10 kWp)' : Number(kw) < 0.5 ? ' (raised to the app minimum of 0.5 kWp)' : '';
  toastMsg(`Solar system size set to ${settings.solarKw.toFixed(1)} kWp${limitNote}${cloudSaved ? ' and synced to your account' : ' on this device'}.`);
  setView('energy-plan');
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
document.getElementById('home-picker').onclick = () => setView('settings');
const accountButton = document.getElementById('account-button');
const accountPanel = document.getElementById('account-panel');
accountButton.onclick = () => { accountPanel.hidden = !accountPanel.hidden; updateAccountUi(); };
document.getElementById('account-form').onsubmit = async event => {
  event.preventDefault();
  const email = document.getElementById('account-email').value.trim();
  const password = document.getElementById('account-password').value;
  const mode = event.submitter?.value || 'login';
  const status = document.getElementById('account-status');
  status.textContent = mode === 'signup' ? 'Creating your account…' : 'Signing in…';
  try {
    if (!supabaseConfig?.configured) throw new Error('Account storage is not configured for this deployment yet.');
    const result = await authFetch(mode === 'signup' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', { email, password });
    if (!result.access_token) { status.textContent = 'Check your email to confirm your account, then sign in here.'; return; }
    saveSession(result); signedInUser = result.user; updateAccountUi('Signed in. Loading your saved home data…');
    const synced = await hydrateServerState();
    updateAccountUi(synced ? 'Your account is connected. Home settings, reminders, and saved calculations sync across devices.' : 'You are signed in, but cloud data is unavailable. Check the backend setup and try again.');
    await renderView(currentView);
  } catch (error) { updateAccountUi(error.message); }
};
document.getElementById('account-logout').onclick = async () => {
  try { if (authSession?.access_token) await fetch(`${supabaseConfig.url}/auth/v1/logout?scope=local`, { method: 'POST', headers: authHeaders() }); } catch { /* local sign-out still clears this device's session */ }
  saveSession(null); signedInUser = null;
  for (const key of ['sunshift-settings','sunshift-schedule','sunshift-runs']) localStorage.removeItem(key);
  localStorage.removeItem('sunshift-data-owner');
  Object.assign(settings, DEFAULTS); applianceSchedule = []; savedRuns = []; latestResults = simulate({ settings, ...scenario });
  updateAccountUi('You are signed out. Your cloud data remains in your account and this browser will use local-only storage.');
  setServerStatus(false); setText('server-status', 'Sign in to sync'); updateDashboard(); await renderView(currentView);
};
document.addEventListener('click', event => { if (!accountPanel.hidden && !accountPanel.contains(event.target) && event.target !== accountButton) accountPanel.hidden = true; });
const notificationButton = document.querySelector('.icon-button[aria-label="Notifications"]');
notificationButton.title = 'Show energy planning alerts';
notificationButton.onclick = () => {
  let panel = document.getElementById('energy-alerts');
  if (panel) { panel.remove(); notificationButton.setAttribute('aria-expanded', 'false'); return; }
  const imported = latestResults.imported;
  const lowBattery = latestResults.batteryEndPct < Number(settings.reserve) + 5;
  const alertItems = [
    imported > 0 ? `The current scenario estimates ${imported.toFixed(1)} kWh of grid imports.` : 'The current scenario estimates no grid imports during its 6 AM–8 PM window.',
    lowBattery ? `Projected end-of-window battery charge is ${Math.round(latestResults.batteryEndPct)}%, close to your reserve.` : `Projected end-of-window battery charge is ${Math.round(latestResults.batteryEndPct)}%.`,
    liveForecast?.days?.[1] ? `${liveForecast.days[1].date}: weather-based solar estimate ${liveForecast.days[1].productionKwh.toFixed(1)} kWh.` : 'Weather forecast is loading; the solar estimate will appear when available.'
  ];
  panel = document.createElement('section'); panel.id = 'energy-alerts'; panel.className = 'energy-alerts'; panel.setAttribute('role', 'status');
  panel.innerHTML = `<b>Energy planning alerts</b><ul>${alertItems.map(item => `<li>${item}</li>`).join('')}</ul><button type="button" aria-label="Close alerts">Close</button>`;
  document.querySelector('.topbar').append(panel); notificationButton.setAttribute('aria-expanded', 'true');
  panel.querySelector('button').onclick = () => { panel.remove(); notificationButton.setAttribute('aria-expanded', 'false'); };
};
document.getElementById('page-back').onclick = e => { e.preventDefault(); setView('overview'); };
window.addEventListener('popstate', () => setView(location.hash.slice(1) || 'overview', false));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && currentView !== 'overview') history.back(); });
document.getElementById('schedule-button').onclick = () => setView('appliances');
const chart = document.getElementById('energy-chart');
chart.addEventListener('pointermove', e => {
  // FIX: the old handler placed the dot on a fake diagonal (y from mouse x), unrelated to any series.
  // Now it snaps to the nearest sample-dispatch hour and plots its actual solar value.
  const rect = chart.getBoundingClientRect();
  const rows = latestResults.rows;
  const idx = Math.max(0, Math.min(rows.length - 1, Math.round((e.clientX - rect.left) / rect.width * (rows.length - 1))));
  const x = idx / (rows.length - 1) * 760;
  const max = Math.max(3, ...rows.map(r => Math.max(r.solar, r.load, r.charge + r.discharge)));
  const y = 198 - rows[idx].solar / max * 174;
  document.getElementById('chart-cursor').setAttribute('x1', x);
  document.getElementById('chart-cursor').setAttribute('x2', x);
  document.getElementById('chart-dot').setAttribute('cx', x);
  document.getElementById('chart-dot').setAttribute('cy', y);
  chart.setAttribute('aria-label', `Energy chart: ${formatTime(rows[idx].hour)} solar ${rows[idx].solar.toFixed(2)} kW, home ${rows[idx].load.toFixed(2)} kW`);
});
updateDateHeader();
updateDashboard();
setView(location.hash.slice(1) || 'overview', false);
bootAccountBackend();
