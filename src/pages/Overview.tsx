import { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BatteryCharging,
  CalendarDays,
  CloudRain,
  CloudSun,
  Coins,
  Gauge,
  Home,
  MapPin,
  PanelTop,
  PlugZap,
  Sun,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Badge, Card, CardHeader, StatTile, cn } from '../components/ui';
import { ProductionChart, type ProductionPoint } from '../components/charts';
import { PanelGlyph, SolarPanelArt } from '../components/SolarPanelArt';
import { useStore } from '../lib/store';
import {
  ALL_HOURS,
  generationForDate,
  monthlyGeneration,
  simulate,
  WEATHER_LABEL,
  cityByName,
} from '../lib/engine';
import { longDate, localDateStamp, money } from '../lib/format';
import type { WeatherKind } from '../lib/types';

const WEATHER_ICON: Record<WeatherKind, typeof Sun> = {
  sunny: Sun,
  partly: CloudSun,
  cloudy: CloudSun,
  rain: CloudRain,
};

type RangeKey = 'monthly' | 'weekly' | 'daily';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'daily', label: 'Daily' },
];

function SegmentedControl<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { key: T; label: string }[];
}) {
  return (
    <div className="flex rounded-xl border border-line bg-panel-2 p-1">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={cn(
            'rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition-all',
            value === opt.key ? 'bg-accent text-white shadow-[0_6px_14px_-6px_rgba(65,105,245,0.8)]' : 'text-muted hover:text-ink',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function Overview() {
  const { settings } = useStore();
  const today = new Date();
  const sim = useMemo(() => simulate({ settings }), [settings]);
  const months = useMemo(() => monthlyGeneration(settings), [settings]);
  const currentMonthIdx = today.getMonth();
  const [selectedMonth, setSelectedMonth] = useState(currentMonthIdx);
  const [range, setRange] = useState<RangeKey>('monthly');

  /* ---------------------------- monitoring data --------------------------- */
  const todayKwh = generationForDate(settings, today);
  const panelsCount = Math.max(1, Math.round((settings.solarKw * 1000) / 545));
  const batteryPct = Math.round((sim.batteryNow / settings.batteryKwh) * 100);
  const peakRow = sim.rows.reduce((best, r) => (r.solar > best.solar ? r : best), sim.rows[0]);
  const city = cityByName(settings.location);

  /* ------------------------------- chart data ---------------------------- */
  const chartData = useMemo<ProductionPoint[]>(() => {
    if (range === 'monthly') {
      return months.map((m, i) => ({
        label: m.month,
        solar: m.kwh,
        consumption:
          235 +
          (i >= 3 && i <= 5 ? 150 : 0) + // Apr–Jun cooling season
          (i === 0 || i === 11 ? 55 : 0) + // Dec–Jan heating
          Math.round(((i * 37) % 5) * 11), // deterministic wobble
      }));
    }
    if (range === 'weekly') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - i));
        const solar = generationForDate(settings, d);
        return {
          label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
          solar,
          consumption: Math.round((solar * 0.62 + 7.4) * 10) / 10,
        };
      });
    }
    return ALL_HOURS.map((h) => {
      const row = sim.rows.find((r) => r.hour === h);
      return {
        label: `${h % 12 || 12}${h >= 12 ? 'p' : 'a'}`,
        solar: Math.round((row?.solar ?? 0) * 100) / 100,
        consumption: Math.round((row?.load ?? 0) * 100) / 100,
      };
    });
  }, [range, months, settings, sim, today]);

  const selected = months[selectedMonth];
  const prev = months[(selectedMonth + 11) % 12];
  const deltaPct = prev.kwh > 0 ? Math.round(((selected.kwh - prev.kwh) / prev.kwh) * 1000) / 10 : 0;
  const tileMonths = [3, 2, 1, 0].map((back) => months[(currentMonthIdx - back + 12) % 12]);
  const bestMonth = months.reduce((a, b) => (b.kwh > a.kwh ? b : a), months[0]);
  const worstMonth = months.reduce((a, b) => (b.kwh < a.kwh ? b : a), months[0]);
  const yearTotal = months.reduce((s, m) => s + m.kwh, 0);

  return (
    <div className="space-y-5">
      {/* greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">Good day, Aarti 👋</h1>
          <p className="mt-0.5 text-[13px] text-muted">{longDate(today)}</p>
        </div>
        <Badge tone="green" dot>
          System healthy
        </Badge>
      </div>

      {/* row 1 */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Solar Panel Monitoring */}
        <Card className="xl:col-span-8">
          <div className="border-b border-line p-5">
            <CardHeader
              title="Solar Panel Monitoring"
              subtitle={`${settings.location} · ${city.state}`}
              action={
                <Badge tone="green" dot>
                  Active
                </Badge>
              }
            />
          </div>
          <div className="grid grid-cols-1 items-center gap-5 p-5 lg:grid-cols-[280px_1fr]">
            <div className="relative overflow-hidden rounded-xl border border-line bg-gradient-to-b from-[#20263f] to-[#1c1c22] p-3">
              <SolarPanelArt className="w-full" />
              <div className="absolute left-3.5 top-3.5 rounded-lg bg-black/35 px-2.5 py-1.5 backdrop-blur">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Live output</p>
                <p className="text-[15px] font-bold text-ink num">
                  {peakRow.solar.toFixed(2)} <span className="text-[11px] font-medium text-muted">kW peak</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
              <StatTile icon={<Zap size={13} />} label="Today's generation" tone="orange" value={<>{todayKwh.toFixed(1)} <span className="text-xs font-semibold text-muted">kWh</span></>} sub={`${peakRow.solar.toFixed(2)} kW peak around ${peakRow.hour % 12 || 12} PM`} />
              <StatTile icon={<Home size={13} />} label="Consumption today" tone="blue" value={<>{sim.loadTotal.toFixed(1)} <span className="text-xs font-semibold text-muted">kWh</span></>} sub="Household + appliances" />
              <StatTile icon={<BatteryCharging size={13} />} label="Battery" tone="green" value={`${batteryPct}%`} sub={`${sim.batteryNow.toFixed(1)} of ${settings.batteryKwh.toFixed(1)} kWh`} />
              <StatTile icon={<PlugZap size={13} />} label="Grid usage today" value={<>{sim.imported.toFixed(1)} <span className="text-xs font-semibold text-muted">kWh</span></>} sub={`${sim.exported.toFixed(1)} kWh exported`} />
              <StatTile icon={<PanelTop size={13} />} label="Installed capacity" tone="blue" value={<>{settings.solarKw.toFixed(1)} <span className="text-xs font-semibold text-muted">kWp</span></>} sub={`${panelsCount} × 545W panels`} />
              <StatTile icon={<Coins size={13} />} label="Saved today" tone="orange" value={money(sim.savings)} sub={`at ${money(settings.tariff)}/kWh tariff`} />
              <StatTile icon={<Gauge size={13} />} label="Self-sufficiency" tone="green" value={`${Math.round(sim.selfSufficiency)}%`} sub={`${Math.round(sim.solarUtilization)}% solar utilised`} />
              <StatTile icon={<MapPin size={13} />} label="Location" value={settings.location.split(',')[0]} sub={`${settings.latitude.toFixed(2)}°N, ${settings.longitude.toFixed(2)}°E`} />
            </div>
          </div>
        </Card>

        {/* Monthly Generation */}
        <Card className="flex flex-col xl:col-span-4">
          <div className="border-b border-line p-5">
            <CardHeader
              title="Monthly Generation"
              subtitle="Modelled from your system size"
              action={
                <Badge tone="blue">
                  {today.getFullYear()}
                </Badge>
              }
            />
          </div>
          <div className="flex flex-1 flex-col gap-4 p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{selected.fullMonth} generation</p>
              <div className="mt-1 flex items-end gap-2.5">
                <span className="text-[30px] font-extrabold leading-none tracking-tight text-ink num">{selected.kwh.toLocaleString('en-IN')}</span>
                <span className="pb-0.5 text-[13px] font-semibold text-muted">kWh</span>
                <span
                  className={cn(
                    'mb-0.5 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold',
                    deltaPct >= 0 ? 'bg-leaf-soft text-leaf' : 'bg-danger-soft text-danger',
                  )}
                >
                  {deltaPct >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                  {Math.abs(deltaPct)}%
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-faint">vs {prev.fullMonth} · {WEATHER_LABEL[selected.weather].toLowerCase()} weather</p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {tileMonths.map((m) => {
                const idx = months.indexOf(m);
                const WIcon = WEATHER_ICON[m.weather];
                const active = idx === selectedMonth;
                return (
                  <button
                    key={m.month}
                    onClick={() => setSelectedMonth(idx)}
                    className={cn(
                      'rounded-xl border p-2.5 text-left transition-all',
                      active
                        ? 'border-accent bg-accent shadow-[0_10px_22px_-10px_rgba(65,105,245,0.9)]'
                        : 'border-line bg-panel-2/60 hover:border-line-strong',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn('text-[11px] font-bold', active ? 'text-white' : 'text-muted')}>{m.month}</span>
                      <WIcon size={12} className={active ? 'text-white/80' : 'text-faint'} />
                    </div>
                    <p className={cn('mt-1.5 text-[13px] font-bold num', active ? 'text-white' : 'text-ink')}>{m.kwh}</p>
                    <p className={cn('text-[9.5px] font-medium', active ? 'text-white/70' : 'text-faint')}>kWh</p>
                  </button>
                );
              })}
            </div>

            {/* 12-month clickable trend */}
            <div className="rounded-xl border border-line bg-panel-2/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-faint">Year at a glance</span>
                <span className="text-[10.5px] font-semibold text-muted num">avg {Math.round(yearTotal / 12)} kWh/mo</span>
              </div>
              <div className="flex h-14 items-end gap-1">
                {months.map((m, idx) => {
                  const active = idx === selectedMonth;
                  return (
                    <button
                      key={m.month}
                      onClick={() => setSelectedMonth(idx)}
                      title={`${m.fullMonth} · ${m.kwh} kWh`}
                      className="group flex h-full flex-1 flex-col justify-end"
                    >
                      <span
                        className={cn(
                          'w-full rounded-[3px] transition-colors',
                          active ? 'bg-accent' : m.weather === 'rain' ? 'bg-white/15 group-hover:bg-white/25' : 'bg-white/25 group-hover:bg-white/35',
                        )}
                        style={{ height: `${Math.max(8, (m.kwh / bestMonth.kwh) * 100)}%` }}
                      />
                      <span className={cn('mt-1 text-center text-[8.5px] font-bold', active ? 'text-ink' : 'text-faint')}>{m.month[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-auto space-y-2.5 border-t border-line pt-4">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="flex items-center gap-2 text-muted">
                  <TrendingUp size={14} className="text-leaf" /> Max generation
                </span>
                <span className="font-semibold text-ink num">
                  {bestMonth.month} · {bestMonth.kwh} kWh
                </span>
              </div>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="flex items-center gap-2 text-muted">
                  <TrendingDown size={14} className="text-solar" /> Min generation
                </span>
                <span className="font-semibold text-ink num">
                  {worstMonth.month} · {worstMonth.kwh} kWh
                </span>
              </div>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="flex items-center gap-2 text-muted">
                  <CalendarDays size={14} className="text-[#8fa7ff]" /> Total generated
                </span>
                <span className="font-semibold text-ink num">{yearTotal.toLocaleString('en-IN')} kWh</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* row 2 */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Energy production chart */}
        <Card className="xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4">
            <CardHeader title="Energy Production" subtitle="Solar generation vs household consumption" />
            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-4 text-[12px] font-medium text-muted sm:flex">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-solar" /> Solar
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-accent" /> Consumption
                </span>
              </div>
              <SegmentedControl value={range} onChange={setRange} options={RANGES} />
            </div>
          </div>
          <div className="px-2 pb-4">
            <ProductionChart data={chartData} height={288} />
          </div>
        </Card>

        {/* Solar system status */}
        <Card className="xl:col-span-4">
          <div className="border-b border-line p-5 pb-4">
            <CardHeader title="Solar System Status" subtitle="Your configured installation" action={<Badge tone="blue">Live model</Badge>} />
          </div>
          <div className="divide-y divide-[rgba(255,255,255,0.05)]">
            <SystemRow
              icon={<PanelGlyph className="h-6 w-6" />}
              name={`SunShift Home · ${settings.location.split(',')[0]}`}
              sub={`${settings.solarKw.toFixed(1)} kWp · ${todayKwh.toFixed(1)} kWh generated today`}
              status={{ label: 'Active', tone: 'green' as const }}
            />
            <SystemRow
              icon={<BatteryCharging size={18} className="text-leaf" />}
              name="Battery storage"
              sub={`${settings.batteryKwh.toFixed(1)} kWh capacity · ${batteryPct >= 98 ? 'fully charged' : `charging at ${peakRow.charge.toFixed(1)} kW`}`}
              status={{ label: batteryPct >= 98 ? 'Full' : 'Charging', tone: 'orange' as const }}
            />
            <SystemRow
              icon={<PlugZap size={18} className="text-[#8fa7ff]" />}
              name="Grid connection"
              sub={`${sim.imported.toFixed(1)} kWh imported · ${sim.exported.toFixed(1)} kWh exported`}
              status={{ label: 'Connected', tone: 'blue' as const }}
            />
            <SystemRow
              icon={<PanelTop size={18} className="text-solar" />}
              name={`Array · ${panelsCount} panels`}
              sub={`${settings.panelTilt}° tilt · ${settings.panelAzimuth === 0 ? 'South' : settings.panelAzimuth + '°'} facing · ${localDateStamp()}`}
              status={{ label: 'Active', tone: 'green' as const }}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function SystemRow({
  icon,
  name,
  sub,
  status,
}: {
  icon: React.ReactNode;
  name: string;
  sub: string;
  status: { label: string; tone: 'green' | 'orange' | 'red' | 'blue' };
}) {
  return (
    <div className="flex items-center gap-3.5 px-5 py-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-panel-2">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-ink">{name}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-muted">{sub}</p>
      </div>
      <Badge tone={status.tone} dot={status.tone !== 'blue'}>
        {status.label}
      </Badge>
    </div>
  );
}
