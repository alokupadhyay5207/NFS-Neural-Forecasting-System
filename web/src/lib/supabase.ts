import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key && !url.includes("YOUR-PROJECT-REF"));
export const googleAuthEnabled = import.meta.env.VITE_ENABLE_GOOGLE_AUTH === "true";

const REMEMBER_KEY = "nfs.remember";
/** "Remember me": persist the session in localStorage when ticked, otherwise only for this browser tab. */
export const setRemember = (v: boolean) => { try { localStorage.setItem(REMEMBER_KEY, v ? "1" : "0"); } catch { /* storage blocked */ } };
const store = () => { try { return localStorage.getItem(REMEMBER_KEY) === "0" ? sessionStorage : localStorage; } catch { return window.localStorage; } };
const storage = {
  getItem: (k: string) => store().getItem(k) ?? (store() === sessionStorage ? null : sessionStorage.getItem(k)),
  setItem: (k: string, v: string) => store().setItem(k, v),
  removeItem: (k: string) => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* ignore */ } },
};

export const supabase = supabaseConfigured
  ? createClient(url as string, key as string, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage } })
  : null;
