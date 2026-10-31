import { useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Coins, Leaf, PanelTop, Ruler, Zap } from 'lucide-react';
import { Badge, Card, CardHeader, Select, Slider, StatTile } from '../components/ui';
import { ProductionChart } from '../components/charts';
import { SolarPanelArt } from '../components/SolarPanelArt';
import { RoofImageUpload } from '../components/RoofImageUpload';
import { useStore } from '../lib/store';
import { CITIES, estimateRoof, monthlyGeneration } from '../lib/engine';
import { money } from '../lib/format';
import { PageHeader } from '../components/DashboardLayout';

export default function RooftopEstimator() {
  const { settings } = useStore();
  const [city, setCity] = useState(settings.location);
  const [area, setArea] = useState(40);
  const [panelWatt, setPanelWatt] = useState(545);
  const [shading, setShading] = useState(10);
  const [tilt, setTilt] = useState(18);

  const est = useMemo(
    () => estimateRoof({ areaSqm: area, panelWatt, shading, tilt, city, tariff: settings.tariff }),
    [area, panelWatt, shading, tilt, city, settings.tariff],
  );

  const monthly = useMemo(() => monthlyGeneration({ ...settings, solarKw: est.capacityKw, location: city }), [settings, est.capacityKw, city]);

  return (
    <div>
      <PageHeader
        title="Rooftop Estimator"
        subtitle="Estimate the capacity your roof can host and what it would generate, save and avoid — before installation."
        actions={<Badge tone="blue">Planning estimate</Badge>}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* inputs */}
        <Card className="xl:col-span-5">
          <div className="p-5 pb-4">
            <CardHeader title="Your roof" subtitle="Adjust the inputs to match your home" />
          </div>
          <div className="space-y-5 p-5 pt-2">
            <label className="block">
              <span className="field-label">City</span>
              <Select value={city} onChange={(e) => setCity(e.target.value)}>
                {CITIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
            <Slider label="Usable roof area" value={area} min={10} max={300} step={5} format={(v) => `${v} m²`} onChange={setArea} />
            <label className="block">
              <span className="field-label">Panel model</span>
              <Select value={String(panelWatt)} onChange={(e) => setPanelWatt(Number(e.target.value))}>
                <option value={390}>390 W polycrystalline</option>
                <option value={440}>440 W mono PERC</option>
                <option value={545}>545 W half-cut mono</option>
                <option value={575}>575 W TOPCon</option>
              </Select>
            </label>
            <Slider label="Shading loss" value={shading} min={0} max={40} step={5} format={(v) => `${v}%`} onChange={setShading} />
            <Slider label="Panel tilt" value={tilt} min={0} max={40} step={1} format={(v) => `${v}°`} onChange={setTilt} />
            <div className="border-t border-line pt-4">
              <p className="field-label">Roof photo (optional)</p>
              <RoofImageUpload />
            </div>
          </div>
        </Card>

        {/* results */}
        <div className="space-y-5 xl:col-span-7">
          <Card className="overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-[240px_1fr]">
              <div className="relative hidden items-center justify-center border-r border-line bg-gradient-to-b from-[#20263f] to-[#1c1c22] p-4 md:flex">
                <SolarPanelArt className="w-full" />
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2.5">
                  <PanelTop size={17} className="text-[#8fa7ff]" />
                  <h2 className="text-[15px] font-bold text-ink">Estimated system</h2>
                </div>
                <div className="mt-3 flex items-end gap-3">
                  <span className="text-[34px] font-extrabold leading-none tracking-tight text-ink num">{est.capacityKw.toFixed(1)}</span>
                  <span className="pb-1 text-[14px] font-semibold text-muted">kWp</span>
                  <Badge tone="blue" className="mb-1">{est.panels} panels</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <StatTile icon={<Zap size={13} />} label="Yearly output" tone="orange" value={<>{est.yearlyKwh.toLocaleString('en-IN')} <span className="text-xs text-muted">kWh</span></>} sub={`${est.monthlyAvgKwh} kWh monthly avg`} />
                  <StatTile icon={<Coins size={13} />} label="Yearly savings" tone="green" value={money(est.yearlySavings)} sub={`at ${money(settings.tariff)}/kWh`} />
                </div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon={<Ruler size={13} />} label="System cost" value={`₹${(est.estimatedCost / 100000).toFixed(1)}L`} sub="Before subsidy" />
            <StatTile icon={<Coins size={13} />} label="Subsidy" tone="green" value={money(est.subsidy)} sub="PM Surya Ghar estimate" />
            <StatTile icon={<Calculator size={13} />} label="Net investment" value={`₹${(est.netCost / 100000).toFixed(1)}L`} sub="After subsidy" />
            <StatTile icon={<Leaf size={13} />} label="CO₂ avoided" tone="green" value={<>{est.co2Tonnes} <span className="text-xs text-muted">t/yr</span></>} sub={`Payback ≈ ${est.paybackYears} yrs`} />
          </div>

          <Card className="p-5 pb-3">
            <CardHeader title="Expected monthly generation" subtitle={`For a ${est.capacityKw.toFixed(1)} kWp system in ${city.split(',')[0]}`} />
            <div className="px-2 pb-3">
              <ProductionChart
                data={monthly.map((m) => ({
                  label: m.month,
                  solar: m.kwh,
                  consumption: Math.round((est.monthlyAvgKwh * 0.8) * (m.weather === 'rain' ? 1.05 : 1)),
                }))}
                height={220}
              />
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-solar-soft text-solar">
                <AlertTriangle size={16} />
              </span>
              <p className="text-[12px] leading-relaxed text-muted">
                Uses ~8.5 m² per kWp for tilted panels, city-specific yields and an 80% performance factor. Actual output depends on roof structure,
                wiring runs, inverter choice and maintenance. Get a site survey before purchase — figures here are planning estimates only.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
