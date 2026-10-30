import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataDir = join(root, 'data');
const stateFile = join(dataDir, 'sunshift.json');
const tempStateFile = join(dataDir, 'sunshift.tmp.json');
const settingsDefaults = { solarKw: 5.2, batteryKwh: 6, tariff: 8, reserve: 20, batteryStart: 0.42, panelTilt: 20, panelAzimuth: 0, location: 'Pune, Maharashtra', latitude: 18.5204, longitude: 73.8567 };
const validAppliances = new Set(['Washing machine', 'Dishwasher', 'Water heater', 'EV charger']);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8' };

await mkdir(dataDir, { recursive: true });
let state;
try {
  state = JSON.parse(await readFile(stateFile, 'utf8'));
  state.settings = { ...settingsDefaults, ...(state.settings || {}) };
  state.schedule = Array.isArray(state.schedule) ? state.schedule : [];
  state.runs = Array.isArray(state.runs) ? state.runs : [];
} catch {
  state = { settings: { ...settingsDefaults }, settingsConfiguredAt: null, schedule: [], runs: [] };
  await writeFile(stateFile, JSON.stringify(state, null, 2));
}
let writeQueue = Promise.resolve();

function persist() {
  const snapshot = JSON.stringify(state, null, 2);
  writeQueue = writeQueue.then(async () => {
    await writeFile(tempStateFile, snapshot, 'utf8');
    await rename(tempStateFile, stateFile);
  });
  return writeQueue;
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Request is too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function validateSettings(input) {
  const bounds = {
    solarKw: [2, 10], batteryKwh: [2, 15], tariff: [1, 50], reserve: [10, 50],
    batteryStart: [0.1, 1], panelTilt: [0, 60], panelAzimuth: [-180, 180], latitude: [-90, 90], longitude: [-180, 180]
  };
  const next = { ...state.settings };
  for (const [key, [min, max]] of Object.entries(bounds)) {
    if (input[key] === undefined) continue;
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid setting: ${key}`);
    next[key] = value;
  }
  if (input.location !== undefined) {
    const location = String(input.location).trim();
    if (!location || location.length > 80) throw new Error('Invalid setting: location');
    next.location = location;
  }
  return next;
}

function validateSchedule(input) {
  const name = String(input.name || '');
  const time = String(input.time || '');
  const kwh = Number(input.kwh);
  if (!validAppliances.has(name)) throw new Error('Choose a listed appliance');
  if (!/^\d{1,2}:00 (AM|PM)$/.test(time)) throw new Error('Use a valid appliance start time');
  if (!Number.isFinite(kwh) || kwh < 0.1 || kwh > 20) throw new Error('Appliance energy must be between 0.1 and 20 kWh');
  return { id: randomUUID(), name, time, kwh, createdAt: new Date().toISOString() };
}

function validateRun(input) {
  const numberFields = ['solarKwh', 'homeKwh', 'gridImportKwh', 'estimatedCost', 'batteryPct'];
  const record = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type: input.type === 'day-ahead' ? 'day-ahead' : 'scenario',
    title: String(input.title || 'Energy calculation').slice(0, 80),
    date: String(input.date || '').slice(0, 10),
    sky: input.sky === 'cloudy' ? 'cloudy' : 'clear',
    outage: Boolean(input.outage),
    loadFactor: Number(input.loadFactor) === 1.3 ? 1.3 : 1,
    location: String(input.location || 'Pune, Maharashtra').slice(0, 80)
  };
  for (const field of numberFields) {
    const value = Number(input[field]);
    if (!Number.isFinite(value) || value < 0 || value > 100000) throw new Error(`Invalid run value: ${field}`);
    record[field] = value;
  }
  return record;
}

async function handleApi(req, res, url) {
  const route = url.pathname;
  if (req.method === 'GET' && route === '/api/health') {
    return sendJson(res, 200, { ok: true, application: 'SunShift India', version: '1.0.0', serverTime: new Date().toISOString() });
  }
  if (req.method === 'GET' && route === '/api/settings') {
    return sendJson(res, 200, { settings: state.settings, configured: Boolean(state.settingsConfiguredAt), updatedAt: state.settingsConfiguredAt });
  }
  if (req.method === 'PUT' && route === '/api/settings') {
    const input = await readJson(req);
    state.settings = validateSettings(input);
    state.settingsConfiguredAt = new Date().toISOString();
    await persist();
    return sendJson(res, 200, { settings: state.settings, configured: true, updatedAt: state.settingsConfiguredAt });
  }
  if (req.method === 'GET' && route === '/api/schedule') return sendJson(res, 200, { items: state.schedule });
  if (req.method === 'POST' && route === '/api/schedule') {
    const item = validateSchedule(await readJson(req));
    state.schedule.push(item);
    await persist();
    return sendJson(res, 201, { item, items: state.schedule });
  }
  if (req.method === 'DELETE' && route.startsWith('/api/schedule/')) {
    const id = decodeURIComponent(route.slice('/api/schedule/'.length));
    state.schedule = state.schedule.filter(item => item.id !== id);
    await persist();
    return sendJson(res, 200, { items: state.schedule });
  }
  if (req.method === 'GET' && route === '/api/runs') {
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 30)));
    return sendJson(res, 200, { items: state.runs.slice(0, limit) });
  }
  if (req.method === 'POST' && route === '/api/runs') {
    const run = validateRun(await readJson(req));
    state.runs.unshift(run);
    state.runs = state.runs.slice(0, 200);
    await persist();
    return sendJson(res, 201, { item: run });
  }
  if (req.method === 'DELETE' && route === '/api/runs') {
    state.runs = [];
    await persist();
    return sendJson(res, 200, { items: [] });
  }
  return sendJson(res, 404, { error: 'API route not found' });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(`${root}${sep}`)) return res.writeHead(403).end('Forbidden');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch (error) {
    if (res.headersSent) return res.end();
    const status = error instanceof SyntaxError ? 400 : error.message?.startsWith('Invalid') || error.message?.startsWith('Choose') || error.message?.startsWith('Use') || error.message?.startsWith('Appliance') ? 400 : error.code === 'ENOENT' ? 404 : 500;
    if (req.url?.startsWith('/api/')) return sendJson(res, status, { error: status === 500 ? 'The server could not complete that request' : error.message });
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(status === 404 ? 'Not found' : 'Unable to load this page');
  }
});

const port = Number(process.env.PORT || 5173);
server.listen(port, '127.0.0.1', () => console.log(`SunShift India is running at http://localhost:${port}`));
