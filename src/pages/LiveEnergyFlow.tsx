import { useMemo, useState } from 'react';
import { BatteryCharging, Home, PlugZap, Sun, Zap, ArrowDown, ArrowUp } from 'lucide-react';
import { Badge, Card, CardHeader, Slider, StatTile, cn } from '../components/ui';
import { PanelGlyph } from '../components/SolarPanelArt';
import { useStore } from '../lib/store';
import { simulate } from '../lib/engine';
import { money } from '../lib/format';
import { PageHeader } from '../components/DashboardLayout';

interface Flow {
  key: string;
  d: string;
  color: string;
  label: string;
  power: number;
}

export default function LiveEnergyFlow() {
  const { settings } = useStore();
  const [hour, setHour] = useState(13);
  const sim = useMemo(() => simulate({ settings }), [settings]);
  const row = sim.rows.find((r) => r.hour === hour) ?? sim.rows[0];

  const solarToHome = Math.min(row.solar, row.load);
  const solarToBattery = row.charge;
  const batteryToHome = row.discharge;
  const gridToHome = row.grid;
  const solarToGrid = Math.max(0, row.solar - row.load - row.charge);

  const flows: Flow[] = [];
  if (solarToHome > 0.02)
    flows.push({ key: 's-h', d: 'M180 118 C 260 118, 330 165, 412 178', color: '#FF944D', label: 'Solar → Home', power: solarToHome });
  if (solarToBattery > 0.02)
    flows.push({ key: 's-b', d: 'M180 96 C 300 38, 500 38, 628 92', color: '#3FBF7F', label: 'Solar → Battery', power: solarToBattery });
  if (batteryToHome > 0.02)
    flows.push({ key: 'b-h', d: 'M628 130 C 560 145, 520 160, 478 172', color: '#3FBF7F', label: 'Battery → Home', power: batteryToHome });
  if (solarToGrid > 0.02)
    flows.push({ key: 's-g', d: 'M120 142 C 130 235, 250 275, 352 277', color: '#9b9fa8', label: 'Export to grid', power: solarToGrid });
  if (gridToHome > 0.02)
    flows.push({ key: 'g-h', d: 'M415 248 C 415 228, 415 210, 415 212', color: '#4169F5', label: 'Grid import', power: gridToHome });

  const batteryPct = Math.round(row.batteryPct);

  return (
    <div>
      <PageHeader
        title="Live Energy Flow"
        subtitle="How solar power is being split between the home, the battery and the grid at each hour of the modelled day."
        actions={<Badge tone="blue">Modelled dispatch · not live metering</Badge>}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <div className="p-5 pb-4">
            <CardHeader
              title="Energy flow diagram"
              subtitle={`Snapshot at ${hour % 12 || 12}:00 ${hour >= 12 ? 'PM' : 'AM'}`}
              action={
                <Badge tone={row.solar > 0.3 ? 'orange' : 'grey'} dot>
                  {row.solar > 0.3 ? 'Producing' : 'After sunset'}
                </Badge>
              }
            />
          </div>

          <div className="px-5">
            <svg viewBox="0 0 810 330" className="w-full" role="img" aria-label="Energy flow between solar, home, battery and grid">
              {/* flow paths */}
              {flows.map((f) => (
                <g key={f.key}>
                  <path d={f.d} fill="none" stroke={f.color} strokeOpacity={0.22} strokeWidth={7} strokeLinecap="round" />
                  <path d={f.d} fill="none" stroke={f.color} strokeWidth={2.2} strokeLinecap="round" strokeDasharray="7 7" className="animate-flow" />
                  <circle r={3.4} fill={f.color}>
                    <animateMotion dur="2.2s" repeatCount="indefinite" path={f.d} />
                  </circle>
                  <FlowLabel flow={f} />
                </g>
              ))}

              {/* solar node */}
              <Node x={60} y={70} w={120} h={72} accent="rgba(255,148,77,0.45)">
                <PanelGlyph className="h-6 w-6" />
                <Big>{row.solar.toFixed(2)} kW</Big>
                <Small>Solar array</Small>
              </Node>

              {/* home node */}
              <Node x={355} y={140} w={120} h={72} accent="rgba(65,105,245,0.5)">
                <Home size={17} className="text-[#8fa7ff]" />
                <Big>{row.load.toFixed(2)} kW</Big>
                <Small>Home</Small>
              </Node>

              {/* battery node */}
              <Node x={630} y={70} w={120} h={72} accent="rgba(63,191,127,0.45)">
                <BatteryCharging size={17} className="text-leaf" />
                <Big>{batteryPct}%</Big>
                <Small>{solarToBattery > 0.02 ? 'Charging' : batteryToHome > 0.02 ? 'Discharging' : 'Idle'}</Small>
              </Node>

              {/* grid node */}
              <Node x={355} y={250} w={120} h={60} accent="rgba(255,255,255,0.12)">
                <PlugZap size={16} className="text-muted" />
                <Big>{gridToHome > 0.02 ? `${gridToHome.toFixed(2)} kW` : solarToGrid > 0.02 ? `${solarToGrid.toFixed(2)} kW` : '—'}</Big>
                <Small>{gridToHome > 0.02 ? 'Importing' : solarToGrid > 0.02 ? 'Exporting' : 'No exchange'}</Small>
              </Node>
            </svg>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 pb-5 pt-1">
            {flows.length === 0 ? (
              <p className="text-[13px] text-muted">No significant energy exchange at this hour.</p>
            ) : (
              flows.map((f) => (
                <span key={f.key} className="flex items-center gap-2 text-[12.5px] font-medium text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: f.color }} />
                  {f.label}
                  <span className="font-bold text-ink num">{f.power.toFixed(2)} kW</span>
                </span>
              ))
            )}
          </div>
        </Card>

        <div className="space-y-5 xl:col-span-4">
          <Card className="p-5">
            <Slider
              label="Time of day"
              value={hour}
              min={6}
              max={20}
              onChange={setHour}
              format={(v) => `${v % 12 || 12}:00 ${v >= 12 ? 'PM' : 'AM'}`}
            />
            <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
              Scrub through the modelled day. Battery dispatch follows your saved reserve of {settings.reserve}% and capacity of{' '}
              {settings.batteryKwh.toFixed(1)} kWh.
            </p>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <StatTile icon={<Sun size={13} />} label="Solar" tone="orange" value={<>{row.solar.toFixed(2)} <span className="text-xs text-muted">kW</span></>} sub="Current output" />
            <StatTile icon={<Home size={13} />} label="Home" tone="blue" value={<>{row.load.toFixed(2)} <span className="text-xs text-muted">kW</span></>} sub="Estimated demand" />
            <StatTile icon={<BatteryCharging size={13} />} label="Battery" tone="green" value={`${batteryPct}%`} sub={solarToBattery > 0.02 ? `+${solarToBattery.toFixed(2)} kW in` : batteryToHome > 0.02 ? `−${batteryToHome.toFixed(2)} kW out` : 'idle'} />
            <StatTile icon={<PlugZap size={13} />} label="Grid" value={gridToHome > 0.02 ? `${gridToHome.toFixed(2)} kW` : `${solarToGrid.toFixed(2)} kW`} sub={gridToHome > 0.02 ? 'Importing' : solarToGrid > 0.02 ? 'Exporting' : 'Idle'} />
          </div>

          <Card className="p-5">
            <CardHeader title="Day so far" subtitle="6:00 AM – 8:00 PM model" />
            <div className="mt-4 space-y-3">
              <TotalRow icon={<Zap size={14} className="text-solar" />} label="Solar generated" value={`${sim.solarTotal.toFixed(1)} kWh`} />
              <TotalRow icon={<ArrowDown size={14} className="text-[#8fa7ff]" />} label="Grid imported" value={`${sim.imported.toFixed(1)} kWh`} />
              <TotalRow icon={<ArrowUp size={14} className="text-muted" />} label="Grid exported" value={`${sim.exported.toFixed(1)} kWh`} />
              <TotalRow icon={<BatteryCharging size={14} className="text-leaf" />} label="Battery at 1 PM" value={`${sim.batteryNow.toFixed(1)} kWh`} />
              <TotalRow icon={<Zap size={14} className="text-leaf" />} label="Estimated saved" value={money(sim.savings)} strong />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Node({ x, y, w, h, accent, children }: { x: number; y: number; w: number; h: number; accent: string; children: React.ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={14} fill="#242424" stroke={accent} />
      <foreignObject x={x} y={y} width={w} height={h}>
        <div className={cn('flex h-full flex-col items-center justify-center gap-1')}>{children}</div>
      </foreignObject>
    </g>
  );
}

function Big({ children }: { children: React.ReactNode }) {
  return <span className="text-[13px] font-bold leading-none text-ink num">{children}</span>;
}

function Small({ children }: { children: React.ReactNode }) {
  return <span className="text-[9.5px] font-semibold uppercase tracking-wider leading-none text-faint">{children}</span>;
}

function FlowLabel({ flow }: { flow: Flow }) {
  const positions: Record<string, { x: number; y: number }> = {
    's-h': { x: 285, y: 130 },
    's-b': { x: 402, y: 52 },
    'b-h': { x: 560, y: 128 },
    's-g': { x: 200, y: 235 },
    'g-h': { x: 452, y: 232 },
  };
  const pos = positions[flow.key];
  if (!pos) return null;
  return (
    <g transform={`translate(${pos.x}, ${pos.y})`}>
      <rect x={-36} y={-13} width={72} height={22} rx={8} fill="#191919" stroke="rgba(255,255,255,0.14)" />
      <text x="0" y="4" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#f4f5f7">
        {flow.power.toFixed(2)} kW
      </text>
    </g>
  );
}

function TotalRow({ icon, label, value, strong }: { icon: React.ReactNode; label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-[12.5px] text-muted">
        {icon}
        {label}
      </span>
      <span className={cn('num text-[13px]', strong ? 'font-bold text-leaf' : 'font-semibold text-ink')}>{value}</span>
    </div>
  );
}
