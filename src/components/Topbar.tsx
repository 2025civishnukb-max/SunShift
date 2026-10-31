import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, KeyRound, LogOut, MapPin, Menu, Search, CalendarDays } from 'lucide-react';
import { NAV_ITEMS } from '../nav';
import { APPLIANCES } from '../lib/mockData';
import { CITIES, cityByName } from '../lib/engine';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { Button, Select, Toast, cn, useToast } from './ui';
import { AuthModal } from './AuthModal';

function SearchBox() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);

  const index = useMemo(
    () => [
      ...NAV_ITEMS.map((item) => ({ kind: 'Page' as const, label: item.label, path: item.path })),
      ...APPLIANCES.map((a) => ({ kind: 'Appliance' as const, label: a.name, path: '/appliances' })),
    ],
    [],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 6);
  }, [query, index]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div ref={boxRef} className="relative hidden w-full max-w-[300px] md:block">
      <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) {
            navigate(results[0].path);
            setQuery('');
            setOpen(false);
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Search pages, appliances…"
        className="w-full rounded-xl border border-line bg-panel py-2.5 pl-9 pr-3 text-[13px] text-ink outline-none transition-colors placeholder:text-faint hover:border-line-strong focus:border-accent/60 focus:ring-2 focus:ring-accent/25"
      />
      {open && results.length > 0 ? (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 animate-fade-up overflow-hidden rounded-xl border border-line-strong bg-[#1d1d1d] shadow-pop">
          {results.map((r, i) => (
            <button
              key={`${r.kind}-${r.label}-${i}`}
              onClick={() => {
                navigate(r.path);
                setQuery('');
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[13px] text-ink transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-white/[0.05]"
            >
              <span>{r.label}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">{r.kind}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { settings, updateSettings } = useStore();
  const { session, signOut } = useAuth();
  const { toast, showToast } = useToast();
  const [authOpen, setAuthOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const current = NAV_ITEMS.find((n) => n.path === location.pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-base/85 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-[1360px] items-center gap-3 px-4 sm:px-6">
        <button onClick={onMenu} className="rounded-xl border border-line bg-panel p-2 text-muted lg:hidden" aria-label="Open navigation">
          <Menu size={18} />
        </button>

        <div className="min-w-0 flex-1 md:hidden">
          <p className="truncate text-[14px] font-bold text-ink">{current?.label ?? 'SunShift India'}</p>
        </div>

        <div className="hidden min-w-0 flex-1 md:block">
          <SearchBox />
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          <div className="hidden items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-[12px] font-medium text-muted xl:flex">
            <CalendarDays size={14} className="text-faint" />
            {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>

          <div className="w-[150px] sm:w-[190px]">
            <div className="relative">
              <MapPin size={13} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-faint" />
              <Select
                aria-label="Select location"
                className="py-2 pl-8 pr-8 text-[12px]"
                value={settings.location}
                onChange={(e) => {
                  const city = cityByName(e.target.value);
                  updateSettings({ location: city.name, latitude: city.latitude, longitude: city.longitude });
                }}
              >
                {CITIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name.split(',')[0]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <button
            className="relative hidden rounded-xl border border-line bg-panel p-2.5 text-muted transition-colors hover:text-ink sm:block"
            aria-label="Notifications"
            onClick={() => navigate('/run-history')}
          >
            <Bell size={16} />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-solar" />
          </button>

          {session ? (
            <>
              <div
                className="hidden max-w-[180px] items-center gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-[12px] font-medium text-muted xl:flex"
                title={session.user.email ?? 'Signed in'}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-leaf" />
                <span className="truncate">{session.user.email ?? 'Signed in'}</span>
              </div>
              <button
                className="rounded-xl border border-line bg-panel p-2.5 text-muted transition-colors hover:text-ink"
                aria-label="Log out"
                title="Log out"
                onClick={() => {
                  signOut()
                    .then(() => showToast('Signed out.'))
                    .catch((err: Error) => showToast(`Sign-out failed: ${err.message}`));
                }}
              >
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="px-2.5"
              aria-label="Sign in"
              onClick={() => setAuthOpen(true)}
            >
              <KeyRound size={15} />
              <span className="hidden sm:inline">Sign in</span>
            </Button>
          )}

          <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-[#7c3aed] text-[12px] font-bold text-white')}>
            AS
          </div>
        </div>
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <Toast message={toast} />
    </header>
  );
}
