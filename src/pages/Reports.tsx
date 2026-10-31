import { useMemo, useState } from 'react';
import { BarChart3, BatteryCharging, Download, Eye, FileBarChart2, PiggyBank, Zap } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Modal, Select, Toast, useToast } from '../components/ui';
import { useStore } from '../lib/store';
import { monthlyGeneration, simulate } from '../lib/engine';
import { downloadCsv, localDateStamp, money } from '../lib/format';
import { PageHeader } from '../components/DashboardLayout';

interface ReportDef {
  key: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  tone: 'orange' | 'blue' | 'green' | 'grey';
  build: () => { filename: string; rows: (string | number)[][]; previewHead: string[][]; previewTitle: string };
}

export default function Reports() {
  const { settings, runs, schedule } = useStore();
  const { toast, showToast } = useToast();
  const [period, setPeriod] = useState<'day' | 'month' | 'year'>('month');
  const [preview, setPreview] = useState<{ title: string; head: string[][]; rows: string[][] } | null>(null);

  const sim = useMemo(() => simulate({ settings }), [settings]);
  const months = useMemo(() => monthlyGeneration(settings), [settings]);
  const yearTotal = months.reduce((s, m) => s + m.kwh, 0);
  const selfUseShare = sim.solarTotal > 0 ? Math.min(1, (sim.solarTotal - sim.exported) / sim.solarTotal) : 0.85;

  const reports: ReportDef[] = [
    {
      key: 'dispatch',
      title: 'Hourly energy dispatch',
      body: 'Hour-by-hour solar, demand, grid and battery figures for the modelled day.',
      icon: <Zap size={18} className="text-solar" />,
      tone: 'orange',
      build: () => {
        const rows: (string | number)[][] = [
          ['Hour', 'Solar kWh', 'Home demand kWh', 'Grid import kWh', 'Battery charge kWh', 'Battery discharge kWh', 'Battery %'],
          ...sim.rows.map((r) => [`${r.hour}:00`, r.solar.toFixed(3), r.load.toFixed(3), r.grid.toFixed(3), r.charge.toFixed(3), r.discharge.toFixed(3), r.batteryPct.toFixed(1)]),
          ['TOTAL', sim.solarTotal.toFixed(2), sim.loadTotal.toFixed(2), sim.imported.toFixed(2), '', '', ''],
        ];
        return {
          filename: `sunshift-dispatch-${localDateStamp()}.csv`,
          rows,
          previewTitle: 'Hourly energy dispatch — preview',
          previewHead: rows.slice(0, 6).map((r) => r.map(String)),
        };
      },
    },
    {
      key: 'generation',
      title: 'Monthly generation summary',
      body: 'Modelled monthly generation for the configured system with weather notes.',
      icon: <BarChart3 size={18} className="text-[#8fa7ff]" />,
      tone: 'blue',
      build: () => {
        const rows: (string | number)[][] = [
          ['Month', 'Generation kWh', 'Weather', 'Rain days'],
          ...months.map((m) => [m.fullMonth, m.kwh, m.weather, m.rainDays]),
          ['YEAR TOTAL', yearTotal, '', ''],
        ];
        return {
          filename: `sunshift-generation-${new Date().getFullYear()}.csv`,
          rows,
          previewTitle: 'Monthly generation summary — preview',
          previewHead: rows.slice(0, 6).map((r) => r.map(String)),
        };
      },
    },
    {
      key: 'savings',
      title: 'Savings report',
      body: 'Estimated savings at the saved tariff, monthly and yearly, with CO₂ impact.',
      icon: <PiggyBank size={18} className="text-leaf" />,
      tone: 'green',
      build: () => {
        const rows: (string | number)[][] = [
          ['Month', 'Generation kWh', 'Self-consumed kWh', 'Estimated savings INR'],
          ...months.map((m) => [m.fullMonth, m.kwh, Math.round(m.kwh * selfUseShare), Math.round(m.kwh * selfUseShare * settings.tariff)]),
          ['YEAR', yearTotal, Math.round(yearTotal * selfUseShare), Math.round(yearTotal * selfUseShare * settings.tariff)],
        ];
        return {
          filename: `sunshift-savings-${new Date().getFullYear()}.csv`,
          rows,
          previewTitle: 'Savings report — preview',
          previewHead: rows.slice(0, 6).map((r) => r.map(String)),
        };
      },
    },
    {
      key: 'runs',
      title: 'Run history export',
      body: 'All saved scenario runs and day-ahead plans with their assumptions.',
      icon: <BatteryCharging size={18} className="text-muted" />,
      tone: 'grey',
      build: () => {
        const rows: (string | number)[][] = [
          ['Saved at', 'Type', 'Title', 'Date', 'Location', 'Solar kWh', 'Home kWh', 'Grid kWh', 'Cost INR', 'Battery %'],
          ...runs.map((r) => [r.timestamp, r.type, r.title, r.date, r.location, r.solarKwh.toFixed(2), r.homeKwh.toFixed(2), r.gridImportKwh.toFixed(2), r.estimatedCost.toFixed(2), r.batteryPct]),
        ];
        return {
          filename: `sunshift-run-history-${localDateStamp()}.csv`,
          rows,
          previewTitle: 'Run history export — preview',
          previewHead: rows.slice(0, 6).map((r) => r.map(String)),
        };
      },
    },
  ];

  const handle = (r: ReportDef, action: 'download' | 'preview') => {
    const built = r.build();
    if (action === 'download') {
      downloadCsv(built.filename, built.rows);
      showToast(`${r.title} downloaded as CSV.`);
    } else {
      setPreview({ title: built.previewTitle, head: built.previewHead, rows: built.previewHead.slice(1) });
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Export the modelled results as CSV for spreadsheets, archiving or sharing with your installer."
        actions={
          <div className="w-[190px]">
            <Select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="py-2">
              <option value="day">Daily detail</option>
              <option value="month">Monthly summary</option>
              <option value="year">Yearly overview</option>
            </Select>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {reports.map((r) => (
          <Card key={r.key} className="flex flex-col p-5">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-panel-2">{r.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[14.5px] font-semibold text-ink">{r.title}</h3>
                  <Badge tone={r.tone}>CSV</Badge>
                </div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{r.body}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2.5 border-t border-line pt-4">
              <Button size="sm" className="flex-1" onClick={() => handle(r, 'download')}>
                <Download size={13} /> Download
              </Button>
              <Button size="sm" variant="secondary" className="flex-1" onClick={() => handle(r, 'preview')}>
                <Eye size={13} /> Preview
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-5 p-5">
        <div className="flex items-start gap-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-[#8fa7ff]">
            <FileBarChart2 size={17} />
          </span>
          <div>
            <h3 className="text-[14px] font-semibold text-ink">About these reports</h3>
            <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-muted">
              All figures are generated by the SunShift planning model from your saved settings ({settings.solarKw.toFixed(1)} kWp solar,{' '}
              {settings.batteryKwh.toFixed(1)} kWh battery, {money(settings.tariff)}/kWh tariff) plus {schedule.length} scheduled appliances. They are
              clearly labelled estimates — not meter readings or guarantees — and exports are produced entirely in your browser.
            </p>
          </div>
        </div>
      </Card>

      <Modal open={preview !== null} onClose={() => setPreview(null)} title={preview?.title ?? ''} width="max-w-2xl">
        {preview ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[10.5px] font-bold uppercase tracking-wider text-faint">
                  {preview.head[0]?.map((h, i) => (
                    <th key={i} className="whitespace-nowrap px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.head.slice(1).map((row, ri) => (
                  <tr key={ri} className="border-t border-line">
                    {row.map((cell, ci) => (
                      <td key={ci} className="whitespace-nowrap px-3 py-2 text-ink num">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-faint">Showing the first {preview.head.length - 1} rows. Download the CSV for the full dataset.</p>
          </div>
        ) : null}
      </Modal>

      <Toast message={toast} />
    </div>
  );
}
