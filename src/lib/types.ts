export interface Settings {
  solarKw: number;
  batteryKwh: number;
  tariff: number;
  reserve: number;
  batteryStart: number;
  panelTilt: number;
  panelAzimuth: number;
  location: string;
  latitude: number;
  longitude: number;
}

export interface City {
  name: string;
  state: string;
  latitude: number;
  longitude: number;
  /** Annual specific yield, kWh per kWp per year (planning average). */
  yieldPerKwp: number;
}

export type WeatherKind = 'sunny' | 'partly' | 'cloudy' | 'rain';

export interface HourPoint {
  hour: number;
  powerKw: number;
  temperature: number;
}

export interface DayForecast {
  date: string;
  label: string;
  weather: WeatherKind;
  condition: string;
  tempHigh: number;
  tempLow: number;
  rainChance: number;
  productionKwh: number;
  peakKw: number;
  sunrise: string;
  sunset: string;
  hours: HourPoint[];
}

export interface ScheduleItem {
  id: string;
  name: string;
  hour: number;
  timeLabel: string;
  kwh: number;
  addedAt: string;
}

export interface ApplianceDef {
  name: string;
  kwh: number;
  icon: string;
  category: 'Laundry & kitchen' | 'Comfort' | 'Mobility' | 'Outdoor & utility';
}

export interface RunRecord {
  id: string;
  type: 'scenario' | 'day-ahead';
  title: string;
  date: string;
  sky: 'clear' | 'cloudy';
  outage: boolean;
  loadFactor: number;
  location: string;
  solarKwh: number;
  homeKwh: number;
  gridImportKwh: number;
  estimatedCost: number;
  batteryPct: number;
  timestamp: string;
}

export type DispatchRow = {
  hour: number;
  solar: number;
  load: number;
  grid: number;
  charge: number;
  discharge: number;
  batteryPct: number;
};

export interface DispatchResult {
  rows: DispatchRow[];
  solarTotal: number;
  loadTotal: number;
  imported: number;
  exported: number;
  unserved: number;
  shed: number;
  savings: number;
  co2: number;
  batteryNow: number;
  batteryEnd: number;
  selfSufficiency: number;
  solarUtilization: number;
  confidence: number;
}

export interface MonthGeneration {
  month: string;
  fullMonth: string;
  kwh: number;
  weather: WeatherKind;
  rainDays: number;
}
