export const money = (amount: number, decimals = 0): string =>
  `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}`;

export const kwh = (value: number, decimals = 1): string => `${value.toFixed(decimals)} kWh`;

export const compact = (value: number): string =>
  value >= 100000 ? `${(value / 100000).toFixed(1)}L` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`;

export const localDateStamp = (date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const longDate = (date = new Date()): string =>
  date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const shortDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export const pct = (value: number, decimals = 0): string => `${value.toFixed(decimals)}%`;

export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
