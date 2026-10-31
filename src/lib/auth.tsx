import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

/**
 * Authentication for the SunShift dashboard.
 *
 * Backed by Supabase Auth — real sign-in / sign-up / sign-out with persisted
 * sessions. Only the public anon key is read from env (VITE_SUPABASE_URL +
 * VITE_SUPABASE_ANON_KEY in dashboard/.env.local); service-role keys must never
 * appear in frontend code. When the env vars are absent the app stays in
 * 'unconfigured' mode: the login window explains the setup instead of faking
 * authentication.
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

export const authConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export interface AuthState {
  configured: boolean;
  /** True once the initial session lookup has finished. */
  ready: boolean;
  session: Session | null;
  signIn: (email: string, password: string) => Promise<void>;
  /** Returns whether the user must confirm their email before the session is active. */
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

let client: SupabaseClient | null = null;
let clientPromise: Promise<SupabaseClient> | null = null;
/** The SDK is code-split and only downloaded when auth is actually configured and used. */
function getClient(): Promise<SupabaseClient> {
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) => {
      client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
      return client;
    });
  }
  return clientPromise;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!authConfigured);

  useEffect(() => {
    if (!authConfigured) return;
    let active = true;
    let cleanup: (() => void) | undefined;

    getClient()
      .then((supabase) => {
        if (!active) return;
        supabase.auth
          .getSession()
          .then(({ data }) => {
            if (active) setSession(data.session ?? null);
          })
          .catch(() => {
            /* network hiccup — treated as signed out */
          })
          .finally(() => {
            if (active) setReady(true);
          });
        const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
          if (active) setSession(next);
        });
        cleanup = () => sub.subscription.unsubscribe();
      })
      .catch(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
      cleanup?.();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      configured: authConfigured,
      ready,
      session,
      async signIn(email: string, password: string) {
        if (!authConfigured) throw new Error('AUTH_NOT_CONFIGURED');
        const supabase = await getClient();
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message);
      },
      async signUp(email: string, password: string) {
        if (!authConfigured) throw new Error('AUTH_NOT_CONFIGURED');
        const supabase = await getClient();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw new Error(error.message);
        return { needsConfirmation: !data.session };
      },
      async signOut() {
        if (!authConfigured) return;
        const supabase = await getClient();
        const { error } = await supabase.auth.signOut();
        if (error) throw new Error(error.message);
      },
    }),
    [ready, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
