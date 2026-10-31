import { useMemo, useState } from 'react';
import { BatteryCharging, Shield, Timer, Zap } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Slider, StatTile, Toast, cn, useToast } from '../components/ui';
import { LineSeriesChart } from '../components/charts';
import { useStore } from '../lib/store';
import { simulate } from '../lib/engine';
import { money } from '../lib/format';
import { PageHeader } from '../components/DashboardLayout';

export default function BatteryPage() {
  const { settings, updateSettings } = useStore();
  const [sky, setSky] = useState<'clear' | 'cloudy'>('clear');
  const sim = useMemo(() => simulate({ settings, sky }), [settings, sky]);
  const { toast, showToast } = useToast();

  const usable = Math.max(0, settings.batteryKwh * (1 - settings.reserve / 100));
  const peakCharge = Math.max(...sim.rows.map((r) => r.charge));
  const peakDischarge = Math.max(...sim.rows.map((r) => r.discharge));
  const throughput = sim.rows.reduce((s, r) => s + r.charge, 0);
  const endPct = Math.round((sim.batteryEnd / settings.batteryKwh) * 100);
  const nowPct = Math.round((sim.batteryNow / settings.batteryKwh) * 100);

  const socData = sim.rows.map((r) => ({
    label: `${r.hour % 12 || 12}${r.hour >= 12 ? 'p' : 'a'}`,
    'Charge kW': Math.round(r.charge * 100) / 100,
    'Discharge kW': Math.round(r.discharge * 100) / 100,
  }));
  const levelData = sim.rows.map((r) => ({
    label: `${r.hour % 12 || 12}${r.hour >= 12 ? 'p' : 'a'}`,
    'Battery %': Math.round(r.batteryPct),
  }));

  return (
    <div>
      <PageHeader
        title="Battery Management"
        subtitle={`How the ${settings.batteryKwh.toFixed(1)} kWh battery charges from surplus solar and covers the home above your protected reserve.`}
        actions={
          <div className="flex rounded-xl border border-line bg-panel-2 p-1">
            {(['clear', 'cloudy'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSky(s)}
                className={cn(
                  'rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition-all',
                  sky === s ? 'bg-accent text-white' : 'text-muted hover:text-ink',
                )}
              >
                {s === 'clear' ? 'Clear day' : 'Cloudy day'}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Battery visual */}
        <Card className="xl:col-span-5">
          <div className="p-5 pb-2">
            <CardHeader
              title="State of charge"
              subtitle={`Midday peak · ${sim.batteryNow.toFixed(1)} kWh stored`}
              action={<Badge tone="green" dot>{nowPct}%</Badge>}
            />
          </div>
          <div className="flex flex-col items-center px-5 py-4">
            <BatteryGauge pct={nowPct} reservePct={settings.reserve} />
            <div className="mt-5 w-full space-y-2.5">
              <Row label="Usable above reserve" value={`${usable.toFixed(1)} kWh`} />
              <Row label="Protected reserve" value={`${settings.reserve}% · ${(settings.batteryKwh * settings.reserve / 100).toFixed(1)} kWh`} />
              <Row label="Round-trip efficiency" value="~86% (94% in / 92% out)" />
              <Row label="Max charge rate" value={`${(settings.batteryKwh * 0.5).toFixed(1)} kW (0.5C)`} />
            </div>
          </div>
        </Card>

        {/* KPIs + reserve control */}
        <div className="space-y-5 xl:col-span-7">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon={<BatteryCharging size={13} />} label="Capacity" tone="blue" value={<>{settings.batteryKwh.toFixed(1)} <span className="text-xs text-muted">kWh</span></>} sub="Installed storage" />
            <StatTile icon={<Zap size={13} />} label="Peak charge" tone="green" value={<>{peakCharge.toFixed(2)} <span className="text-xs text-muted">kW</span></>} sub="Midday surplus" />
            <StatTile icon={<Timer size={13} />} label="Charged in" tone="orange" value={<>{throughput.toFixed(1)} <span className="text-xs text-muted">kWh</span></>} sub="Battery throughput" />
            <StatTile icon={<Shield size={13} />} label="8 PM level" value={`${endPct}%`} sub={`${sim.batteryEnd.toFixed(1)} kWh stored`} />
          </div>

          <Card className="space-y-5 p-5">
            <CardHeader title="Dispatch controls" subtitle="Changes recalculate the modelled day instantly" />
            <Slider
              label="Battery capacity"
              value={settings.batteryKwh}
              min={2}
              max={15}
              step={0.5}
              format={(v) => `${v.toFixed(1)} kWh`}
              onChange={(v) => updateSettings({ batteryKwh: v })}
            />
            <Slider
              label="Protected reserve"
              value={settings.reserve}
              min={0}
              max={50}
              step={5}
              format={(v) => `${v}%`}
              onChange={(v) => updateSettings({ reserve: v })}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-[12px] text-muted">
                Peak discharge today <span className="font-semibold text-ink num">{peakDischarge.toFixed(2)} kW</span> · estimated value of stored solar{' '}
                <span className="font-semibold text-leaf num">{money(sim.savings)}</span>
              </p>
              <Button variant="secondary" size="sm" onClick={() => showToast('Battery settings saved to your home profile.')}>
                Apply to home profile
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* charts */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="p-5 pb-3">
          <CardHeader title="Charge / discharge profile" subtitle="Positive is charging from solar, negative hours discharge to the home" />
          <div className="px-1">
            <LineSeriesChart
              data={socData}
              series={[
                { key: 'Charge kW', name: 'Charging', color: '#3FBF7F' },
                { key: 'Discharge kW', name: 'Discharging', color: '#FF944D' },
              ]}
              unit="kW"
              height={230}
            />
          </div>
        </Card>
        <Card className="p-5 pb-3">
          <CardHeader title="State of charge through the day" subtitle={`Reserve floor at ${settings.reserve}%`} />
          <div className="px-1">
            <LineSeriesChart data={levelData} series={[{ key: 'Battery %', name: 'Charge level', color: '#4169F5' }]} unit="%" height={230} />
          </div>
        </Card>
      </div>

      <Toast message={toast} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-line pt-2.5 text-[12.5px] first:border-0 first:pt-0">
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-ink num">{value}</span>
    </div>
  );
}

function BatteryGauge({ pct, reservePct }: { pct: number; reservePct: number }) {
  const width = 300;
  const height = 130;
  const bodyW = 250;
  const bodyH = 96;
  const fillW = (bodyW - 12) * (pct / 100);
  const reserveX = 6 + (bodyW - 12) * (reservePct / 100);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[340px]">
      <defs>
        <linearGradient id="batt-fill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2ea36b" />
          <stop offset="100%" stopColor="#3FBF7F" />
        </linearGradient>
      </defs>
      {/* terminal */}
      <rect x={bodyW + 4} y={(height - 30) / 2} width={14} height={30} rx={4} fill="#3a3a3a" />
      {/* shell */}
      <rect x={0} y={(height - bodyH) / 2} width={bodyW} height={bodyH} rx={16} fill="#1d1d1d" stroke="rgba(255,255,255,0.14)" strokeWidth={2} />
      {/* reserve zone */}
      <rect x={reserveX} y={(height - bodyH) / 2 + 6} width={Math.max(0, bodyW - 6 - reserveX)} height={bodyH - 12} rx={10} fill="repeating-linear-gradient(45deg, rgba(240,86,74,0.16) 0 6px, transparent 6px 12px)" stroke="rgba(240,86,74,0.4)" strokeDasharray="4 4" />
      {/* fill */}
      <rect x={6} y={(height - bodyH) / 2 + 6} width={Math.max(8, fillW)} height={bodyH - 12} rx={10} fill="url(#batt-fill)" opacity={0.92} />
      <text x={bodyW / 2} y={height / 2 + 2} textAnchor="middle" fontSize="30" fontWeight="800" fill={pct > 40 ? '#0d1f16' : '#f4f5f7'} className="num">
        {pct}%
      </text>
      <text x={bodyW / 2} y={height / 2 + 22} textAnchor="middle" fontSize="10.5" fontWeight="600" fill={pct > 40 ? '#0d1f16' : '#9b9fa8'} opacity={0.8}>
        {pct > 0 ? 'STATE OF CHARGE' : 'EMPTY'}
      </text>
    </svg>
  );
}
