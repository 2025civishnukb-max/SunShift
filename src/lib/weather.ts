import type { Settings, WeatherKind } from './types';

/**
 * Live weather client for the Solar Forecast page.
 * Ported from the SunShift vanilla engine (src/weather.js) so both surfaces share
 * the same Open-Meteo model. Solar production is an ESTIMATE derived from real
 * irradiance with an 80% performance ratio — no panel hardware is measured.
 *
 * Fallback behaviour is explicit: on API failure the last successful response is
 * served from localStorage and labelled 'cached'; if no cache exists the caller
 * falls back to the modelled sample forecast (never labelled as live).
 */

const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const CACHE_KEY = 'sunshift-weather-cache-v1';
const FALLBACK_LOCATION = { latitude: 18.5204, longitude: 73.8567, label: 'Pune, Maharashtra' };

export interface LiveHour {
  /** ISO local timestamp, e.g. 2026-10-31T13:00 */
  time: string;
  hour: number;
  powerKw: number;
  temperature: number | null;
  rainChance: number;
  cloudCover: number | null;
  /** Global tilted irradiance (W/m²), falling back to GHI. */
  irradiance: number;
}

export interface LiveDay {
  date: string;
  label: string;
  weather: WeatherKind;
  condition: string;
  tempHigh: number | null;
  tempLow: number | null;
  rainChance: number;
  productionKwh: number;
  peakKw: number;
  peakHour: number | null;
  sunrise: string;
  sunset: string;
  hours: LiveHour[];
}

export interface LiveForecast {
  location: string;
  latitude: number;
  longitude: number;
  days: LiveDay[];
  /** ISO timestamp of when the data was fetched from Open-Meteo. */
  fetchedAt: string;
  source: 'live' | 'cached';
}

export interface FetchOutcome {
  forecast: LiveForecast;
  mode: 'live' | 'cached';
  /** Set when the live call failed and cached data was served instead. */
  error?: string;
}

interface CacheEntry {
  key: string;
  fetchedAt: string;
  forecast: LiveForecast;
}

function cacheKeyFor(settings: Settings): string {
  return [
    Number(settings.latitude ?? 0).toFixed(3),
    Number(settings.longitude ?? 0).toFixed(3),
    settings.solarKw,
    settings.panelTilt,
    settings.panelAzimuth,
  ].join('|');
}

function readCache(key: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    return entry.key === key ? entry : null;
  } catch {
    return null;
  }
}

function writeCache(entry: CacheEntry): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* storage unavailable — caching is best-effort */
  }
}

/** Fetch a 7-day forecast from Open-Meteo. Throws on network/API failure. */
export async function fetchLiveForecast(settings: Settings, signal?: AbortSignal): Promise<LiveForecast> {
  const params = new URLSearchParams({
    latitude: String(settings.latitude ?? FALLBACK_LOCATION.latitude),
    longitude: String(settings.longitude ?? FALLBACK_LOCATION.longitude),
    hourly: 'temperature_2m,precipitation_probability,cloud_cover,shortwave_radiation,global_tilted_irradiance,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'Asia/Kolkata',
    forecast_days: '7',
    tilt: String(settings.panelTilt ?? 20),
    azimuth: String(settings.panelAzimuth ?? 0),
  });
  const response = await fetch(`${WEATHER_URL}?${params}`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Weather service returned status ${response.status}`);
  const data = await response.json();
  if (!data?.hourly?.time?.length || !data?.daily?.time?.length) throw new Error('Weather service returned incomplete data');

  const hourly = data.hourly;
  const days: LiveDay[] = data.daily.time.map((date: string, dayIndex: number) => {
    const hours: LiveHour[] = hourly.time
      .map((time: string, index: number) => ({ time, index }))
      .filter((item: { time: string }) => item.time.startsWith(date))
      .map(({ time, index }: { time: string; index: number }) => {
        const gti = hourly.global_tilted_irradiance?.[index] ?? hourly.shortwave_radiation?.[index] ?? 0;
        const irradiance = Math.max(0, Number(gti) || 0);
        // Planning estimate: real tilted irradiance × rated capacity × 80% performance ratio.
        const powerKw = Math.max(0, Math.min(settings.solarKw, (settings.solarKw * irradiance) / 1000 * 0.8));
        return {
          time,
          hour: Number(time.slice(11, 13)),
          powerKw,
          temperature: hourly.temperature_2m?.[index] ?? null,
          rainChance: hourly.precipitation_probability?.[index] ?? 0,
          cloudCover: hourly.cloud_cover?.[index] ?? null,
          irradiance,
        };
      });
    const productionKwh = hours.reduce((total: number, hour: LiveHour) => total + hour.powerKw, 0);
    const peak = hours.reduce((best: LiveHour | null, h: LiveHour) => (!best || h.powerKw > best.powerKw ? h : best), null as LiveHour | null);
    const code = dailyValue(data.daily.weather_code, dayIndex, 0);
    return {
      date,
      label: new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      weather: kindFromCode(code),
      condition: weatherDescription(code),
      tempHigh: dailyValue(data.daily.temperature_2m_max, dayIndex, null),
      tempLow: dailyValue(data.daily.temperature_2m_min, dayIndex, null),
      rainChance: dailyValue(data.daily.precipitation_probability_max, dayIndex, 0),
      productionKwh: Math.round(productionKwh * 10) / 10,
      peakKw: peak ? Math.round(peak.powerKw * 100) / 100 : 0,
      peakHour: peak?.hour ?? null,
      sunrise: formatClock(dailyValue(data.daily.sunrise, dayIndex, '')),
      sunset: formatClock(dailyValue(data.daily.sunset, dayIndex, '')),
      hours,
    };
  });

  return {
    location: settings.location || FALLBACK_LOCATION.label,
    latitude: Number(settings.latitude ?? FALLBACK_LOCATION.latitude),
    longitude: Number(settings.longitude ?? FALLBACK_LOCATION.longitude),
    days,
    fetchedAt: new Date().toISOString(),
    source: 'live',
  };
}

/**
 * Try the live API, then the cached copy. Rejects only when both are
 * unavailable, so the caller can fall back to the labelled sample model.
 */
export async function loadForecast(settings: Settings, signal?: AbortSignal): Promise<FetchOutcome> {
  const key = cacheKeyFor(settings);
  try {
    const forecast = await fetchLiveForecast(settings, signal);
    writeCache({ key, fetchedAt: forecast.fetchedAt, forecast });
    return { forecast, mode: 'live' };
  } catch (err) {
    if (signal?.aborted) throw err;
    const cached = readCache(key);
    if (cached) {
      return { forecast: { ...cached.forecast, source: 'cached' }, mode: 'cached', error: (err as Error).message };
    }
    throw err;
  }
}

function dailyValue(values: unknown, index: number, fallback: unknown): any {
  return Array.isArray(values) && values[index] != null ? values[index] : fallback;
}

/** WMO weather code → forecast kind used for icons/tones across the app. */
export function kindFromCode(code: number): WeatherKind {
  if (code === 0 || code === 1) return 'sunny';
  if (code === 2) return 'partly';
  if (code === 3 || code === 45 || code === 48) return 'cloudy';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'rain';
  return 'partly';
}

export function weatherDescription(code: number): string {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain showers';
  if (code >= 85 && code <= 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Variable cloud';
}

function formatClock(isoLocal: string): string {
  if (!isoLocal || isoLocal.length < 16) return '—';
  const hour = Number(isoLocal.slice(11, 13));
  const minute = isoLocal.slice(14, 16);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${minute} ${suffix}`;
}

export function formatUpdated(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}
