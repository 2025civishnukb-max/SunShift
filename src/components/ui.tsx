import { type HTMLAttributes, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, useCallback, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import clsx, { type ClassValue } from 'clsx';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/* --------------------------------- Toast --------------------------------- */

export function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);
  return { toast, showToast };
}

/* ---------------------------------- Card --------------------------------- */

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-2xl border border-line bg-panel shadow-card', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 className="truncate text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* --------------------------------- Badge --------------------------------- */

const badgeTones = {
  blue: 'bg-accent-soft text-[#8fa7ff]',
  orange: 'bg-solar-soft text-solar',
  green: 'bg-leaf-soft text-leaf',
  red: 'bg-danger-soft text-danger',
  grey: 'bg-white/5 text-muted',
} as const;

export function Badge({
  tone = 'grey',
  children,
  className,
  dot,
}: {
  tone?: keyof typeof badgeTones;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  const dotColor =
    tone === 'green' ? 'bg-leaf' : tone === 'orange' ? 'bg-solar' : tone === 'red' ? 'bg-danger' : tone === 'blue' ? 'bg-accent' : 'bg-muted';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none',
        badgeTones[tone],
        className,
      )}
    >
      {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', dotColor, tone !== 'grey' && 'animate-pulse-soft')} /> : null}
      {children}
    </span>
  );
}

/* -------------------------------- Buttons -------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
};

export function Button({ variant = 'primary', size = 'md', className, ...rest }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-[13px]',
        variant === 'primary' && 'bg-accent text-white shadow-[0_8px_20px_-8px_rgba(65,105,245,0.7)] hover:bg-[#5178ff]',
        variant === 'secondary' && 'border border-line-strong bg-white/[0.04] text-ink hover:bg-white/[0.08]',
        variant === 'ghost' && 'text-muted hover:bg-white/[0.06] hover:text-ink',
        variant === 'danger' && 'bg-danger-soft text-danger hover:bg-danger/20',
        className,
      )}
      {...rest}
    />
  );
}

/* --------------------------------- Inputs -------------------------------- */

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          'w-full appearance-none rounded-xl border border-line-strong bg-panel-2 px-3.5 py-2.5 text-[13px] font-medium text-ink outline-none transition-colors hover:border-white/20 focus:border-accent/60 focus:ring-2 focus:ring-accent/25 [&>option]:bg-[#242424]',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-line-strong bg-panel-2 px-3.5 py-2.5 text-[13px] text-ink outline-none transition-colors placeholder:text-faint hover:border-white/20 focus:border-accent/60 focus:ring-2 focus:ring-accent/25',
        className,
      )}
      {...rest}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11px] text-faint">{hint}</span> : null}
    </label>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="field-label mb-0">{label}</span>
        <span className="text-[13px] font-semibold text-ink num">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        className="w-full"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5"
    >
      <span
        className={cn(
          'relative h-6 w-11 rounded-full transition-colors duration-200',
          checked ? 'bg-accent' : 'bg-white/10',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
      {label ? <span className="text-[13px] font-medium text-ink">{label}</span> : null}
    </button>
  );
}

/* --------------------------------- Modal --------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative w-full animate-fade-up rounded-2xl border border-line-strong bg-panel shadow-pop', width)}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-ink" aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------- Stat tiles ------------------------------ */

export function StatTile({
  icon,
  label,
  value,
  sub,
  tone = 'default',
  className,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'grey' | 'blue' | 'orange' | 'green';
  className?: string;
}) {
  const iconTone =
    tone === 'blue'
      ? 'bg-accent-soft text-[#8fa7ff]'
      : tone === 'orange'
        ? 'bg-solar-soft text-solar'
        : tone === 'green'
          ? 'bg-leaf-soft text-leaf'
          : 'bg-white/[0.06] text-muted';
  return (
    <div className={cn('rounded-xl border border-line bg-panel-2/60 p-3.5 transition-colors hover:border-line-strong', className)}>
      <div className="flex items-center gap-2">
        {icon ? <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', iconTone)}>{icon}</span> : null}
        <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint">{label}</span>
      </div>
      <div className="mt-2 text-lg font-bold tracking-tight text-ink num">{value}</div>
      {sub ? <div className="mt-0.5 truncate text-[11px] text-muted">{sub}</div> : null}
    </div>
  );
}

/* --------------------------------- Toast --------------------------------- */

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 animate-fade-up">
      <div className="rounded-xl border border-line-strong bg-[#1d1d1d]/95 px-4 py-2.5 text-[13px] font-medium text-ink shadow-pop">{message}</div>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-panel/60 px-6 py-14 text-center">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-[#8fa7ff]">{icon}</span>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
