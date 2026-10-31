import { useMemo, useState } from 'react';
import { Coins, Leaf, PiggyBank, Trees, TrendingUp } from 'lucide-react';
import { Badge, Card, CardHeader, Slider, StatTile } from '../components/ui';
import { ProductionChart } from '../components/charts';
import { useStore } from '../lib/store';
import { CO2_PER_KWH, monthlyGeneration, simulate } from '../lib/engine';
import { money } from '../lib/format';
import { PageHeader } from '../components/DashboardLayout';

export default function Savings() {
  const { settings, updateSettings } = useStore();
  const sim = useMemo(() => simulate({ settings }), [settings]);
  const months = useMemo(() => monthlyGeneration(settings), [settings]);

  // Self-consumed share of generation (from the dispatch model)
  const selfUseShare = sim.solarTotal > 0 ? Math.min(1, (sim.solarTotal - sim.exported) / sim.solarTotal) : 0.85;

  const monthlySavings = months.map((m) => ({
    label: m.month,
    solar: Math.round(m.kwh * selfUseShare * settings.tariff),
    consumption: Math.round(m.kwh * (1 - selfUseShare) * settings.tariff), // grid spend avoided is solar; consumption series = grid spend for context
  }));
  const yearSavings = monthlySavings.reduce((s, m) => s + m.solar, 0);
  const yearKwh = months.reduce((s, m) => s + m.kwh, 0);
  const co2Year = (yearKwh * selfUseShare * CO2_PER_KWH) / 1000;
  const trees = co2Year / 0.21; // one mature tree absorbs ~21 kg CO2 per year
  const evKm = (yearKwh * selfUseShare * CO2_PER_KWH) / 0.12; // vs a petrol car emitting ~120 g/km

  return (
    <div>
      <PageHeader
        title="Savings & Environmental Impact"
        subtitle={`Estimated value of solar energy used directly or stored for later, at your tariff of ${money(settings.tariff)} per kWh.`}
        actions={<Badge tone="green" dot>On track</Badge>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<Coins size={13} />} label="Saved today" tone="orange" value={money(sim.savings)} sub="Solar used + battery" />
        <StatTile icon={<PiggyBank size={13} />} label="Monthly run-rate" tone="green" value={money(Math.round(yearSavings / 12))} sub="Average across the year" />
        <StatTile icon={<TrendingUp size={13} />} label="Projected year" tone="blue" value={money(yearSavings)} sub={`${Math.round(yearKwh * selfUseShare).toLocaleString('en-IN')} kWh self-consumed`} />
        <StatTile icon={<Leaf size={13} />} label="CO₂ avoided / year" tone="green" value={<>{co2Year.toFixed(1)} <span className="text-xs text-muted">t</span></>} sub={`${(co2Year * 1000 / 12).toFixed(0)} kg per month`} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-4">
            <CardHeader title="Monthly savings trend" subtitle={`₹ saved from self-consumed solar · grid spend shown for context`} />
            <div className="flex items-center gap-4 text-[12px] font-medium text-muted">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-leaf" />Solar savings</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#6d7178]" />Grid spend</span>
            </div>
          </div>
          <div className="px-2 pb-4">
            <ProductionChart
              data={monthlySavings.map((m) => ({ label: m.label, solar: m.solar, consumption: m.consumption }))}
              height={280}
              solarColor="#3FBF7F"
              consumptionColor="#6d7178"
              solarName="Solar savings"
              consumptionName="Grid spend"
            />
          </div>
        </Card>

        <div className="space-y-5 xl:col-span-4">
          <Card className="p-5">
            <CardHeader title="Tariff" subtitle="Savings scale with your electricity rate" />
            <div className="mt-4">
              <Slider
                label="Grid tariff"
                value={settings.tariff}
                min={4}
                max={20}
                step={1}
                format={(v) => `₹${v}/kWh`}
                onChange={(v) => updateSettings({ tariff: v })}
              />
            </div>
            <div className="mt-4 space-y-2.5 border-t border-line pt-4 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-muted">Per kWh self-consumed</span>
                <span className="font-semibold text-ink num">{money(settings.tariff)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">25-year estimate</span>
                <span className="font-semibold text-leaf num">{money(Math.round(yearSavings * 22))}</span>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Environmental impact" subtitle="Yearly, from self-consumed solar" />
            <div className="mt-4 space-y-3.5">
              <ImpactRow icon={<Trees size={16} className="text-leaf" />} label="Equivalent trees planted" value={`${Math.round(trees)}`} sub="21 kg CO₂ absorbed per tree yearly" />
              <ImpactRow icon={<TrendingUp size={16} className="text-[#8fa7ff]" />} label="Petrol-car km avoided" value={`${Math.round(evKm).toLocaleString('en-IN')} km`} sub="Vs ~120 g CO₂ per km" />
              <ImpactRow icon={<Leaf size={16} className="text-solar" />} label="Clean energy exported" value={`${Math.round(yearKwh * (1 - selfUseShare)).toLocaleString('en-IN')} kWh`} sub="Shared with the grid" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ImpactRow({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-line bg-panel-2/50 p-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-panel">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold text-ink">{label}</p>
        <p className="text-[11px] text-faint">{sub}</p>
      </div>
      <span className="text-[16px] font-extrabold text-ink num">{value}</span>
    </div>
  );
}
