import { useMemo, useState } from 'react';
import { CloudSun, History as HistoryIcon, Play, Save, Sun, Users, ZapOff, Zap } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Select, StatTile, Toggle, Toast, cn, useToast } from '../components/ui';
import { LineSeriesChart } from '../components/charts';
import { useStore } from '../lib/store';
import { simulate } from '../lib/engine';
import { localDateStamp, longDate, money } from '../lib/format';
import { PageHeader } from '../components/DashboardLayout';

export default function Scenarios() {
  const { settings, runs, addRun } = useStore();
  const { toast, showToast } = useToast();
  const [sky, setSky] = useState<'clear' | 'cloudy'>('clear');
  const [outage, setOutage] = useState(false);
  const [loadFactor, setLoadFactor] = useState(1);
  const [saved, setSaved] = useState(false);

  const baseline = useMemo(() => simulate({ settings }), [settings]);
  const scenario = useMemo(() => simulate({ settings, sky, outage, loadFactor }), [settings, sky, outage, loadFactor]);

  const chartData = useMemo(
    () =>
      scenario.rows.map((r, i) => ({
        label: `${r.hour % 12 || 12}${r.hour >= 12 ? 'p' : 'a'}`,
        'Scenario solar': Math.round(r.solar * 100) / 100,
        'Clear-day solar': Math.round(baseline.rows[i].solar * 100) / 100,
        'Home demand': Math.round(r.load * 100) / 100,
      })),
    [scenario, baseline],
  );

  const savingsDelta = scenario.savings - baseline.savings;
  const demandLabel = loadFactor > 1 ? 'High demand · +35%' : 'Typical demand';

  const run = () => {
    setSaved(false);
    showToast('Scenario recalculated with the current settings.');
  };

  const save = () => {
    addRun({
      type: 'scenario',
      title: `${sky === 'cloudy' ? 'Cloudy' : 'Clear'} day · ${outage ? 'grid outage' : 'grid available'}`,
      date: localDateStamp(),
      sky,
      outage,
      loadFactor,
      location: settings.location,
      solarKwh: scenario.solarTotal,
      homeKwh: scenario.loadTotal,
      gridImportKwh: scenario.imported,
      estimatedCost: scenario.imported * settings.tariff,
      batteryPct: Math.round((scenario.batteryNow / settings.batteryKwh) * 100),
    });
    setSaved(true);
    showToast('Scenario saved to Run History.');
  };

  return (
    <div>
      <PageHeader
        title="What-if Scenarios"
        subtitle="Change weather, household demand and grid availability, then recalculate the day's energy dispatch and savings."
        actions={<Badge tone="blue">Planning model</Badge>}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* controls */}
        <Card className="xl:col-span-4">
          <div className="p-5 pb-4">
            <CardHeader title="Scenario controls" subtitle="Adjust the assumptions for the modelled day" />
          </div>
          <div className="space-y-4 p-5 pt-2">
            <label className="block">
              <span className="field-label">Sky conditions</span>
              <Select value={sky} onChange={(e) => setSky(e.target.value as 'clear' | 'cloudy')}>
                <option value="clear">Clear day · full solar</option>
                <option value="cloudy">Cloudy day · reduced solar</option>
              </Select>
            </label>
            <label className="block">
              <span className="field-label">Household demand</span>
              <Select value={String(loadFactor)} onChange={(e) => setLoadFactor(Number(e.target.value))}>
                <option value="1">Typical day</option>
                <option value="1.35">High demand · +35%</option>
              </Select>
            </label>
            <div className={cn('rounded-xl border p-4', outage ? 'border-danger/40 bg-danger-soft' : 'border-line bg-panel-2/50')}>
              <Toggle checked={outage} onChange={setOutage} label="Simulate grid outage" />
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                Prioritises essential loads (65%) and protects the battery reserve. Flexible load is shed.
              </p>
            </div>
            <div className="flex gap-2.5 pt-1">
              <Button className="flex-1" onClick={run}>
                <Play size={14} /> Run scenario
              </Button>
              <Button variant="secondary" className="flex-1" onClick={save}>
                <Save size={14} /> {saved ? 'Saved ✓' : 'Save to history'}
              </Button>
            </div>
          </div>
        </Card>

        {/* results */}
        <div className="space-y-5 xl:col-span-8">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon={<Sun size={13} />} label="Solar generated" tone="orange" value={<>{scenario.solarTotal.toFixed(1)} <span className="text-xs text-muted">kWh</span></>} sub={sky === 'cloudy' ? 'Reduced by cloud' : 'Full clear-day output'} />
            <StatTile icon={<Users size={13} />} label="Home demand" tone="blue" value={<>{scenario.loadTotal.toFixed(1)} <span className="text-xs text-muted">kWh</span></>} sub={demandLabel} />
            <StatTile
              icon={outage ? <ZapOff size={13} /> : <Zap size={13} />}
              label={outage ? 'Unserved load' : 'Grid imports'}
              tone={outage ? 'default' : 'blue'}
              value={<>{(outage ? scenario.unserved : scenario.imported).toFixed(1)} <span className="text-xs text-muted">kWh</span></>}
              sub={outage ? `${scenario.shed.toFixed(1)} kWh shed` : `≈ ${money(scenario.imported * settings.tariff)} cost`}
            />
            <StatTile icon={<CloudSun size={13} />} label="Self-sufficiency" tone="green" value={`${Math.round(scenario.selfSufficiency)}%`} sub={`${Math.round(scenario.solarUtilization)}% solar utilised`} />
          </div>

          <Card className="p-5 pb-3">
            <CardHeader
              title="Scenario vs clear-day baseline"
              subtitle="Hourly solar output and home demand"
              action={
                <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', savingsDelta >= 0 ? 'bg-leaf-soft text-leaf' : 'bg-danger-soft text-danger')}>
                  {savingsDelta >= 0 ? '+' : '−'}
                  {money(Math.abs(savingsDelta)).replace('₹', '₹')} vs typical day
                </span>
              }
            />
            <div className="px-1">
              <LineSeriesChart
                data={chartData}
                series={[
                  { key: 'Scenario solar', name: 'Scenario solar', color: '#FF944D' },
                  { key: 'Clear-day solar', name: 'Baseline solar', color: '#FF944D', dashed: true },
                  { key: 'Home demand', name: 'Home demand', color: '#4169F5' },
                ]}
                unit="kW"
                height={250}
              />
            </div>
          </Card>

          {outage ? (
            <Card className="border-danger/30 p-5">
              <div className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
                  <ZapOff size={17} />
                </span>
                <div>
                  <h3 className="text-[14px] font-semibold text-ink">Outage resilience summary</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">
                    Essential loads need <b className="text-ink num">{scenario.loadTotal.toFixed(1)} kWh</b>. The battery covers the evening above the{' '}
                    {settings.reserve}% reserve; <b className="text-ink num">{scenario.unserved.toFixed(1)} kWh</b> of essential load and{' '}
                    <b className="text-ink num">{scenario.shed.toFixed(1)} kWh</b> of flexible load cannot be served.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-5">
              <p className="text-[13px] leading-relaxed text-muted">
                <Sun size={14} className="mr-1.5 inline text-solar" />
                Estimated grid imports are <b className="text-ink num">{scenario.imported.toFixed(1)} kWh</b> at{' '}
                {money(settings.tariff)}/kWh, about <b className="text-ink num">{money(scenario.imported * settings.tariff)}</b> for the day. Solar
                self-sufficiency is <b className="text-ink num">{Math.round(scenario.selfSufficiency)}%</b>.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* recent runs */}
      {runs.length > 0 ? (
        <Card className="mt-5 p-5">
          <CardHeader
            title="Recent scenario saves"
            subtitle={longDate()}
            action={
              <Button size="sm" variant="ghost" onClick={() => (window.location.hash = '#/run-history')}>
                <HistoryIcon size={13} /> View all
              </Button>
            }
          />
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {runs.slice(0, 3).map((r) => (
              <div key={r.id} className="rounded-xl border border-line bg-panel-2/50 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="truncate text-[12.5px] font-semibold text-ink">{r.title}</span>
                  <Badge tone={r.outage ? 'red' : r.sky === 'cloudy' ? 'grey' : 'orange'}>{r.outage ? 'Outage' : r.sky === 'cloudy' ? 'Cloudy' : 'Clear'}</Badge>
                </div>
                <p className="mt-2 text-[11.5px] text-muted num">
                  {r.solarKwh.toFixed(1)} kWh solar · {r.homeKwh.toFixed(1)} kWh home
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Toast message={toast} />
    </div>
  );
}
