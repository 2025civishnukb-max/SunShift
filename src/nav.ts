import {
  BatteryCharging,
  Calculator,
  CalendarClock,
  CloudSun,
  FileBarChart2,
  Gauge,
  History,
  LayoutDashboard,
  PiggyBank,
  Ruler,
  Settings as SettingsIcon,
  SlidersHorizontal,
  WashingMachine,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  group: 'Monitor' | 'Optimise' | 'Insights' | 'Tools';
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Overview', icon: LayoutDashboard, group: 'Monitor' },
  { path: '/live-energy-flow', label: 'Live Energy Flow', icon: Gauge, group: 'Monitor' },
  { path: '/digital-twin', label: 'Energy Digital Twin', icon: Workflow, group: 'Monitor' },
  { path: '/forecast', label: 'Solar Forecast', icon: CloudSun, group: 'Monitor' },
  { path: '/battery', label: 'Battery', icon: BatteryCharging, group: 'Monitor' },
  { path: '/appliances', label: 'Appliances', icon: WashingMachine, group: 'Optimise' },
  { path: '/scenarios', label: 'Scenarios', icon: SlidersHorizontal, group: 'Optimise' },
  { path: '/day-ahead-plan', label: 'Day-ahead Plan', icon: CalendarClock, group: 'Optimise' },
  { path: '/savings', label: 'Savings', icon: PiggyBank, group: 'Insights' },
  { path: '/run-history', label: 'Run History', icon: History, group: 'Insights' },
  { path: '/reports', label: 'Reports', icon: FileBarChart2, group: 'Insights' },
  { path: '/rooftop-estimator', label: 'Rooftop Estimator', icon: Ruler, group: 'Tools' },
  { path: '/solar-calculator', label: 'Solar Calculator', icon: Calculator, group: 'Tools' },
  { path: '/settings', label: 'Settings', icon: SettingsIcon, group: 'Tools' },
];

export const GROUP_LABEL: Record<NavItem['group'], string> = {
  Monitor: 'Monitor',
  Optimise: 'Optimise',
  Insights: 'Insights',
  Tools: 'Tools & account',
};
