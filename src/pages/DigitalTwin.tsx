import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  Home,
  IndianRupee,
  Leaf,
  Pause,
  Play,
  PlugZap,
  RotateCcw,
  Sun,
  Users,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader, Select, Slider, StatTile, Toggle, cn } from '../components/ui';
import { LineSeriesChart, ProductionChart } from '../components/charts';
import { PanelGlyph } from '../components/SolarPanelArt';
import { useStore } from '../lib/store';
import { formatTime } from '../lib/engine';
import { money } from '../lib/format';
import {
  TWIN_DEFAULTS,
  TWIN_DEMAND,
  TWIN_WEATHER,
  simulateTwin,
  suggestedDailyKwh,
  type TwinConfig,
  type TwinResult,
} from '../lib/twinEngine';
import { PageHeader } from '../components/DashboardLayout';

/* ------------------------------------------------------------------ */
/* Diagram primitives                                                  */
/* ------------------------------------------------------------------ */

interface Flow {
  key: string;
  d: string;
  color: string;
  label: string;
  power: number;
  labelPos: { x: number; y: number };
}

function TwinNode({ x, y, w, h, accent, children }: { x: number; y: number; w: number; h: number; accent: string; children: ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={14} fill="#242424" stroke={accent} />
      <foreignObject x={x} y={y} width={w} height={h}>
        <div className="flex h-full flex-col items-center justify-center gap-1">{children}</div>
      </foreignObject>
    </g>
  );
}

function NodeValue({ children }: { children: ReactNode }) {
  return <span className="text-[14px] font-bold leading-none text-ink num">{children}</span>;
}

function NodeCaption({ children }: { children: ReactNode }) {
  return <span className="text-[9.5px] font-semibold uppercase tracking-wider leading-none text-faint">{children}</span>;
}

function FlowLabel({ x, y, color, power }: { x: number; y: number; color: string; power: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle cx={-38} cy={0} r={3.4} fill={color} />
      <text x={-30} y={4} fontSize="11.5" fontWeight="700" fill="#f4f5f7" className="num">
        {power.toFixed(2)} kW
      </text>
    </g>
  );
}

function EnergyFlowDiagram({ sim, hour, config }: { sim: TwinResult; hour: number; config: TwinConfig }) {
  const row = sim.rows[hour];
  const solarToHome = Math.min(row.solarKw, row.loadKw);
  const batteryPct = row.batteryPct;
  const state = row.chargeKw > 0.02 ? 'Charging' : row.dischargeKw > 0.02 ? 'Discharging' : 'Idle';

  const flows: Flow[] = [];
  if (solarToHome > 0.02)
    flows.push({ key: 's-h', d: 'M180 108 C 252 108, 288 162, 345 170', color: '#FF944D', label: 'Solar → Home', power: solarToHome, labelPos: { x: 262, y: 126 } });
  if (row.chargeKw > 0.02)
    flows.push({ key: 's-b', d: 'M180 82 C 300 24, 540 24, 660 82', color: '#3FBF7F', label: 'Solar → Battery', power: row.chargeKw, labelPos: { x: 420, y: 40 } });
  if (row.dischargeKw > 0.02)
    flows.push({ key: 'b-h', d: 'M660 118 C 592 136, 556 158, 495 172', color: '#3FBF7F', label: 'Battery → Home', power: row.dischargeKw, labelPos: { x: 578, y: 136 } });
  if (row.exportKw > 0.02)
    flows.push({ key: 's-g', d: 'M100 138 C 96 232, 226 284, 345 292', color: '#9b9fa8', label: 'Export to grid', power: row.exportKw, labelPos: { x: 196, y: 250 } });
  if (row.gridKw > 0.02)
    flows.push({ key: 'g-h', d: 'M420 256 C 420 246, 420 238, 420 226', color: '#4169F5', label: 'Grid import', power: row.gridKw, labelPos: { x: 456, y: 246 } });

  return (
    <svg viewBox="0 0 840 340" className="w-full" role="img" aria-label="Digital twin energy flow between solar, battery, home and grid">
      {flows.map((f) => (
        <g key={f.key}>
          <path d={f.d} fill="none" stroke={f.color} strokeOpacity={0.22} strokeWidth={7} strokeLinecap="round" />
          <path d={f.d} fill="none" stroke={f.color} strokeWidth={2.2} strokeLinecap="round" strokeDasharray="7 7" className="animate-flow" />
          <circle r={3.4} fill={f.color}>
            <animateMotion dur="2.2s" repeatCount="indefinite" path={f.d} />
          </circle>
          <FlowLabel x={f.labelPos.x} y={f.labelPos.y} color={f.color} power={f.power} />
        </g>
      ))}

      {/* solar array */}
      <TwinNode x={30} y={54} w={150} h={84} accent="rgba(255,148,77,0.45)">
        <PanelGlyph className="h-5 w-5" />
        <NodeValue>{row.solarKw.toFixed(2)} kW</NodeValue>
        <NodeCaption>Solar · {config.solarKw.toFixed(1)} kWp</NodeCaption>
      </TwinNode>

      {/* battery */}
      <TwinNode x={660} y={54} w={150} h={84} accent="rgba(63,191,127,0.45)">
        <BatteryCharging size={15} className="text-leaf" />
        <NodeValue>{Math.round(batteryPct)}%</NodeValue>
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-leaf transition-all duration-500" style={{ width: `${batteryPct}%` }} />
        </div>
        <NodeCaption>
          {state} · {config.batteryKwh.toFixed(1)} kWh
        </NodeCaption>
      </TwinNode>

      {/* home */}
      <TwinNode x={345} y={138} w={150} h={84} accent="rgba(65,105,245,0.5)">
        <Home size={16} className="text-[#8fa7ff]" />
        <NodeValue>{row.loadKw.toFixed(2)} kW</NodeValue>
        <NodeCaption>
          Home · {config.occupants} {config.occupants === 1 ? 'person' : 'people'}
        </NodeCaption>
      </TwinNode>

      {/* grid */}
      <TwinNode x={345} y={256} w={150} h={64} accent="rgba(255,255,255,0.12)">
        <PlugZap size={14} className="text-muted" />
        <NodeValue>{row.gridKw > 0.02 ? `${row.gridKw.toFixed(2)} kW` : row.exportKw > 0.02 ? `${row.exportKw.toFixed(2)} kW` : '—'}</NodeValue>
        <NodeCaption>{row.gridKw > 0.02 ? 'Importing' : row.exportKw > 0.02 ? 'Exporting' : 'No exchange'}</NodeCaption>
      </TwinNode>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Comparison pieces                                                   */
/* ------------------------------------------------------------------ */

interface CompareMetric {
  key: string;
  label: string;
  current: number;
  twin: number;
  betterWhen: 'lower' | 'higher';
  format: (v: number) => string;
}

function DeltaChip({ metric }: { metric: CompareMetric }) {
  const diff = metric.twin - metric.current;
  if (Math.abs(diff) < 0.05) return <Badge tone="grey">No change</Badge>;
  const improved = metric.betterWhen === 'lower' ? diff < 0 : diff > 0;
  const Arrow = diff > 0 ? ArrowUp : ArrowDown;
  return (
    <Badge tone={improved ? 'green' : 'red'} className="gap-1">
      <Arrow size={10.5} strokeWidth={2.6} />
      {`${diff > 0 ? '+' : '−'}${metric.format(Math.abs(diff))}`}
    </Badge>
  );
}

function CompareBarRow({ tag, value, max, color, format }: { tag: string; value: number; max: number; color: string; format: (v: number) => string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-faint">{tag}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
        <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${Math.max(2, (value / max) * 100)}%` }} />
      </div>
      <span className="w-[74px] shrink-0 text-right text-[12px] font-semibold text-ink num">{format(value)}</span>
    </div>
  );
}

function MetricCard({ metric }: { metric: CompareMetric }) {
  const max = Math.max(metric.current, metric.twin, 0.5) * 1.15;
  return (
    <div className="rounded-xl border border-line bg-panel-2/50 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[13px] font-semibold text-ink">{metric.label}</span>
        <DeltaChip metric={metric} />
      </div>
      <div className="mt-2.5 space-y-1.5">
        <CompareBarRow tag="Current" value={metric.current} max={max} color="bg-white/25" format={metric.format} />
        <CompareBarRow tag="Twin" value={metric.twin} max={max} color="bg-accent" format={metric.format} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function DigitalTwin() {
  const { settings } = useStore();
  const [config, setConfig] = useState<TwinConfig>(TWIN_DEFAULTS);
  const [hour, setHour] = useState(13);
  const [playing, setPlaying] = useState(false);
  const [compare, setCompare] = useState(true);

  const patch = (p: Partial<TwinConfig>) => setConfig((c) => ({ ...c, ...p }));

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setHour((h) => ((h - 6 + 1) % 15) + 6), 1200);
    return () => window.clearInterval(id);
  }, [playing]);

  const runOpts = useMemo(() => ({ tariff: settings.tariff, reserve: settings.reserve }), [settings.tariff, settings.reserve]);
  const sim = useMemo(() => simulateTwin(config, runOpts), [config, runOpts]);

  // The unchanged household, run through the same twin model for a fair comparison.
  const currentHome = useMemo<TwinConfig>(
    () => ({
      solarKw: settings.solarKw,
      batteryKwh: settings.batteryKwh,
      batteryPct: Math.round(settings.batteryStart * 100),
      occupants: 4,
      dailyKwh: suggestedDailyKwh(4),
      efficiencyPct: 90,
      weather: 'sunny',
      demand: 'typical',
    }),
    [settings.solarKw, settings.batteryKwh, settings.batteryStart],
  );
  const baseline = useMemo(() => simulateTwin(currentHome, runOpts), [currentHome, runOpts]);

  const metrics: CompareMetric[] = [
    { key: 'cost', label: 'Electricity cost', current: baseline.gridCost, twin: sim.gridCost, betterWhen: 'lower', format: (v) => money(v) },
    { key: 'grid', label: 'Grid dependency', current: baseline.gridImportKwh, twin: sim.gridImportKwh, betterWhen: 'lower', format: (v) => `${v.toFixed(1)} kWh` },
    { key: 'self', label: 'Self-sufficiency', current: baseline.selfSufficiencyPct, twin: sim.selfSufficiencyPct, betterWhen: 'higher', format: (v) => `${v.toFixed(0)}%` },
    { key: 'util', label: 'Solar utilisation', current: baseline.solarUtilisationPct, twin: sim.solarUtilisationPct, betterWhen: 'higher', format: (v) => `${v.toFixed(0)}%` },
    { key: 'co2', label: 'Grid CO₂ emissions', current: baseline.co2Kg, twin: sim.co2Kg, betterWhen: 'lower', format: (v) => `${v.toFixed(1)} kg` },
  ];

  const productionData = useMemo(
    () =>
      sim.rows.map((r) => ({
        label: `${r.hour % 12 || 12}${r.hour < 12 ? 'a' : 'p'}`,
        solar: r.solarKw,
        consumption: r.loadKw,
      })),
    [sim],
  );

  const batteryData = useMemo(
    () =>
      sim.rows.map((r) => ({
        label: `${r.hour % 12 || 12}${r.hour < 12 ? 'a' : 'p'}`,
        battery: r.batteryPct,
        grid: r.gridKw,
      })),
    [sim],
  );

  const row = sim.rows[hour];

  return (
    <div>
      <PageHeader
        title="Energy Digital Twin"
        subtitle="A virtual model of your household energy system. Adjust equipment and scenarios to see how the simulated day responds, then compare against your current setup."
        actions={<Badge tone="blue" dot>Simulated estimates · not live data</Badge>}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* ------------------------------ controls ------------------------------ */}
        <div className="space-y-5 xl:col-span-4">
          <Card>
            <div className="p-5 pb-4">
              <CardHeader title="Twin configuration" subtitle="Changes update the simulation immediately" />
            </div>
            <div className="space-y-4 p-5 pt-2">
              <Slider label="Solar panel capacity" value={config.solarKw} min={1} max={15} step={0.2} onChange={(v) => patch({ solarKw: v })} format={(v) => `${v.toFixed(1)} kW`} />
              <Slider label="Battery capacity" value={config.batteryKwh} min={1} max={20} step={0.5} onChange={(v) => patch({ batteryKwh: v })} format={(v) => `${v.toFixed(1)} kWh`} />
              <Slider label="Current battery charge" value={config.batteryPct} min={0} max={100} step={1} onChange={(v) => patch({ batteryPct: v })} format={(v) => `${v}%`} />
              <div>
                <Slider
                  label="Household occupants"
                  value={config.occupants}
                  min={1}
                  max={8}
                  step={1}
                  onChange={(v) => patch({ occupants: v, dailyKwh: suggestedDailyKwh(v) })}
                  format={(v) => `${v}`}
                />
                <p className="mt-1.5 text-[11px] text-faint">Each occupant adds ≈4 kWh to the suggested daily consumption below.</p>
              </div>
              <Slider label="Daily energy consumption" value={config.dailyKwh} min={4} max={40} step={0.5} onChange={(v) => patch({ dailyKwh: v })} format={(v) => `${v.toFixed(1)} kWh`} />
              <Slider label="Solar generation efficiency" value={config.efficiencyPct} min={50} max={100} step={1} onChange={(v) => patch({ efficiencyPct: v })} format={(v) => `${v}%`} />
            </div>
          </Card>

          <Card>
            <div className="p-5 pb-4">
              <CardHeader title="Scenario simulator" subtitle="One-click operating conditions" />
            </div>
            <div className="space-y-4 p-5 pt-2">
              <label className="block">
                <span className="field-label">Weather</span>
                <Select value={config.weather} onChange={(e) => patch({ weather: e.target.value as TwinConfig['weather'] })}>
                  <option value="sunny">Sunny · full output</option>
                  <option value="cloudy">Cloudy · ~58% output</option>
                  <option value="rain">Rainy · ~42% output</option>
                </Select>
              </label>
              <label className="block">
                <span className="field-label">Household consumption</span>
                <Select value={config.demand} onChange={(e) => patch({ demand: e.target.value as TwinConfig['demand'] })}>
                  <option value="low">Low · −30%</option>
                  <option value="typical">Typical day</option>
                  <option value="high">High · +35%</option>
                </Select>
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <Button variant="secondary" size="sm" onClick={() => patch({ batteryPct: 100 })}>
                  <BatteryFull size={14} /> Battery full
                </Button>
                <Button variant="secondary" size="sm" onClick={() => patch({ batteryPct: 12 })}>
                  <BatteryLow size={14} /> Nearly empty
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2.5 pt-1">
                <p className="text-[11.5px] leading-relaxed text-faint">
                  Uses your saved tariff of {money(settings.tariff)}/kWh and {settings.reserve}% battery reserve.
                </p>
                <Button variant="ghost" size="sm" onClick={() => setConfig(TWIN_DEFAULTS)} className="shrink-0">
                  <RotateCcw size={13} /> Reset
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* ------------------------- diagram + snapshot ------------------------- */}
        <div className="space-y-5 xl:col-span-8">
          <Card>
            <div className="p-5 pb-4">
              <CardHeader
                title="Virtual energy system"
                subtitle={`Simulated snapshot at ${formatTime(hour)}`}
                action={
                  <Badge tone={row.solarKw > 0.3 ? 'orange' : 'grey'} dot>
                    {row.solarKw > 0.3 ? 'Producing' : 'After sunset'}
                  </Badge>
                }
              />
            </div>
            <div className="px-5">
              <EnergyFlowDiagram sim={sim} hour={hour} config={config} />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 pb-5 pt-2">
              {[
                { label: 'Solar → Home', value: Math.min(row.solarKw, row.loadKw), color: '#FF944D' },
                { label: 'Battery charge / discharge', value: row.chargeKw > 0.02 ? row.chargeKw : row.dischargeKw, color: '#3FBF7F' },
                { label: row.gridKw > 0.02 ? 'Grid import' : 'Export to grid', value: row.gridKw > 0.02 ? row.gridKw : row.exportKw, color: row.gridKw > 0.02 ? '#4169F5' : '#9b9fa8' },
              ]
                .filter((f) => f.value > 0.02)
                .map((f) => (
                  <span key={f.label} className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
                    <span className="h-2 w-2 rounded-full" style={{ background: f.color }} />
                    {f.label}
                    <span className="font-bold text-ink num">{f.value.toFixed(2)} kW</span>
                  </span>
                ))}
              {row.solarKw <= 0.02 && row.gridKw <= 0.02 && row.exportKw <= 0.02 && row.chargeKw <= 0.02 && row.dischargeKw <= 0.02 ? (
                <p className="text-[13px] text-muted">Minimal energy exchange at this hour.</p>
              ) : null}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon={<Sun size={13} />} label="Solar now" tone="orange" value={<>{row.solarKw.toFixed(2)} <span className="text-xs text-muted">kW</span></>} sub={`Peak ${sim.peakSolarKw.toFixed(2)} kW at ${formatTime(sim.peakSolarHour)}`} />
            <StatTile icon={<Home size={13} />} label="Home now" tone="blue" value={<>{row.loadKw.toFixed(2)} <span className="text-xs text-muted">kW</span></>} sub={`Peak ${sim.peakLoadKw.toFixed(2)} kW`} />
            <StatTile
              icon={<BatteryCharging size={13} />}
              label="Battery"
              tone="green"
              value={`${Math.round(row.batteryPct)}%`}
              sub={row.chargeKw > 0.02 ? `+${row.chargeKw.toFixed(2)} kW in` : row.dischargeKw > 0.02 ? `−${row.dischargeKw.toFixed(2)} kW out` : 'idle'}
            />
            <StatTile
              icon={<PlugZap size={13} />}
              label="Grid"
              value={row.gridKw > 0.02 ? `${row.gridKw.toFixed(2)} kW` : `${row.exportKw.toFixed(2)} kW`}
              sub={row.gridKw > 0.02 ? 'Importing' : row.exportKw > 0.02 ? 'Exporting' : 'Idle'}
            />
          </div>

          <Card className="p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-[220px] flex-1">
                <Slider label="Time of day" value={hour} min={6} max={20} onChange={setHour} format={(v) => formatTime(v)} />
              </div>
              <Button variant="secondary" size="sm" onClick={() => setPlaying((p) => !p)} className="shrink-0">
                {playing ? <Pause size={14} /> : <Play size={14} />}
                {playing ? 'Pause day' : 'Play day'}
              </Button>
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
              Scrub through the simulated day to watch power move between the array, battery, home and grid. Flows are modelled
              estimates, not measurements.
            </p>
          </Card>
        </div>
      </div>

      {/* --------------------------- live results --------------------------- */}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile icon={<Sun size={13} />} label="Solar generation" tone="orange" value={<>{sim.solarKwh.toFixed(1)} <span className="text-xs text-muted">kWh</span></>} sub="per simulated day" />
        <StatTile icon={<Users size={13} />} label="Energy demand" tone="blue" value={<>{sim.demandKwh.toFixed(1)} <span className="text-xs text-muted">kWh</span></>} sub={`${config.occupants} occupants · ${TWIN_DEMAND[config.demand].label.toLowerCase()}`} />
        <StatTile icon={<BatteryCharging size={13} />} label="Battery in / out" tone="green" value={<>{sim.chargedKwh.toFixed(1)} <span className="text-xs text-muted">in</span> · {sim.dischargedKwh.toFixed(1)} <span className="text-xs text-muted">out</span></>} sub={`Ends day at ${Math.round(sim.batteryEndPct)}%`} />
        <StatTile icon={<PlugZap size={13} />} label="Grid electricity" tone="blue" value={<>{sim.gridImportKwh.toFixed(1)} <span className="text-xs text-muted">kWh</span></>} sub={`${sim.gridExportKwh.toFixed(1)} kWh exported`} />
        <StatTile icon={<IndianRupee size={13} />} label="Electricity cost" tone="orange" value={money(sim.gridCost)} sub={`${money(settings.tariff)}/kWh · per day`} />
        <StatTile icon={<Leaf size={13} />} label="CO₂ emissions" tone="green" value={<>{sim.co2Kg.toFixed(1)} <span className="text-xs text-muted">kg</span></>} sub={`${sim.co2AvoidedKg.toFixed(1)} kg avoided`} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="p-5 pb-3">
          <CardHeader title="Generation vs demand" subtitle="Simulated hourly profile for the modelled day" className="mb-2" />
          <ProductionChart data={productionData} height={260} />
        </Card>
        <Card className="p-5 pb-3">
          <CardHeader title="Battery & grid exchange" subtitle="Charge level (%) and grid imports (kW) through the day" className="mb-2" />
          <LineSeriesChart
            data={batteryData}
            series={[
              { key: 'battery', name: 'Battery charge %', color: '#3FBF7F' },
              { key: 'grid', name: 'Grid import kW', color: '#4169F5' },
            ]}
            unit=""
            height={260}
          />
        </Card>
      </div>

      {/* --------------------------- comparison ---------------------------- */}
      <Card className="mt-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <CardHeader
            title="Comparison mode"
            subtitle="Your current household setup vs the modified digital twin — both run through the same deterministic model, per simulated day"
          />
          <Toggle checked={compare} onChange={setCompare} label="Compare setups" />
        </div>
        {compare ? (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {metrics.map((m) => (
              <MetricCard key={m.key} metric={m} />
            ))}
            <div className="rounded-xl border border-dashed border-line-strong bg-panel-2/30 p-3.5 md:col-span-2 xl:col-span-1">
              <p className="text-[11.5px] leading-relaxed text-muted">
                {TWIN_WEATHER[config.weather].label} weather · {TWIN_DEMAND[config.demand].label.toLowerCase()} consumption · {config.efficiencyPct}%
                system efficiency. Current setup reflects your saved Settings; green means the twin improves on it.
              </p>
            </div>
          </div>
        ) : null}
      </Card>

      <p className="mt-4 text-[11px] leading-relaxed text-faint">
        All values on this page are simulated estimates generated by the built-in deterministic twin model. The twin is not
        connected to an inverter, smart meter or any physical hardware.
      </p>
    </div>
  );
}
