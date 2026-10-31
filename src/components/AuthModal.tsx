import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, MailCheck, ServerOff, X } from 'lucide-react';
import { Badge, Button, Field, TextInput, cn } from './ui';
import { useAuth } from '../lib/auth';

/**
 * Login / registration window.
 * - When Supabase env vars are configured: real email + password sign-in and
 *   sign-up against Supabase Auth.
 * - When not configured: shows the setup steps instead of a fake form, so the
 *   app never pretends authentication is working.
 *
 * The modal is portalled to document.body: the sticky topbar carries a
 * backdrop-filter, which would otherwise become the containing block for
 * position:fixed and clip the dialog to the 72px header.
 */
export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { configured } = useAuth();

  // Lock background scrolling while the dialog is open; inner body scrolls instead.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      {configured ? <AuthForm onClose={onClose} /> : <NotConfiguredNotice onClose={onClose} />}
    </div>,
    document.body,
  );
}

function ModalShell({ onClose, header, children }: { onClose: () => void; header: ReactNode; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="modal-panel relative flex w-full max-w-[440px] animate-fade-up flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-pop"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
        {header}
        <button onClick={onClose} className="rounded-lg p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-ink" aria-label="Close dialog">
          <X size={16} />
        </button>
      </div>
      <div className="overflow-y-auto p-5">{children}</div>
    </div>
  );
}

function NotConfiguredNotice({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell
      onClose={onClose}
      header={
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <ServerOff size={16} className="text-solar" />
          Sign in
          <Badge tone="grey">Not configured</Badge>
        </h3>
      }
    >
      <p className="text-[13px] leading-relaxed text-muted">
        This build of SunShift India is a local demo — it runs entirely on sample data in your browser and has no
        authentication backend connected yet. A login window was never wired up in this codebase, so there is nothing to
        restore; instead of faking one, here is how to enable real authentication:
      </p>
      <ol className="mt-4 space-y-2.5 text-[12.5px] leading-relaxed text-muted">
        <li className="flex gap-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-[#8fa7ff]">1</span>
          Create a project at <span className="font-semibold text-ink">supabase.com</span> and enable Email auth (Authentication → Providers).
        </li>
        <li className="flex gap-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-[#8fa7ff]">2</span>
          Add <code className="rounded bg-panel-2 px-1.5 py-0.5 text-[11.5px] text-ink">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-panel-2 px-1.5 py-0.5 text-[11.5px] text-ink">VITE_SUPABASE_ANON_KEY</code> to{' '}
          <code className="rounded bg-panel-2 px-1.5 py-0.5 text-[11.5px] text-ink">dashboard/.env.local</code>.
        </li>
        <li className="flex gap-2.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-[#8fa7ff]">3</span>
          Restart the dev server. Sign in, registration and logout then work against your Supabase project.
        </li>
      </ol>
      <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-faint">
        Only the public anon key belongs in the frontend — never a service-role key. All dashboard pages remain usable
        in demo mode without an account.
      </p>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </ModalShell>
  );
}

function AuthForm({ onClose }: { onClose: () => void }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setConfirmation(false);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
        onClose();
      } else {
        const { needsConfirmation } = await signUp(email.trim(), password);
        if (needsConfirmation) setConfirmation(true);
        else onClose();
      }
    } catch (err) {
      setError((err as Error).message === 'AUTH_NOT_CONFIGURED' ? 'Authentication is not configured.' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      header={
        <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <KeyRound size={15} className="text-[#8fa7ff]" />
          {mode === 'signin' ? 'Sign in to SunShift' : 'Create your account'}
        </h3>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {confirmation ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-leaf/40 bg-leaf-soft p-3.5 text-[12.5px] leading-relaxed text-muted">
            <MailCheck size={16} className="mt-0.5 shrink-0 text-leaf" />
            Account created. Check your inbox to confirm the email address, then sign in.
          </div>
        ) : null}
        <Field label="Email">
          <TextInput
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" hint={mode === 'signup' ? 'At least 6 characters.' : undefined}>
          <TextInput
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? (
          <p className="rounded-xl border border-danger/40 bg-danger-soft p-3 text-[12.5px] font-medium text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>
        <p className="text-center text-[12.5px] text-muted">
          {mode === 'signin' ? 'New to SunShift?' : 'Already have an account?'}{' '}
          <button
            type="button"
            className={cn('font-semibold text-[#8fa7ff] hover:underline')}
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
              setConfirmation(false);
            }}
          >
            {mode === 'signin' ? 'Create an account' : 'Sign in instead'}
          </button>
        </p>
      </form>
    </ModalShell>
  );
}
