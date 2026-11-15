import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { supabaseConfigured } from "../../lib/supabase";
import { passwordStrength } from "../../lib/password";
import { cx } from "../../lib/format";
import { ConfigMissing } from "../../components/Screens";
import { AuthShell, FORM_BTN, FormError, FormNotice } from "./AuthShell";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Signup() {
  const { session, signUp, resendVerification } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [resent, setResent] = useState(false);
  const st = passwordStrength(pw);

  if (!supabaseConfigured) return <ConfigMissing />;
  if (session && !sent) return <Navigate to="/overview" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    if (name.trim().length < 2) return setError("Enter your full name.");
    if (!EMAIL_RE.test(email.trim())) return setError("Enter a valid email address.");
    if (!st.ok) return setError("Choose a stronger password. " + st.hint);
    if (pw !== pw2) return setError("The passwords do not match.");
    if (!terms) return setError("Please accept the Terms and Privacy Policy to continue.");
    setBusy(true);
    try { const r = await signUp(name.trim(), email.trim(), pw); if (r.needsVerification) setSent(true); }
    catch (x) {
      const m = (x as Error).message.toLowerCase();
      setError(m.includes("already") ? "An account with this email already exists. Try signing in." : m.includes("rate") ? "Too many attempts. Please wait a moment." : (x as Error).message);
    }
    setBusy(false);
  };

  if (sent) return (
    <AuthShell title="Check your email">
      <div className="space-y-4 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-electric/15 text-electric"><MailCheck size={28} /></div>
        <p className="text-sm text-slate-300">We sent a confirmation link to <b className="text-white">{email}</b>. Click it to activate your account, then sign in.</p>
        {resent && <FormNotice>Another email is on its way.</FormNotice>}
        <button className="text-sm text-cyan-nfs hover:underline" onClick={() => resendVerification(email.trim()).then(() => setResent(true)).catch((x) => setError((x as Error).message))}>Resend verification email</button>
        {error && <FormError>{error}</FormError>}
        <p className="text-sm text-slate-400"><Link to="/login" className="font-medium text-cyan-nfs hover:underline">Back to sign in</Link></p>
      </div>
    </AuthShell>
  );

  const bar = ["bg-rose-500", "bg-rose-500", "bg-amber-500", "bg-emerald-400", "bg-emerald-500"][st.score];
  return (
    <AuthShell title="Create your account" subtitle="Start predicting customer churn risk.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <FormError>{error}</FormError>}
        <label className="block text-sm font-medium text-slate-200">Full name
          <input className="input-nfs mt-1" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </label>
        <label className="block text-sm font-medium text-slate-200">Email
          <input type="email" className="input-nfs mt-1" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-slate-200">Password
          <div className="relative mt-1">
            <input type={show ? "text" : "password"} className="input-nfs pr-10" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute inset-y-0 right-2 text-slate-400 hover:text-white">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
          {pw && (
            <div className="mt-2" aria-live="polite">
              <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <div key={i} className={cx("h-1.5 flex-1 rounded-full", i < st.score ? bar : "bg-white/10")} />)}</div>
              <p className="mt-1 text-xs font-normal text-slate-400">{st.label}{st.hint && " · " + st.hint}</p>
            </div>
          )}
        </label>
        <label className="block text-sm font-medium text-slate-200">Confirm password
          <input type={show ? "text" : "password"} className="input-nfs mt-1" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 accent-electric" />
          <span>I agree to the <Link to="/terms" className="text-cyan-nfs hover:underline">Terms</Link> and <Link to="/privacy" className="text-cyan-nfs hover:underline">Privacy Policy</Link>.</span>
        </label>
        <button type="submit" disabled={busy} className={FORM_BTN}>{busy ? <><Loader2 className="animate-spin" size={18} /> Creating account…</> : "Create account"}</button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-400">Already have an account? <Link to="/login" className="font-medium text-cyan-nfs hover:underline">Sign in</Link></p>
    </AuthShell>
  );
}
