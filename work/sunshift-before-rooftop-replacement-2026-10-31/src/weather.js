const DEFAULT_LOCATION = { latitude: 18.5204, longitude: 73.8567, label: 'Pune, Maharashtra' };
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

export async function fetchSolarForecast(settings, { signal } = {}) {
  const params = new URLSearchParams({
    latitude: String(settings.latitude ?? DEFAULT_LOCATION.latitude),
    longitude: String(settings.longitude ?? DEFAULT_LOCATION.longitude),
    hourly: 'temperature_2m,precipitation_probability,cloud_cover,shortwave_radiation,global_tilted_irradiance,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'Asia/Kolkata',
    forecast_days: '7',
    tilt: String(settings.panelTilt ?? 20),
    azimuth: String(settings.panelAzimuth ?? 0)
  });
  const response = await fetch(`${WEATHER_URL}?${params}`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Forecast service returned ${response.status}`);
  const data = await response.json();
  if (!data.hourly?.time?.length || !data.daily?.time?.length) throw new Error('Forecast data was incomplete');
  const hourly = data.hourly;
  const daily = data.daily.time.map((date, dayIndex) => {
    const hours = hourly.time.map((time, index) => ({ time, index })).filter(item => item.time.startsWith(date)).map(({ time, index }) => {
      const gti = hourly.global_tilted_irradiance?.[index] ?? hourly.shortwave_radiation?.[index] ?? 0;
      const irradiance = Math.max(0, Number(gti) || 0);
      const powerKw = Math.max(0, Math.min(settings.solarKw, settings.solarKw * irradiance / 1000 * 0.80));
      return {
        time: time.slice(11, 16),
        temperature: hourly.temperature_2m?.[index] ?? null,
        rainChance: hourly.precipitation_probability?.[index] ?? 0,
        cloudCover: hourly.cloud_cover?.[index] ?? null,
        irradiance,
        powerKw
      };
    });
    const productionKwh = hours.reduce((total, hour) => total + hour.powerKw, 0);
    const peakKw = Math.max(0, ...hours.map(hour => hour.powerKw));
    return {
      date,
      hours,
      productionKwh,
      peakKw,
      weatherCode: dailyValue(data.daily.weather_code, dayIndex, 0),
      tempHigh: dailyValue(data.daily.temperature_2m_max, dayIndex, null),
      tempLow: dailyValue(data.daily.temperature_2m_min, dayIndex, null),
      rainChance: dailyValue(data.daily.precipitation_probability_max, dayIndex, 0),
      sunrise: dailyValue(data.daily.sunrise, dayIndex, ''),
      sunset: dailyValue(data.daily.sunset, dayIndex, '')
    };
  });
  return { location: settings.location || DEFAULT_LOCATION.label, days: daily, updatedAt: new Date(), source: 'Open-Meteo', panelKw: settings.solarKw, panelTilt: settings.panelTilt, panelAzimuth: settings.panelAzimuth, latitude: settings.latitude, longitude: settings.longitude };
}

function dailyValue(values, index, fallback) {
  return Array.isArray(values) && values[index] != null ? values[index] : fallback;
}

export function weatherDescription(code) {
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

export function localDateLabel(date, options = { weekday: 'short', day: 'numeric', month: 'short' }) {
  return new Date(`${date}T12:00:00+05:30`).toLocaleDateString('en-IN', options);
}
