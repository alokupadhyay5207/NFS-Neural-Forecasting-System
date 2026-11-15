import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { setRemember, supabase } from "../lib/supabase";
import { getProfile } from "../lib/db";
import type { Profile } from "../lib/types";

interface AuthValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string, remember: boolean) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<{ needsVerification: boolean }>;
  signInWithGoogle: () => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  signOutEverywhere: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);
export const useAuth = () => { const v = useContext(Ctx); if (!v) throw new Error("useAuth must be used inside AuthProvider"); return v; };

const need = () => { if (!supabase) throw new Error("Supabase is not configured."); return supabase; };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setLoading(false); } });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => { setSession(s); setLoading(false); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const uid = session?.user.id;
  const refreshProfile = useCallback(async () => {
    if (!uid) { setProfile(null); return; }
    try { setProfile(await getProfile(uid)); } catch { /* profile is optional for rendering */ }
  }, [uid]);
  useEffect(() => { void refreshProfile(); }, [refreshProfile]);

  const value = useMemo<AuthValue>(() => ({
    session, user: session?.user ?? null, profile, loading, refreshProfile,
    signIn: async (email, password, remember) => {
      setRemember(remember);
      const { error } = await need().auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    signUp: async (name, email, password) => {
      const { data, error } = await need().auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: window.location.origin + "/login?verified=1" } });
      if (error) throw error;
      // With email confirmation enabled Supabase returns a user but no session until the link is clicked.
      return { needsVerification: !data.session };
    },
    signInWithGoogle: async () => {
      const { error } = await need().auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + "/overview" } });
      if (error) throw error;
    },
    resendVerification: async (email) => { const { error } = await need().auth.resend({ type: "signup", email }); if (error) throw error; },
    sendPasswordReset: async (email) => { const { error } = await need().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" }); if (error) throw error; },
    updatePassword: async (password) => { const { error } = await need().auth.updateUser({ password }); if (error) throw error; },
    signOut: async () => { await need().auth.signOut(); setProfile(null); },
    signOutEverywhere: async () => { await need().auth.signOut({ scope: "global" }); setProfile(null); },
  }), [session, profile, loading, refreshProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
