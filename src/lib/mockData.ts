import type { ApplianceDef, RunRecord, ScheduleItem } from './types';
import { formatTime } from './engine';

/**
 * Sample data for the dashboard UI. Clearly labelled in the interface —
 * swap this module for the SunShift energy engine / Supabase integration
 * without touching the components.
 */

export const APPLIANCES: ApplianceDef[] = [
  { name: 'Washing machine', kwh: 0.8, icon: 'washing-machine', category: 'Laundry & kitchen' },
  { name: 'Dishwasher', kwh: 1.2, icon: 'utensils', category: 'Laundry & kitchen' },
  { name: 'Water heater', kwh: 2.0, icon: 'flame', category: 'Comfort' },
  { name: 'Air conditioner', kwh: 2.5, icon: 'wind', category: 'Comfort' },
  { name: 'EV charger', kwh: 7.0, icon: 'car', category: 'Mobility' },
  { name: 'Water pump', kwh: 1.1, icon: 'droplets', category: 'Outdoor & utility' },
  { name: 'Irrigation pump', kwh: 1.6, icon: 'sprout', category: 'Outdoor & utility' },
  { name: 'Microwave oven', kwh: 0.3, icon: 'cooking-pot', category: 'Laundry & kitchen' },
  { name: 'Electric iron', kwh: 1.0, icon: 'shirt', category: 'Laundry & kitchen' },
  { name: 'Pool pump', kwh: 2.2, icon: 'waves', category: 'Outdoor & utility' },
];

export function applianceIcon(name: string): string {
  return APPLIANCES.find((a) => a.name === name)?.icon ?? 'plug';
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const SAMPLE_SCHEDULE: ScheduleItem[] = [
  { id: 'seed-1', name: 'Washing machine', hour: 11, timeLabel: formatTime(11), kwh: 0.8, addedAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 'seed-2', name: 'Water heater', hour: 6, timeLabel: formatTime(6), kwh: 2.0, addedAt: new Date(Date.now() - 86400000 * 2).toISOString() },
];

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export const SAMPLE_RUNS: RunRecord[] = [
  {
    id: 'run-1', type: 'scenario', title: 'Clear day · grid available', date: todayIso(), sky: 'clear', outage: false,
    loadFactor: 1, location: 'Pune, Maharashtra', solarKwh: 26.4, homeKwh: 11.4, gridImportKwh: 1.2, estimatedCost: 10, batteryPct: 78,
    timestamp: daysAgo(1),
  },
  {
    id: 'run-2', type: 'day-ahead', title: 'Day-ahead energy plan', date: todayIso(), sky: 'clear', outage: false,
    loadFactor: 1.3, location: 'Pune, Maharashtra', solarKwh: 25.9, homeKwh: 16.8, gridImportKwh: 3.4, estimatedCost: 27, batteryPct: 64,
    timestamp: daysAgo(2),
  },
  {
    id: 'run-3', type: 'scenario', title: 'Cloudy day · grid available', date: todayIso(), sky: 'cloudy', outage: false,
    loadFactor: 1, location: 'Pune, Maharashtra', solarKwh: 14.0, homeKwh: 11.4, gridImportKwh: 4.9, estimatedCost: 39, batteryPct: 41,
    timestamp: daysAgo(4),
  },
  {
    id: 'run-4', type: 'scenario', title: 'Clear day · grid outage', date: todayIso(), sky: 'clear', outage: true,
    loadFactor: 1, location: 'Pune, Maharashtra', solarKwh: 26.4, homeKwh: 7.4, gridImportKwh: 0, estimatedCost: 0, batteryPct: 52,
    timestamp: daysAgo(6),
  },
  {
    id: 'run-5', type: 'day-ahead', title: 'Day-ahead energy plan', date: todayIso(), sky: 'cloudy', outage: false,
    loadFactor: 1, location: 'Pune, Maharashtra', solarKwh: 13.6, homeKwh: 12.9, gridImportKwh: 5.8, estimatedCost: 46, batteryPct: 38,
    timestamp: daysAgo(8),
  },
];
