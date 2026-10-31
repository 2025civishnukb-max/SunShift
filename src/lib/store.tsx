import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { RunRecord, ScheduleItem, Settings } from './types';
import { DEFAULT_SETTINGS } from './engine';
import { SAMPLE_RUNS, SAMPLE_SCHEDULE } from './mockData';

/**
 * Frontend state store. Persists to localStorage so the demo works standalone;
 * swap the load/persist functions for SunShift backend / Supabase calls.
 */

const STORAGE_KEY = 'sunshift-dashboard-state-v1';

interface PersistedState {
  settings: Settings;
  schedule: ScheduleItem[];
  runs: RunRecord[];
}

function load(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      if (parsed.settings) {
        return {
          settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
          schedule: parsed.schedule ?? SAMPLE_SCHEDULE,
          runs: parsed.runs ?? SAMPLE_RUNS,
        };
      }
    }
  } catch {
    /* fall through to defaults */
  }
  return { settings: DEFAULT_SETTINGS, schedule: SAMPLE_SCHEDULE, runs: SAMPLE_RUNS };
}

function persist(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — keep in-memory only */
  }
}

export interface Store {
  settings: Settings;
  schedule: ScheduleItem[];
  runs: RunRecord[];
  updateSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
  addSchedule: (item: Omit<ScheduleItem, 'id' | 'addedAt'>) => void;
  removeSchedule: (id: string) => void;
  addRun: (record: Omit<RunRecord, 'id' | 'timestamp'>) => void;
  clearRuns: () => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(load);

  const update = useCallback((patch: Partial<PersistedState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      persist(next);
      return next;
    });
  }, []);

  const store = useMemo<Store>(
    () => ({
      settings: state.settings,
      schedule: state.schedule,
      runs: state.runs,
      updateSettings: (patch) => update({ settings: { ...state.settings, ...patch } }),
      resetSettings: () => update({ settings: DEFAULT_SETTINGS }),
      addSchedule: (item) =>
        update({
          schedule: [
            ...state.schedule,
            { ...item, id: crypto.randomUUID(), addedAt: new Date().toISOString() },
          ],
        }),
      removeSchedule: (id) => update({ schedule: state.schedule.filter((s) => s.id !== id) }),
      addRun: (record) =>
        update({
          runs: [
            { ...record, id: crypto.randomUUID(), timestamp: new Date().toISOString() },
            ...state.runs,
          ].slice(0, 100),
        }),
      clearRuns: () => update({ runs: [] }),
    }),
    [state, update],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}
