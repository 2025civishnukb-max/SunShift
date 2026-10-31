import { useState } from 'react';
import { Database, MapPin, RotateCcw, Save, Settings as SettingsIcon, Zap } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, Select, Slider, Toast, useToast } from '../components/ui';
import { useStore } from '../lib/store';
import { CITIES, cityByName } from '../lib/engine';
import { money } from '../lib/format';
import { PageHeader } from '../components/DashboardLayout';

const AZIMUTHS = [
  { value: 0, label: 'South (0°) — best for India' },
  { value: -45, label: 'South-east (−45°)' },
  { value: 45, label: 'South-west (+45°)' },
  { value: -90, label: 'East (−90°)' },
  { value: 90, label: 'West (+90°)' },
];

export default function SettingsPage() {
  const { settings, updateSettings, resetSettings } = useStore();
  const { toast, showToast } = useToast();
  const [draft, setDraft] = useState(settings);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const set = (patch: Partial<typeof draft>) => setDraft({ ...draft, ...patch });
  const city = cityByName(draft.location);

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Home profile used by every estimate in the dashboard — location, solar array, battery and tariff."
        actions={
          <>
            <Button variant="secondary" onClick={() => setDraft(settings)} disabled={!dirty}>
              <RotateCcw size={14} /> Discard changes
            </Button>
            <Button
              disabled={!dirty}
              onClick={() => {
                Object.entries(draft).forEach(([k, v]) => updateSettings({ [k]: v } as never));
                showToast('Home settings saved to your profile.');
              }}
            >
              <Save size={14} /> Save settings
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-7">
          <Card className="p-5">
            <CardHeader title="Home profile" subtitle="Location tunes the generation model and weather patterns" />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Forecast location" hint={`${city.latitude.toFixed(2)}°N, ${city.longitude.toFixed(2)}°E · ${city.yieldPerKwp} kWh/kWp/yr`}>
                <Select value={draft.location} onChange={(e) => set({ location: e.target.value })}>
                  {CITIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Electricity tariff" hint="Used for every savings estimate">
                <Slider label="" value={draft.tariff} min={4} max={20} step={1} format={(v) => `₹${v}/kWh`} onChange={(v) => set({ tariff: v })} />
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Solar array" subtitle="Rooftop system configuration" />
            <div className="mt-5 space-y-5">
              <Slider label="System size" value={draft.solarKw} min={1} max={15} step={0.2} format={(v) => `${v.toFixed(1)} kWp`} onChange={(v) => set({ solarKw: v })} />
              <Slider label="Panel tilt" value={draft.panelTilt} min={0} max={45} step={1} format={(v) => `${v}°`} onChange={(v) => set({ panelTilt: v })} />
              <Field label="Panel direction">
                <Select value={String(draft.panelAzimuth)} onChange={(e) => set({ panelAzimuth: Number(e.target.value) })}>
                  {AZIMUTHS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Battery" subtitle="Storage capacity and protected reserve" />
            <div className="mt-5 space-y-5">
              <Slider label="Capacity" value={draft.batteryKwh} min={2} max={15} step={0.5} format={(v) => `${v.toFixed(1)} kWh`} onChange={(v) => set({ batteryKwh: v })} />
              <Slider label="Protected reserve" value={draft.reserve} min={0} max={50} step={5} format={(v) => `${v}%`} onChange={(v) => set({ reserve: v })} />
              <Slider label="Morning state of charge" value={Math.round(draft.batteryStart * 100)} min={0} max={95} step={5} format={(v) => `${v}%`} onChange={(v) => set({ batteryStart: v / 100 })} />
            </div>
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-5">
          <Card className="p-5">
            <CardHeader title="Impact preview" subtitle="What the current draft settings produce" action={<Badge tone="blue">Live estimate</Badge>} />
            <div className="mt-4 space-y-3">
              <PreviewRow icon={<Zap size={15} className="text-solar" />} label="Yearly generation" value={`${Math.round(draft.solarKw * city.yieldPerKwp).toLocaleString('en-IN')} kWh`} />
              <PreviewRow icon={<Zap size={15} className="text-leaf" />} label="Yearly savings potential" value={money(Math.round((draft.solarKw * city.yieldPerKwp * 0.85) * draft.tariff))} />
              <PreviewRow icon={<MapPin size={15} className="text-[#8fa7ff]" />} label="Location yield" value={`${city.yieldPerKwp} kWh/kWp`} />
            </div>
            <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-faint">
              Assumes 85% self-consumption of generated energy. Exact dispatch is recalculated on every page from these settings.
            </p>
          </Card>

          <Card className="p-5">
            <CardHeader title="Data & integration" subtitle="Where the dashboard gets its numbers" />
            <div className="mt-4 space-y-3 text-[12.5px] leading-relaxed text-muted">
              <div className="flex items-center gap-2.5 rounded-xl border border-line bg-panel-2/50 p-3.5">
                <Database size={16} className="shrink-0 text-[#8fa7ff]" />
                <p>
                  <b className="text-ink">Sample data mode.</b> Values come from the built-in planning engine and are stored in this browser. No
                  backend endpoints are called.
                </p>
              </div>
              <p>
                The data layer lives in <code className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-ink">src/lib/</code> (engine, mock data,
                store). Swap the store's load/persist functions for SunShift engine APIs and Supabase to go live — UI components stay unchanged.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  resetSettings();
                  setDraft({ ...settings, ...{ solarKw: 5.2, batteryKwh: 6, tariff: 8, reserve: 20, batteryStart: 0.42, panelTilt: 20, panelAzimuth: 0, location: 'Pune, Maharashtra', latitude: 18.5204, longitude: 73.8567 } });
                  showToast('Settings reset to SunShift defaults.');
                }}
              >
                <SettingsIcon size={13} /> Reset to defaults
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Toast message={toast} />
    </div>
  );
}

function PreviewRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-line bg-panel-2/50 p-3.5">
      <span className="flex items-center gap-2.5 text-[12.5px] text-muted">
        {icon}
        {label}
      </span>
      <span className="text-[14px] font-bold text-ink num">{value}</span>
    </div>
  );
}
