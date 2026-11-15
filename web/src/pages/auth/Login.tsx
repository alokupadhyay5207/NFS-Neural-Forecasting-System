import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { googleAuthEnabled, supabaseConfigured } from "../../lib/supabase";
import { ConfigMissing } from "../../components/Screens";
import { AuthShell, FORM_BTN, FormError, FormNotice } from "./AuthShell";

function friendly(message: string): { text: string; unverified: boolean } {
  const m = message.toLowerCase();
  if (m.includes("email not confirmed")) return { text: "Please verify your email before signing in. Check your inbox for the confirmation link.", unverified: true };
  if (m.includes("invalid login")) return { text: "Incorrect email or password.", unverified: false };
  if (m.includes("rate limit") || m.includes("too many")) return { text: "Too many attempts. Please wait a moment and try again.", unverified: false };
  if (m.includes("failed to fetch") || m.includes("network")) return { text: "Network error. Check your connection and try again.", unverified: false };
  return { text: message, unverified: false };
}

export default function Login() {
  const { session, signIn, signInWithGoogle, resendVerification } = useAuth();
  const [params] = useSearchParams();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/overview";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [notice, setNotice] = useState(params.get("verified") ? "Email verified. You can sign in now." : "");

  if (!supabaseConfigured) return <ConfigMissing />;
  if (session) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(""); setNotice(""); setUnverified(false);
    if (!email.trim() || !password) { setError("Enter your email and password."); return; }
    setBusy(true);
    try { await signIn(email.trim(), password, remember); }
    catch (x) { const f = friendly((x as Error).message); setError(f.text); setUnverified(f.unverified); }
    setBusy(false);
  };

  const resend = async () => {
    try { await resendVerification(email.trim()); setNotice("Verification email sent. Check your inbox."); setError(""); setUnverified(false); }
    catch (x) { setError(friendly((x as Error).message).text); }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your NFS workspace.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {notice && <FormNotice>{notice}</FormNotice>}
        {error && <FormError>{error}{unverified && <button type="button" onClick={resend} className="ml-2 underline">Resend email</button>}</FormError>}
        <label className="block text-sm font-medium text-slate-200">Email
          <input type="email" autoComplete="email" className="input-nfs mt-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </label>
        <label className="block text-sm font-medium text-slate-200">Password
          <div className="relative mt-1">
            <input type={show ? "text" : "password"} autoComplete="current-password" className="input-nfs pr-10" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute inset-y-0 right-2 text-slate-400 hover:text-white">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
        </label>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-slate-300"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-electric" /> Remember me</label>
          <Link to="/forgot-password" className="text-cyan-nfs hover:underline">Forgot password?</Link>
        </div>
        <button type="submit" disabled={busy} className={FORM_BTN}>{busy ? <><Loader2 className="animate-spin" size={18} /> Signing in…</> : "Sign in"}</button>
        {googleAuthEnabled && (
          <button type="button" onClick={() => signInWithGoogle().catch((x) => setError((x as Error).message))} className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10">Continue with Google</button>
        )}
      </form>
      <p className="mt-5 text-center text-sm text-slate-400">New to NFS? <Link to="/signup" className="font-medium text-cyan-nfs hover:underline">Create an account</Link></p>
    </AuthShell>
  );
}
