import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CloudRain,
  CloudSun,
  Droplets,
  Info,
  LocateFixed,
  RefreshCw,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Wind,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader, StatTile, Toast, cn, useToast } from '../components/ui';
import { LineSeriesChart } from '../components/charts';
import { useStore } from '../lib/store';
import { makeForecast, WEATHER_LABEL } from '../lib/engine';
import { formatUpdated, loadForecast, type LiveForecast } from '../lib/weather';
import { PageHeader } from '../components/DashboardLayout';
import type { WeatherKind } from '../lib/types';

const WX_ICON: Record<WeatherKind, typeof Sun> = { sunny: Sun, partly: CloudSun, cloudy: CloudSun, rain: CloudRain };
const WX_TONE: Record<WeatherKind, 'orange' | 'blue' | 'green' | 'grey'> = { sunny: 'orange', partly: 'blue', cloudy: 'grey', rain: 'blue' };

interface DayView {
  key: string;
  label: string;
  kind: WeatherKind;
  condition: string;
  tempHigh: number | null;
  tempLow: number | null;
  rainChance: number;
  productionKwh: number;
  peakKw: number;
  peakLabel: string;
  sunrise: string;
  sunset: string;
  peakIrradiance: number | null;
  middayCloud: number | null;
  hours: { hour: number; powerKw: number }[];
}

type SourceMode = 'live' | 'cached' | 'modelled';

export default function Forecast() {
  const { settings, updateSettings } = useStore();
  const { toast, showToast } = useToast();

  const [selected, setSelected] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [forecast, setForecast] = useState<LiveForecast | null>(null);
  const [mode, setMode] = useState<SourceMode>('modelled');
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setNotice(null);
    loadForecast(settings, controller.signal)
      .then((outcome) => {
        if (cancelled) return;
        setForecast(outcome.forecast);
        setMode(outcome.mode);
        setNotice(outcome.error ? `Live weather request failed (${outcome.error}). Showing the cached forecast from ${formatUpdated(outcome.forecast.fetchedAt)}.` : null);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled || controller.signal.aborted) return;
        setForecast(null);
        setMode('modelled');
        setNotice(`Weather service unreachable (${err.message}). Showing the built-in sample model — not live data.`);
        setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.latitude, settings.longitude, settings.solarKw, settings.panelTilt, settings.panelAzimuth, reloadKey]);

  // Unified view model over live/cached/modelled days so the UI stays identical.
  const days = useMemo<DayView[]>(() => {
    if (forecast) {
      return forecast.days.map((d) => {
        const peakHour = d.peakHour;
        const peakHourData = d.hours.find((h) => h.hour === peakHour);
        return {
          key: d.date,
          label: d.label,
          kind: d.weather,
          condition: d.condition,
          tempHigh: d.tempHigh,
          tempLow: d.tempLow,
          rainChance: d.rainChance,
          productionKwh: d.productionKwh,
          peakKw: d.peakKw,
          peakLabel: peakHour != null ? `Around ${peakHour % 12 || 12}:00 ${peakHour >= 12 ? 'PM' : 'AM'}` : '—',
          sunrise: d.sunrise,
          sunset: d.sunset,
          peakIrradiance: d.hours.reduce<number | null>((max, h) => (max == null || h.irradiance > max ? Math.round(h.irradiance) : max), null),
          middayCloud: peakHourData?.cloudCover ?? null,
          hours: d.hours.map((h) => ({ hour: h.hour, powerKw: h.powerKw })),
        };
      });
    }
    return makeForecast(settings).map((d) => ({
      key: d.date,
      label: d.label,
      kind: d.weather,
      condition: d.condition,
      tempHigh: d.tempHigh,
      tempLow: d.tempLow,
      rainChance: d.rainChance,
      productionKwh: d.productionKwh,
      peakKw: d.peakKw,
      peakLabel: 'Around 1:00 PM',
      sunrise: d.sunrise,
      sunset: d.sunset,
      peakIrradiance: null,
      middayCloud: null,
      hours: d.hours.map((h) => ({ hour: h.hour, powerKw: h.powerKw })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecast, mode, settings]);

  const safeSelected = Math.min(selected, Math.max(0, days.length - 1));
  const day = days[safeSelected];

  const hourly = day.hours
    .filter((h) => h.hour >= 5 && h.hour <= 20)
    .map((h) => ({
      label: `${h.hour % 12 || 12}${h.hour >= 12 ? 'p' : 'a'}`,
      'Solar kW': Math.round(h.powerKw * 100) / 100,
    }));

  const week = days.map((d) => ({ label: d.label.split(',')[0], 'Generation kWh': d.productionKwh }));

  const useMyLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      showToast('Geolocation is not available in this browser — pick a city from the selector instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        updateSettings({
          latitude: Math.round(pos.coords.latitude * 1000) / 1000,
          longitude: Math.round(pos.coords.longitude * 1000) / 1000,
        });
        showToast('Coordinates updated — fetching the local forecast.');
      },
      () => {
        setLocating(false);
        showToast('Location permission unavailable — pick a city from the selector instead.');
      },
      { timeout: 8000, maximumAge: 300000 },
    );
  }, [showToast, updateSettings]);

  const sourceBadge =
    mode === 'live' ? (
      <Badge tone="green" dot>Live · Open-Meteo · updated {forecast ? formatUpdated(forecast.fetchedAt) : '—'}</Badge>
    ) : mode === 'cached' ? (
      <Badge tone="orange" dot>Cached · fetched {forecast ? formatUpdated(forecast.fetchedAt) : '—'}</Badge>
    ) : (
      <Badge tone="grey">Modelled sample · offline</Badge>
    );

  return (
    <div>
      <PageHeader
        title="Solar Forecast"
        subtitle={`Seven-day generation outlook built from live Open-Meteo weather for ${settings.location} (${settings.latitude.toFixed(2)}°, ${settings.longitude.toFixed(2)}°).`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={useMyLocation} disabled={locating}>
              <LocateFixed size={14} /> {locating ? 'Locating…' : 'Use my location'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} /> Refresh
            </Button>
            {sourceBadge}
          </div>
        }
      />

      {notice ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-solar/40 bg-solar-soft p-3.5" role="alert">
          <Info size={16} className="mt-0.5 shrink-0 text-solar" />
          <p className="text-[12.5px] leading-relaxed text-muted">{notice}</p>
        </div>
      ) : null}

      {/* KPI row */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<Sun size={13} />}
          label={safeSelected === 0 ? "Today's estimate" : 'Day estimate'}
          tone="orange"
          value={<>{day.productionKwh.toFixed(1)} <span className="text-xs text-muted">kWh</span></>}
          sub={`${settings.solarKw.toFixed(1)} kWp array · irradiance-based`}
        />
        <StatTile icon={<Wind size={13} />} label="Peak output" tone="blue" value={<>{day.peakKw.toFixed(2)} <span className="text-xs text-muted">kW</span></>} sub={day.peakLabel} />
        <StatTile
          icon={day.kind === 'rain' ? <CloudRain size={13} /> : <Sun size={13} />}
          label="Weather"
          tone={WX_TONE[day.kind]}
          value={mode === 'modelled' ? WEATHER_LABEL[day.kind] : day.condition}
          sub={day.tempHigh != null && day.tempLow != null ? `${Math.round(day.tempLow)}° – ${Math.round(day.tempHigh)}°C` : '—'}
        />
        <StatTile icon={<Droplets size={13} />} label="Rain chance" value={`${day.rainChance}%`} sub={day.rainChance > 50 ? 'Carry an umbrella' : 'Mostly dry'} />
      </div>

      {/* 7-day cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {days.map((d, i) => {
          const WIcon = WX_ICON[d.kind];
          const active = i === safeSelected;
          return (
            <button
              key={d.key}
              onClick={() => setSelected(i)}
              className={cn(
                'rounded-2xl border p-4 text-left transition-all',
                active
                  ? 'border-accent bg-accent shadow-[0_14px_30px_-12px_rgba(65,105,245,0.9)]'
                  : 'border-line bg-panel hover:border-line-strong',
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn('text-[11px] font-bold uppercase tracking-wider', active ? 'text-white/80' : 'text-faint')}>
                  {i === 0 ? 'Today' : d.label.split(',')[0]}
                </span>
                <WIcon size={16} className={active ? 'text-white' : d.kind === 'sunny' ? 'text-solar' : 'text-muted'} />
              </div>
              <p className={cn('mt-3 text-[19px] font-extrabold num', active ? 'text-white' : 'text-ink')}>
                {d.productionKwh.toFixed(1)}
                <span className={cn('ml-1 text-[11px] font-semibold', active ? 'text-white/70' : 'text-muted')}>kWh</span>
              </p>
              <p className={cn('mt-1 text-[10.5px] font-medium', active ? 'text-white/75' : 'text-muted')}>
                {d.tempHigh != null && d.tempLow != null ? `${Math.round(d.tempHigh)}° / ${Math.round(d.tempLow)}° · ` : ''}
                {d.rainChance}%
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Hourly curve */}
        <Card className="xl:col-span-7">
          <div className="p-5 pb-2">
            <CardHeader
              title={`Hourly solar output · ${day.label}`}
              subtitle={`${mode === 'modelled' ? WEATHER_LABEL[day.kind] : day.condition} · sunrise ${day.sunrise} · sunset ${day.sunset}`}
              action={<Badge tone="blue">kW</Badge>}
            />
          </div>
          <div className="px-2 pb-4">
            <LineSeriesChart data={hourly} series={[{ key: 'Solar kW', name: 'Solar output', color: '#FF944D' }]} unit="kW" height={264} />
          </div>
        </Card>

        {/* Weather detail + week trend + method */}
        <div className="space-y-5 xl:col-span-5">
          {mode !== 'modelled' ? (
            <Card className="p-5">
              <CardHeader title="Weather detail" subtitle={`Open-Meteo observation window for ${day.label}`} />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <StatTile icon={<Thermometer size={13} />} label="Temperature" value={day.tempHigh != null ? `${Math.round(day.tempHigh)}°C` : '—'} sub={`Low ${day.tempLow != null ? `${Math.round(day.tempLow)}°C` : '—'}`} />
                <StatTile icon={<CloudSun size={13} />} label="Cloud cover" tone="blue" value={day.middayCloud != null ? `${Math.round(day.middayCloud)}%` : '—'} sub="At peak-output hour" />
                <StatTile icon={<Droplets size={13} />} label="Precipitation" value={`${day.rainChance}%`} sub="Daily probability" />
                <StatTile icon={<Sun size={13} />} label="Peak irradiance" tone="orange" value={day.peakIrradiance != null ? `${day.peakIrradiance} W/m²` : '—'} sub="Tilted at your panels" />
              </div>
            </Card>
          ) : null}

          <Card className="p-5 pb-3">
            <CardHeader title="Week trend" subtitle="Estimated generation per day" />
            <div className="px-1">
              <LineSeriesChart data={week} series={[{ key: 'Generation kWh', name: 'Generation', color: '#4169F5' }]} unit="kWh" height={180} />
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="How this estimate works" />
            <ul className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-muted">
              <li className="flex gap-2.5"><Sun size={15} className="mt-0.5 shrink-0 text-solar" /> Hourly output = your {settings.solarKw.toFixed(1)} kWp array × actual tilted irradiance (GTI) ÷ 1000 × an 80% performance factor for inverter and wiring losses.</li>
              <li className="flex gap-2.5"><Thermometer size={15} className="mt-0.5 shrink-0 text-[#8fa7ff]" /> Temperature, cloud cover and precipitation probability come straight from the Open-Meteo forecast for the selected coordinates.</li>
              <li className="flex gap-2.5"><Sunrise size={15} className="mt-0.5 shrink-0 text-leaf" /> Sunrise and sunset times are taken from the same forecast; generation is integrated across daylight hours.</li>
              <li className="flex gap-2.5"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-solar" /> This is an estimate from weather data, not a panel measurement — no inverter or meter hardware is connected.</li>
            </ul>
            <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-faint">
              {mode === 'live'
                ? `Live weather from Open-Meteo, last updated ${forecast ? formatUpdated(forecast.fetchedAt) : '—'} (IST). Production values are modelled estimates.`
                : mode === 'cached'
                  ? `Cached Open-Meteo response from ${forecast ? formatUpdated(forecast.fetchedAt) : '—'} — clearly not a fresh live reading. Press Refresh to retry.`
                  : 'Built-in sample weather model, clearly labelled — no live API data was available.'}
            </p>
          </Card>
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}
