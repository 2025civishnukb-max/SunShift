import { NavLink } from 'react-router-dom';
import { Sun, X, Database, Zap } from 'lucide-react';
import { NAV_ITEMS, GROUP_LABEL, type NavItem } from '../nav';
import { cn } from './ui';
import { useStore } from '../lib/store';

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-accent shadow-glow">
        <Sun size={19} className="text-white" strokeWidth={2.2} />
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-solar ring-2 ring-[#1c1c1c]">
          <Zap size={8} className="text-[#191919]" strokeWidth={3} />
        </span>
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold tracking-tight text-ink">
          Sun<span className="text-accent">Shift</span>
        </span>
        <span className="block text-[9px] font-bold uppercase tracking-[0.28em] text-faint">India</span>
      </span>
    </div>
  );
}

function NavSections({ onNavigate }: { onNavigate?: () => void }) {
  const groups: NavItem['group'][] = ['Monitor', 'Optimise', 'Insights', 'Tools'];
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3.5 py-5">
      {groups.map((group) => (
        <div key={group}>
          <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{GROUP_LABEL[group]}</p>
          <ul className="space-y-0.5">
            {NAV_ITEMS.filter((item) => item.group === group).map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all duration-150',
                      isActive
                        ? 'bg-accent text-white shadow-[0_8px_18px_-8px_rgba(65,105,245,0.8)]'
                        : 'text-muted hover:bg-white/[0.05] hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon size={17} strokeWidth={isActive ? 2.2 : 1.9} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function DataNote() {
  return (
    <div className="mx-3.5 mb-4 rounded-xl border border-line bg-panel-2/70 p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-muted">
        <Database size={13} className="text-[#8fa7ff]" />
        Sample data mode
      </div>
      <p className="mt-1 text-[10.5px] leading-relaxed text-faint">
        Modelled estimates from the SunShift planning engine. Ready to connect to Supabase and live inverters.
      </p>
    </div>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[244px] flex-col border-r border-line bg-[#1c1c1c] lg:flex">
        <div className="flex h-[72px] items-center px-5">
          <Logo />
        </div>
        <NavSections />
        <DataNote />
      </aside>

      {/* Mobile drawer */}
      <div className={cn('fixed inset-0 z-40 lg:hidden', open ? '' : 'pointer-events-none')}>
        <div
          className={cn('absolute inset-0 bg-black/60 transition-opacity duration-200', open ? 'opacity-100' : 'opacity-0')}
          onClick={onClose}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 flex w-[272px] flex-col border-r border-line bg-[#1c1c1c] shadow-pop transition-transform duration-250',
            open ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-[72px] items-center justify-between px-5">
            <Logo />
            <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-ink" aria-label="Close navigation">
              <X size={18} />
            </button>
          </div>
          <NavSections onNavigate={onClose} />
          <DataNote />
        </aside>
      </div>
    </>
  );
}

export function BrandLogo() {
  return <Logo />;
}
