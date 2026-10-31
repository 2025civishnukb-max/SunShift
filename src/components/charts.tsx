import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from './ui';

/* ------------------------------ Shared pieces ----------------------------- */

export const AXIS_STYLE = {
  stroke: 'transparent',
  tick: { fill: '#6d7178', fontSize: 11, fontWeight: 500 },
  tickLine: false,
} as const;

export function GridLines({ vertical = true }: { vertical?: boolean }) {
  return <CartesianGrid stroke="rgba(255,255,255,0.055)" vertical={vertical} horizontal strokeDasharray="4 6" />;
}

interface TipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  unit?: string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  unit = 'kWh',
}: {
  active?: boolean;
  payload?: TipEntry[];
  label?: string | number;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tip-title">{label}</div>
      {payload.map((entry) => (
        <div className="tip-row" key={String(entry.dataKey)}>
          <span className="tip-dot" style={{ background: entry.color }} />
          <span className="text-muted">{entry.name}</span>
          <span className="tip-value">
            {typeof entry.value === 'number' ? entry.value.toLocaleString('en-IN') : entry.value} {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

/* --------------------------- Energy production ---------------------------- */

export interface ProductionPoint {
  label: string;
  solar: number;
  consumption: number;
}

export function ProductionChart({
  data,
  height = 296,
  showConsumption = true,
  solarColor = '#FF944D',
  consumptionColor = '#4169F5',
  solarName = 'Solar generated',
  consumptionName = 'Household consumption',
}: {
  data: ProductionPoint[];
  height?: number;
  showConsumption?: boolean;
  solarColor?: string;
  consumptionColor?: string;
  solarName?: string;
  consumptionName?: string;
}) {
  const solarId = useId();
  const gridId = useId();
  const yMax = Math.max(10, ...data.map((d) => Math.max(d.solar, d.consumption)));
  const ticks = 4;
  const niceSteps = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const rawStep = yMax / ticks;
  const step = niceSteps.find((s) => s >= rawStep) ?? Math.ceil(rawStep / 1000) * 1000;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
        <defs>
          <linearGradient id={solarId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={solarColor} stopOpacity={0.28} />
            <stop offset="100%" stopColor={solarColor} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={gridId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={consumptionColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor={consumptionColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <GridLines />
        <XAxis dataKey="label" {...AXIS_STYLE} axisLine={false} dy={8} />
        <YAxis {...AXIS_STYLE} axisLine={false} width={54} domain={[0, step * ticks]} ticks={Array.from({ length: ticks + 1 }, (_, i) => i * step)} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeDasharray: '4 4' }} />
        <Area
          type="monotone"
          dataKey="solar"
          name={solarName}
          stroke={solarColor}
          strokeWidth={2.5}
          fill={`url(#${solarId})`}
          dot={false}
          activeDot={{ r: 4.5, fill: solarColor, stroke: '#191919', strokeWidth: 2 }}
          animationDuration={600}
        />
        {showConsumption ? (
          <Area
            type="monotone"
            dataKey="consumption"
            name={consumptionName}
            stroke={consumptionColor}
            strokeWidth={2.5}
            fill={`url(#${gridId})`}
            dot={false}
            activeDot={{ r: 4.5, fill: consumptionColor, stroke: '#191919', strokeWidth: 2 }}
            animationDuration={600}
          />
        ) : null}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------- Line chart ------------------------------ */

export function LineSeriesChart({
  data,
  series,
  height = 260,
  xKey = 'label',
  unit = 'kWh',
  yUnit,
  className,
}: {
  data: Record<string, unknown>[];
  series: { key: string; name: string; color: string; dashed?: boolean }[];
  height?: number;
  xKey?: string;
  unit?: string;
  yUnit?: string;
  className?: string;
}) {
  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
          <GridLines />
          <XAxis dataKey={xKey} {...AXIS_STYLE} axisLine={false} dy={8} />
          <YAxis {...AXIS_STYLE} axisLine={false} width={54} unit={yUnit} />
          <Tooltip content={<ChartTooltip unit={unit} />} cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeDasharray: '4 4' }} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2.4}
              strokeDasharray={s.dashed ? '6 5' : undefined}
              dot={false}
              activeDot={{ r: 4, stroke: '#191919', strokeWidth: 2 }}
              animationDuration={550}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------- Bar chart ------------------------------- */

export function HourBars({
  data,
  height = 200,
  color = '#FF944D',
  secondKey,
  secondColor = '#4169F5',
}: {
  data: { label: string; value: number; second?: number }[];
  height?: number;
  color?: string;
  secondKey?: string;
  secondColor?: string;
}) {
  const max = Math.max(0.1, ...data.map((d) => Math.max(d.value, d.second ?? 0)));
  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="group relative flex h-full flex-1 items-end justify-center gap-[2px]" title={`${d.label}`}>
          <div
            className="w-full max-w-[14px] rounded-t-[4px] transition-opacity group-hover:opacity-80"
            style={{ height: `${Math.max(2, (d.value / max) * 100)}%`, background: `linear-gradient(180deg, ${color}, ${color}55)` }}
          />
          {secondKey && d.second !== undefined ? (
            <div
              className="w-full max-w-[14px] rounded-t-[4px] transition-opacity group-hover:opacity-80"
              style={{ height: `${Math.max(2, (d.second / max) * 100)}%`, background: `linear-gradient(180deg, ${secondColor}, ${secondColor}55)` }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
