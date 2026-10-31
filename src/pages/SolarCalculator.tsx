import { useMemo, useState } from 'react';
import { Calculator, Coins, IndianRupee, Leaf, PiggyBank, Receipt, TrendingUp } from 'lucide-react';
import { Badge, Card, CardHeader, Select, Slider, StatTile } from '../components/ui';
import { LineSeriesChart } from '../components/charts';
import { useStore } from '../lib/store';
import { CITIES, calculateSavings } from '../lib/engine';
import { money } from '../lib/format';
import { PageHeader } from '../components/DashboardLayout';

export default function SolarCalculator() {
  const { settings } = useStore();
  const [bill, setBill] = useState(3500);
  const [tariff, setTariff] = useState(settings.tariff);
  const [offset, setOffset] = useState(90);
  const [city, setCity] = useState(settings.location);

  const result = useMemo(() => calculateSavings({ monthlyBill: bill, tariff, targetOffsetPct: offset, city }), [bill, tariff, offset, city]);

  const lifetime = result.lifetime.map((l) => ({ label: `'${String(l.year).slice(2)}`, Cumulative: Math.round(l.cumulative / 1000), 'Yearly': Math.round(l.savings / 1000) }));
  const breakEvenYear = result.lifetime.findIndex((l) => l.cumulative >= result.netCost);

  return (
    <div>
      <PageHeader
        title="Solar Savings Calculator"
        subtitle="Size a rooftop system from your monthly bill and see the payback, subsidy and 25-year savings picture."
        actions={<Badge tone="orange">Modelled estimates</Badge>}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* inputs */}
        <Card className="xl:col-span-4">
          <div className="p-5 pb-4">
            <CardHeader title="Your electricity" subtitle="From your latest power bill" />
          </div>
          <div className="space-y-5 p-5 pt-2">
            <Slider label="Monthly bill" value={bill} min={800} max={25000} step={100} format={(v) => money(v)} onChange={setBill} />
            <Slider label="Grid tariff" value={tariff} min={4} max={20} step={1} format={(v) => `₹${v}/kWh`} onChange={setTariff} />
            <Slider label="Bill offset target" value={offset} min={40} max={100} step={5} format={(v) => `${v}%`} onChange={setOffset} />
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
            <div className="rounded-xl border border-line bg-panel-2/50 p-4 text-[12px] leading-relaxed text-muted">
              <Receipt size={14} className="mb-1.5 text-[#8fa7ff]" />
              <span className="text-ink num">{Math.round(bill / tariff / 30).toLocaleString('en-IN')}</span> units used per day, roughly{' '}
              <span className="text-ink num">{Math.round(bill / tariff).toLocaleString('en-IN')}</span> kWh per month.
            </div>
          </div>
        </Card>

        {/* results */}
        <div className="space-y-5 xl:col-span-8">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon={<Calculator size={13} />} label="Suggested size" tone="orange" value={<>{result.suggestedKw.toFixed(1)} <span className="text-xs text-muted">kWp</span></>} sub={`${offset}% of your usage`} />
            <StatTile icon={<Coins size={13} />} label="Monthly savings" tone="green" value={money(result.monthlySavings)} sub={`${result.billOffsetPct}% of bill offset`} />
            <StatTile icon={<PiggyBank size={13} />} label="Yearly savings" tone="green" value={money(result.yearlySavings)} sub={`${result.yearlyKwh.toLocaleString('en-IN')} kWh per year`} />
            <StatTile icon={<TrendingUp size={13} />} label="Payback period" tone="blue" value={<>{result.paybackYears} <span className="text-xs text-muted">yrs</span></>} sub={breakEvenYear >= 0 ? `Break-even in year ${breakEvenYear + 1}` : 'No break-even at these inputs'} />
          </div>

          <Card className="p-5 pb-3">
            <CardHeader
              title="25-year savings projection"
              subtitle={`Cumulative savings vs ₹${(result.netCost / 100000).toFixed(1)}L net investment · 0.5% yearly panel degradation`}
              action={<Badge tone="green">₹{Math.round(result.lifetime[24].cumulative / 100000)}L lifetime</Badge>}
            />
            <div className="px-1">
              <LineSeriesChart
                data={lifetime}
                series={[
                  { key: 'Cumulative', name: 'Cumulative savings', color: '#3FBF7F' },
                  { key: 'Yearly', name: 'Yearly savings', color: '#FF944D' },
                ]}
                unit="k ₹"
                height={250}
              />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Card className="p-5">
              <CardHeader title="Investment breakdown" subtitle="Installed cost and central subsidy" />
              <div className="mt-4 space-y-3">
                <Row label="System cost" value={money(result.estimatedCost)} />
                <Row label="PM Surya Ghar subsidy" value={`− ${money(result.subsidy)}`} green />
                <div className="border-t border-line pt-3">
                  <Row label="Net investment" value={money(result.netCost)} strong />
                </div>
                <Row label="Savings per ₹1 lakh invested" value={result.netCost > 0 ? `₹${Math.round((result.yearlySavings / result.netCost) * 100000).toLocaleString('en-IN')} / yr` : '—'} />
              </div>
            </Card>
            <Card className="p-5">
              <CardHeader title="Environmental return" subtitle="Over 25 years of operation" />
              <div className="mt-4 space-y-3">
                <Row label="Lifetime clean energy" value={`${Math.round((result.yearlyKwh * 25 * 0.9) / 1000)}k kWh`} />
                <Row label="CO₂ avoided" value={`${result.co2Tonnes25} tonnes`} green />
                <Row label="Equivalent trees" value={`${Math.round((result.co2Tonnes25 * 1000) / 21)} planted`} />
                <div className="flex items-start gap-2.5 border-t border-line pt-3 text-[11px] leading-relaxed text-faint">
                  <Leaf size={13} className="mt-0.5 shrink-0 text-leaf" />
                  Uses India's average grid emission factor of 0.227 kg CO₂/kWh and 90% lifetime performance.
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <div className="flex items-start gap-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-[#8fa7ff]">
                <IndianRupee size={16} />
              </span>
              <p className="text-[12px] leading-relaxed text-muted">
                Costs assume ₹55,000 per kWp installed before subsidy; the PM Surya Ghar assistance is modelled at ₹30,000/kW up to 2 kW, ₹18,000 for
                the 3rd kW, capped at ₹78,000. Tariffs typically rise over time — real savings are usually higher. Estimates only, not a quotation.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, green, strong }: { label: string; value: string; green?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[12.5px]">
      <span className="text-muted">{label}</span>
      <span className={`num ${strong ? 'text-[15px] font-extrabold text-ink' : green ? 'font-semibold text-leaf' : 'font-semibold text-ink'}`}>{value}</span>
    </div>
  );
}
