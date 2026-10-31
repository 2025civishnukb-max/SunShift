import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Modal, Select, StatTile, TextInput, Toast, useToast } from '../components/ui';
import { useStore } from '../lib/store';
import { shortDateTime } from '../lib/format';
import { PageHeader } from '../components/DashboardLayout';

export default function RunHistory() {
  const { runs, clearRuns, settings } = useStore();
  const { toast, showToast } = useToast();
  const [filter, setFilter] = useState<'all' | 'scenario' | 'day-ahead'>('all');
  const [query, setQuery] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return runs.filter((r) => {
      const typeOk = filter === 'all' || r.type === filter;
      const qOk = !q || r.title.toLowerCase().includes(q) || r.location.toLowerCase().includes(q) || r.date.includes(q);
      return typeOk && qOk;
    });
  }, [runs, filter, query]);

  const totalSolar = runs.reduce((s, r) => s + r.solarKwh, 0);
  const avgGrid = runs.length ? runs.reduce((s, r) => s + r.gridImportKwh, 0) / runs.length : 0;
  const totalCost = runs.reduce((s, r) => s + r.estimatedCost, 0);

  return (
    <div>
      <PageHeader
        title="Run History"
        subtitle="Saved scenario runs and day-ahead plans with their assumptions and estimated results."
        actions={
          runs.length > 0 ? (
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              <Trash2 size={14} /> Clear history
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<CalendarClock size={13} />} label="Saved runs" tone="blue" value={runs.length} sub="Scenarios + plans" />
        <StatTile icon={<SlidersHorizontal size={13} />} label="Solar forecast total" tone="orange" value={<>{totalSolar.toFixed(0)} <span className="text-xs text-muted">kWh</span></>} sub="Across all runs" />
        <StatTile icon={<CalendarClock size={13} />} label="Avg grid import" value={<>{avgGrid.toFixed(1)} <span className="text-xs text-muted">kWh</span></>} sub="Per run" />
        <StatTile icon={<AlertTriangle size={13} />} label="Estimated grid cost" tone="green" value={`₹${Math.round(totalCost).toLocaleString('en-IN')}`} sub={`at ${settings.location.split(',')[0]} tariff`} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 p-5 pb-4">
          <CardHeader title="Saved calculations" subtitle={`${filtered.length} of ${runs.length} shown`} className="flex-1" />
          <div className="relative w-full max-w-[240px]">
            <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search runs…" className="py-2 pl-9" />
          </div>
          <div className="w-[170px]">
            <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="py-2">
              <option value="all">All types</option>
              <option value="scenario">Scenarios</option>
              <option value="day-ahead">Day-ahead plans</option>
            </Select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<SlidersHorizontal size={20} />}
              title={runs.length === 0 ? 'No saved calculations yet' : 'Nothing matches this filter'}
              body={
                runs.length === 0
                  ? 'Run a what-if scenario or save a day-ahead plan and it will appear here with its assumptions and results.'
                  : 'Try a different search term or switch the type filter back to “All types”.'
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto px-2 pb-3">
            <table className="w-full min-w-[760px] text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] font-bold uppercase tracking-wider text-faint">
                  <th className="px-3.5 py-2">Saved</th>
                  <th className="px-3.5 py-2">Run</th>
                  <th className="px-3.5 py-2">Solar</th>
                  <th className="px-3.5 py-2">Home</th>
                  <th className="px-3.5 py-2">Grid</th>
                  <th className="px-3.5 py-2 text-right">Grid cost</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-line transition-colors hover:bg-white/[0.02]">
                    <td className="px-3.5 py-3">
                      <p className="font-semibold text-ink">{shortDateTime(r.timestamp)}</p>
                      <p className="text-[11px] text-faint">{r.location}</p>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={r.type === 'day-ahead' ? 'blue' : 'orange'}>{r.type === 'day-ahead' ? 'Plan' : 'Scenario'}</Badge>
                      </div>
                      <p className="mt-1 text-[11.5px] text-muted">{r.title}</p>
                    </td>
                    <td className="px-3.5 py-3 font-semibold text-solar num">{r.solarKwh.toFixed(1)} kWh</td>
                    <td className="px-3.5 py-3 text-ink num">{r.homeKwh.toFixed(1)} kWh</td>
                    <td className="px-3.5 py-3 text-muted num">{r.gridImportKwh.toFixed(1)} kWh</td>
                    <td className="px-3.5 py-3 text-right font-bold text-ink num">₹{Math.round(r.estimatedCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-line px-5 py-3 text-[11px] text-faint">
          Runs are stored in this browser (sample data mode). Connect Supabase to persist run history across devices.
        </p>
      </Card>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Clear run history?" width="max-w-md">
        <p className="text-[13px] leading-relaxed text-muted">
          This removes all {runs.length} saved runs from this browser. Scenarios and plans already saved cannot be recovered.
        </p>
        <div className="mt-5 flex justify-end gap-2.5">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            Keep history
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              clearRuns();
              setConfirmOpen(false);
              showToast('Run history cleared.');
            }}
          >
            <Trash2 size={14} /> Clear all
          </Button>
        </div>
      </Modal>

      <Toast message={toast} />
    </div>
  );
}
