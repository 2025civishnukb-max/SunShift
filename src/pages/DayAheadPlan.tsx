import { useMemo, useState } from 'react';
import { CalendarClock, Download, Lightbulb, Save, Sparkles } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Select, StatTile, Toast, useToast } from '../components/ui';
import { LineSeriesChart } from '../components/charts';
import { useStore } from '../lib/store';
import { formatTime, makeForecast, simulateForecastDay } from '../lib/engine';
import { downloadCsv, localDateStamp, longDate, money } from '../lib/format';
import { PageHeader } from '../components/DashboardLayout';

export default function DayAheadPlan() {
  const { settings, schedule, addRun } = useStore();
  const { toast, showToast } = useToast();
  const days = useMemo(() => makeForecast(settings), [settings]);
  const [dateIdx, setDateIdx] = useState(0);
  const [loadFactor, setLoadFactor] = useState(1);

  const day = days[dateIdx];
  const plan = useMemo(
    () => simulateForecastDay(day, settings, schedule.map((s) => ({ hour: s.hour, kwh: s.kwh })), loadFactor),
    [day, settings, schedule, loadFactor],
  );

  const chartData = plan.rows
    .filter((r) => r.solar > 0.001 || r.load > 0.2)
    .map((r) => ({
      label: `${r.hour % 12 || 12}${r.hour >= 12 ? 'p' : 'a'}`,
      Solar: Math.round(r.solar * 100) / 100,
      'Home demand': Math.round(r.load * 100) / 100,
      'Grid import': Math.round(r.grid * 100) / 100,
    }));

  const tableRows = plan.rows.filter((r) => r.solar > 0.01 || r.load > 0.45);

  const advice =
    plan.imported > plan.loadTotal * 0.35
      ? `Grid imports are projected to be high. Shift flexible appliances toward ${formatTime(plan.bestSurplusHour)}, when solar surplus is strongest.`
      : `Solar and the battery cover most of the home's needs. The strongest surplus is around ${formatTime(plan.bestSurplusHour)} — a good window for flexible loads.`;

  return (
    <div>
      <PageHeader
        title="Day-ahead Energy Plan"
        subtitle="Turn the weather outlook into an hour-by-hour plan: predicted demand, battery dispatch, grid imports and cost."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() =>
                downloadCsv(`sunshift-day-ahead-${day.date}.csv`, [
                  ['Date', 'Hour', 'Solar kW', 'Home demand kW', 'Grid import kWh', 'Battery charge kWh', 'Battery discharge kWh', 'Battery %'],
                  ...plan.rows.map((r) => [day.date, `${String(r.hour).padStart(2, '0')}:00`, r.solar.toFixed(3), r.load.toFixed(3), r.grid.toFixed(3), r.charge.toFixed(3), r.discharge.toFixed(3), r.batteryPct.toFixed(1)]),
                  ['TOTAL', '', plan.solarTotal.toFixed(2), plan.loadTotal.toFixed(2), plan.imported.toFixed(2), '', '', ''],
                ])
              }
            >
              <Download size={14} /> CSV
            </Button>
            <Button
              onClick={() => {
                addRun({
                  type: 'day-ahead',
                  title: 'Day-ahead energy plan',
                  date: day.date,
                  sky: day.weather === 'rain' || day.weather === 'cloudy' ? 'cloudy' : 'clear',
                  outage: false,
                  loadFactor,
                  location: settings.location,
                  solarKwh: plan.solarTotal,
                  homeKwh: plan.loadTotal,
                  gridImportKwh: plan.imported,
                  estimatedCost: plan.projectedGridCost,
                  batteryPct: Math.round(plan.batteryEndPct),
                });
                showToast(`Plan for ${day.label} saved to Run History.`);
              }}
            >
              <Save size={14} /> Save plan
            </Button>
          </>
        }
      />

      {/* controls */}
      <Card className="mb-5 flex flex-wrap items-end gap-4 p-5">
        <label className="min-w-[220px] flex-1">
          <span className="field-label">Plan date</span>
          <Select value={String(dateIdx)} onChange={(e) => setDateIdx(Number(e.target.value))}>
            {days.map((d, i) => (
              <option key={d.date} value={i}>
                {i === 0 ? 'Today' : d.label} · {d.productionKwh.toFixed(1)} kWh
              </option>
            ))}
          </Select>
        </label>
        <label className="min-w-[220px] flex-1">
          <span className="field-label">Home routine</span>
          <Select value={String(loadFactor)} onChange={(e) => setLoadFactor(Number(e.target.value))}>
            <option value="1">Typical household day</option>
            <option value="1.3">Higher-use day · +30%</option>
          </Select>
        </label>
        <div className="flex items-center gap-2 pb-1 text-[12px] text-muted">
          <Sparkles size={14} className="text-solar" />
          Includes {schedule.length} scheduled appliance{schedule.length === 1 ? '' : 's'}
        </div>
      </Card>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<CalendarClock size={13} />} label="Expected solar" tone="orange" value={<>{plan.solarTotal.toFixed(1)} <span className="text-xs text-muted">kWh</span></>} sub={`${day.peakKw.toFixed(2)} kW peak forecast`} />
        <StatTile icon={<CalendarClock size={13} />} label="Estimated home use" tone="blue" value={<>{plan.loadTotal.toFixed(1)} <span className="text-xs text-muted">kWh</span></>} sub={loadFactor > 1 ? 'Higher-use routine' : 'Typical routine + appliances'} />
        <StatTile icon={<CalendarClock size={13} />} label="Grid imports" value={<>{plan.imported.toFixed(1)} <span className="text-xs text-muted">kWh</span></>} sub={`≈ ${money(plan.projectedGridCost)} at ${money(settings.tariff)}/kWh`} />
        <StatTile icon={<CalendarClock size={13} />} label="Self-sufficiency" tone="green" value={`${Math.round(plan.selfSufficiency)}%`} sub={`Battery ends at ${Math.round(plan.batteryEndPct)}%`} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <div className="p-5 pb-3">
            <CardHeader
              title={`Predicted hourly balance · ${longDate(new Date(day.date + 'T12:00:00'))}`}
              subtitle="Weather-based solar output compared with estimated home demand"
              action={
                <div className="flex items-center gap-3 text-[11.5px] font-medium text-muted">
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-solar" />Solar</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />Home</span>
                  <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#6d7178]" />Grid</span>
                </div>
              }
            />
          </div>
          <div className="px-2 pb-4">
            <LineSeriesChart
              data={chartData}
              series={[
                { key: 'Solar', name: 'Solar', color: '#FF944D' },
                { key: 'Home demand', name: 'Home demand', color: '#4169F5' },
                { key: 'Grid import', name: 'Grid import', color: '#6d7178', dashed: true },
              ]}
              unit="kW"
              height={280}
            />
          </div>
        </Card>

        <div className="space-y-5 xl:col-span-4">
          <Card className="p-5">
            <div className="flex items-start gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-[#8fa7ff]">
                <Lightbulb size={17} />
              </span>
              <div>
                <h3 className="text-[14px] font-semibold text-ink">Day-ahead suggestion</h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{advice}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2.5 border-t border-line pt-4 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-muted">CO₂ avoided</span>
                <span className="font-semibold text-leaf num">{plan.co2Avoided.toFixed(1)} kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Solar used directly</span>
                <span className="font-semibold text-ink num">{(plan.solarTotal - plan.exported).toFixed(1)} kWh</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Exported to grid</span>
                <span className="font-semibold text-ink num">{plan.exported.toFixed(1)} kWh</span>
              </div>
            </div>
          </Card>

          <Card className="p-5 pb-3">
            <CardHeader title="Battery through the day" subtitle="State of charge, % of capacity" />
            <div className="px-1">
              <LineSeriesChart
                data={plan.rows.filter((r) => r.hour >= 5).map((r) => ({ label: `${r.hour % 12 || 12}${r.hour >= 12 ? 'p' : 'a'}`, 'Battery %': Math.round(r.batteryPct) }))}
                series={[{ key: 'Battery %', name: 'Charge level', color: '#3FBF7F' }]}
                unit="%"
                height={170}
              />
            </div>
          </Card>
        </div>
      </div>

      {/* dispatch table */}
      <Card className="mt-5">
        <div className="p-5 pb-3">
          <CardHeader title="Dispatch detail" subtitle="Battery charges from surplus and covers demand above the saved reserve" />
        </div>
        <div className="overflow-x-auto px-2 pb-3">
          <table className="w-full min-w-[560px] text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] font-bold uppercase tracking-wider text-faint">
                <th className="px-3.5 py-2">Time</th>
                <th className="px-3.5 py-2">Solar</th>
                <th className="px-3.5 py-2">Home</th>
                <th className="px-3.5 py-2">Grid import</th>
                <th className="px-3.5 py-2">Battery</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.hour} className="border-t border-line text-ink">
                  <td className="px-3.5 py-2 font-medium">{formatTime(r.hour)}</td>
                  <td className="px-3.5 py-2 num text-solar">{r.solar.toFixed(2)} kW</td>
                  <td className="px-3.5 py-2 num text-[#8fa7ff]">{r.load.toFixed(2)} kW</td>
                  <td className="px-3.5 py-2 num">{r.grid.toFixed(2)} kWh</td>
                  <td className="px-3.5 py-2 num text-leaf">{r.batteryPct.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-[11px] text-faint">
          Planning estimates from the SunShift model engine — 94% charge efficiency, 92% discharge efficiency, {settings.reserve}% reserve. Not a
          guarantee of generation or bill amount. Saved {localDateStamp()}.
        </p>
      </Card>

      <Toast message={toast} />
    </div>
  );
}
