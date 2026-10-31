import { useMemo, useState } from 'react';
import {
  Car,
  CookingPot,
  Droplets,
  Flame,
  Plug,
  Plus,
  Search,
  Shirt,
  Sprout,
  Trash2,
  Utensils,
  WashingMachine,
  Waves,
  Wind,
  Clock,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, Modal, Select, Slider, TextInput, Toast, cn, useToast } from '../components/ui';
import { useStore } from '../lib/store';
import { APPLIANCES } from '../lib/mockData';
import { bestApplianceTimes, formatTime } from '../lib/engine';
import { PageHeader } from '../components/DashboardLayout';

const APPLIANCE_ICONS: Record<string, LucideIcon> = {
  'washing-machine': WashingMachine,
  utensils: Utensils,
  flame: Flame,
  wind: Wind,
  car: Car,
  droplets: Droplets,
  sprout: Sprout,
  'cooking-pot': CookingPot,
  shirt: Shirt,
  waves: Waves,
  plug: Plug,
};

export default function Appliances() {
  const { settings, schedule, addSchedule, removeSchedule } = useStore();
  const { toast, showToast } = useToast();
  const [query, setQuery] = useState('');
  const [selectedName, setSelectedName] = useState(APPLIANCES[0].name);
  const [preferredHour, setPreferredHour] = useState(13);
  const [sky, setSky] = useState<'clear' | 'cloudy'>('clear');
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customKwh, setCustomKwh] = useState('1.5');

  const catalog = useMemo(() => {
    const base = [...APPLIANCES];
    const custom = schedule
      .filter((s) => !APPLIANCES.some((a) => a.name === s.name))
      .map((s) => ({ name: s.name, kwh: s.kwh, icon: 'plug', category: 'Laundry & kitchen' as const }));
    const all = [...base, ...custom];
    const q = query.trim().toLowerCase();
    return q ? all.filter((a) => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)) : all;
  }, [query, schedule]);

  const selected = catalog.find((a) => a.name === selectedName) ?? catalog[0] ?? APPLIANCES[0];
  const best = useMemo(
    () => bestApplianceTimes({ settings, sky, applianceKwh: selected?.kwh ?? 1, preferredHour }),
    [settings, sky, selected, preferredHour],
  );

  const scheduledEnergy = schedule.reduce((s, item) => s + item.kwh, 0);
  const coveredBySolar = best[0]?.savings ?? 0;

  return (
    <div>
      <PageHeader
        title="Appliance Scheduler"
        subtitle="Pick an appliance, compare start times against the estimated solar surplus, and add the sunniest window to today's plan."
        actions={
          <div className="flex rounded-xl border border-line bg-panel-2 p-1">
            {(['clear', 'cloudy'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSky(s)}
                className={cn(
                  'rounded-lg px-3.5 py-1.5 text-[12px] font-semibold transition-all',
                  sky === s ? 'bg-accent text-white' : 'text-muted hover:text-ink',
                )}
              >
                {s === 'clear' ? 'Clear sky' : 'Cloudy sky'}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* picker */}
        <Card className="xl:col-span-5">
          <div className="p-5 pb-4">
            <CardHeader
              title="Appliance picker"
              subtitle="Search the catalogue"
              action={
                <Button size="sm" variant="secondary" onClick={() => setCustomOpen(true)}>
                  <Plus size={13} /> Custom
                </Button>
              }
            />
            <div className="relative mt-4">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search appliances…"
                className="pl-9"
              />
            </div>
          </div>
          <div className="max-h-[420px] space-y-2 overflow-y-auto px-5 pb-5">
            {catalog.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted">No appliances match “{query}”.</p>
            ) : (
              catalog.map((a) => {
                const Icon = APPLIANCE_ICONS[a.icon] ?? Plug;
                const active = selected?.name === a.name;
                return (
                  <button
                    key={a.name}
                    onClick={() => setSelectedName(a.name)}
                    className={cn(
                      'flex w-full items-center gap-3.5 rounded-xl border p-3 text-left transition-all',
                      active ? 'border-accent bg-accent-soft' : 'border-line bg-panel-2/50 hover:border-line-strong',
                    )}
                  >
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border', active ? 'border-accent/40 bg-panel text-[#8fa7ff]' : 'border-line bg-panel text-muted')}>
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">{a.name}</span>
                      <span className="block text-[11px] text-muted">{a.category}</span>
                    </span>
                    <Badge tone={active ? 'blue' : 'grey'}>{a.kwh.toFixed(1)} kWh</Badge>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* planner */}
        <div className="space-y-5 xl:col-span-7">
          <Card className="p-5">
            <CardHeader
              title={`Best start times · ${selected?.name ?? ''}`}
              subtitle={`${(selected?.kwh ?? 0).toFixed(1)} kWh per run · scored on solar surplus and your preferred window`}
              action={<Badge tone="orange" dot>Sunny window</Badge>}
            />
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {best.map((slot, i) => (
                <div
                  key={slot.hour}
                  className={cn(
                    'rounded-xl border p-4',
                    i === 0 ? 'border-accent/50 bg-accent-soft' : 'border-line bg-panel-2/50',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-faint">
                      {i === 0 ? 'Best window' : `Option ${i + 1}`}
                    </span>
                    {i === 0 ? <Zap size={13} className="text-solar" /> : null}
                  </div>
                  <p className="mt-2 text-[17px] font-extrabold text-ink num">{formatTime(slot.hour)}</p>
                  <p className="mt-1 text-[11.5px] text-muted">
                    {Math.round(slot.solarCovered * 100)}% solar · saves {`₹${Math.round(slot.savings)}`}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Slider
                label="Preferred start time"
                value={preferredHour}
                min={8}
                max={17}
                onChange={setPreferredHour}
                format={formatTime}
              />
              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={() => {
                    if (!selected) return;
                    addSchedule({ name: selected.name, hour: best[0].hour, timeLabel: formatTime(best[0].hour), kwh: selected.kwh });
                    showToast(`${selected.name} added to today's plan at ${formatTime(best[0].hour)}.`);
                  }}
                >
                  <Plus size={15} /> Add best time to today's plan
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader
              title="Today's plan"
              subtitle={`${schedule.length} appliance${schedule.length === 1 ? '' : 's'} · ${scheduledEnergy.toFixed(1)} kWh scheduled`}
              action={<Badge tone="green">≈ ₹{Math.round(coveredBySolar)} solar value</Badge>}
            />
            <div className="mt-4 space-y-2">
              {schedule.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line-strong py-8 text-center text-[13px] text-muted">
                  Nothing scheduled yet — pick an appliance and add its sunniest window.
                </p>
              ) : (
                [...schedule]
                  .sort((a, b) => a.hour - b.hour)
                  .map((item) => {
                    const Icon = APPLIANCE_ICONS[APPLIANCES.find((a) => a.name === item.name)?.icon ?? 'plug'] ?? Plug;
                    return (
                      <div key={item.id} className="flex items-center gap-3.5 rounded-xl border border-line bg-panel-2/50 p-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-leaf-soft text-leaf">
                          <Icon size={15} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-ink">{item.name}</p>
                          <p className="text-[11px] text-muted">{item.kwh.toFixed(1)} kWh run</p>
                        </div>
                        <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink num">
                          <Clock size={13} className="text-muted" /> {item.timeLabel}
                        </span>
                        <button
                          onClick={() => {
                            removeSchedule(item.id);
                            showToast(`${item.name} removed from today's plan.`);
                          }}
                          className="rounded-lg p-2 text-faint transition-colors hover:bg-danger-soft hover:text-danger"
                          aria-label={`Remove ${item.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* custom appliance modal */}
      <Modal open={customOpen} onClose={() => setCustomOpen(false)} title="Add custom appliance">
        <div className="space-y-4">
          <Field label="Appliance name">
            <TextInput value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Borewell pump" />
          </Field>
          <Field label="Energy per run (kWh)">
            <TextInput type="number" min={0.1} step={0.1} value={customKwh} onChange={(e) => setCustomKwh(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2.5 pt-1">
            <Button variant="secondary" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!customName.trim() || !(Number(customKwh) > 0)}
              onClick={() => {
                const name = customName.trim();
                const kwhNum = Math.min(15, Math.max(0.1, Number(customKwh)));
                addSchedule({ name, hour: best[0]?.hour ?? 12, timeLabel: formatTime(best[0]?.hour ?? 12), kwh: kwhNum });
                setSelectedName(name);
                setCustomOpen(false);
                setCustomName('');
                showToast(`${name} added to today's plan.`);
              }}
            >
              Add appliance
            </Button>
          </div>
        </div>
      </Modal>

      <Toast message={toast} />
    </div>
  );
}
