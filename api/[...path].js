import { get, put } from '@vercel/blob';
import { randomUUID } from 'node:crypto';

const STORE_PATH = 'sunshift/state.json';
const defaults = { solarKw: 5.2, batteryKwh: 6, tariff: 8, reserve: 20, batteryStart: 0.42, panelTilt: 20, panelAzimuth: 0, location: 'Pune, Maharashtra', latitude: 18.5204, longitude: 73.8567 };
const validAppliances = new Set(['Washing machine', 'Dishwasher', 'Water heater', 'EV charger']);

async function loadState() {
  const blob = await get(STORE_PATH, { access: 'private', useCache: false });
  if (!blob || blob.statusCode !== 200) return { settings: { ...defaults }, settingsConfiguredAt: null, schedule: [], runs: [] };
  const saved = await new Response(blob.stream).json();
  return {
    settings: { ...defaults, ...(saved.settings || {}) },
    settingsConfiguredAt: saved.settingsConfiguredAt || null,
    schedule: Array.isArray(saved.schedule) ? saved.schedule : [],
    runs: Array.isArray(saved.runs) ? saved.runs : []
  };
}

async function saveState(state) {
  await put(STORE_PATH, JSON.stringify(state), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json'
  });
}

function validateSettings(input, current) {
  const bounds = {
    solarKw: [2, 10], batteryKwh: [2, 15], tariff: [1, 50], reserve: [10, 50],
    batteryStart: [0.1, 1], panelTilt: [0, 60], panelAzimuth: [-180, 180], latitude: [-90, 90], longitude: [-180, 180]
  };
  const next = { ...current };
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
  const record = {
    id: randomUUID(), timestamp: new Date().toISOString(),
    type: input.type === 'day-ahead' ? 'day-ahead' : 'scenario',
    title: String(input.title || 'Energy calculation').slice(0, 80),
    date: String(input.date || '').slice(0, 10), sky: input.sky === 'cloudy' ? 'cloudy' : 'clear',
    outage: Boolean(input.outage), loadFactor: Number(input.loadFactor) === 1.3 ? 1.3 : 1,
    location: String(input.location || 'Pune, Maharashtra').slice(0, 80)
  };
  for (const field of ['solarKwh', 'homeKwh', 'gridImportKwh', 'estimatedCost', 'batteryPct']) {
    const value = Number(input[field]);
    if (!Number.isFinite(value) || value < 0 || value > 100000) throw new Error(`Invalid run value: ${field}`);
    record[field] = value;
  }
  return record;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Request is too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, data) {
  res.status(status).setHeader('Cache-Control', 'no-store');
  return res.json(data);
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', `https://${req.headers.host || 'sunshift.vercel.app'}`);
    const route = url.pathname;
    if (route === '/api/health' && req.method === 'GET') {
      await loadState();
      return send(res, 200, { ok: true, application: 'SunShift India', version: '1.0.0', serverTime: new Date().toISOString(), storage: 'Vercel Blob' });
    }
    const state = await loadState();
    if (route === '/api/settings' && req.method === 'GET') return send(res, 200, { settings: state.settings, configured: Boolean(state.settingsConfiguredAt), updatedAt: state.settingsConfiguredAt });
    if (route === '/api/settings' && req.method === 'PUT') {
      state.settings = validateSettings(await readBody(req), state.settings);
      state.settingsConfiguredAt = new Date().toISOString();
      await saveState(state);
      return send(res, 200, { settings: state.settings, configured: true, updatedAt: state.settingsConfiguredAt });
    }
    if (route === '/api/schedule' && req.method === 'GET') return send(res, 200, { items: state.schedule });
    if (route === '/api/schedule' && req.method === 'POST') {
      state.schedule.push(validateSchedule(await readBody(req)));
      await saveState(state);
      return send(res, 201, { items: state.schedule });
    }
    if (route.startsWith('/api/schedule/') && req.method === 'DELETE') {
      const id = decodeURIComponent(route.slice('/api/schedule/'.length));
      state.schedule = state.schedule.filter(item => item.id !== id);
      await saveState(state);
      return send(res, 200, { items: state.schedule });
    }
    if (route === '/api/runs' && req.method === 'GET') {
      const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 30)));
      return send(res, 200, { items: state.runs.slice(0, limit) });
    }
    if (route === '/api/runs' && req.method === 'POST') {
      const run = validateRun(await readBody(req));
      state.runs.unshift(run);
      state.runs = state.runs.slice(0, 200);
      await saveState(state);
      return send(res, 201, { item: run });
    }
    return send(res, 404, { error: 'API route not found' });
  } catch (error) {
    const message = error.message || 'The server could not complete that request';
    const clientError = message.startsWith('Invalid') || message.startsWith('Choose') || message.startsWith('Use') || message.startsWith('Appliance') || error instanceof SyntaxError;
    return send(res, clientError ? 400 : 503, { error: clientError ? message : 'Persistent storage is not connected. Add a private Vercel Blob store to this project.' });
  }
}
