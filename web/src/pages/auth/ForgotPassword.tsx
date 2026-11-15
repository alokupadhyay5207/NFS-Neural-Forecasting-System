import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { supabaseConfigured } from "../../lib/supabase";
import { ConfigMissing } from "../../components/Screens";
import { AuthShell, FORM_BTN, FormError, FormNotice } from "./AuthShell";

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  if (!supabaseConfigured) return <ConfigMissing />;

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address.");
    setBusy(true);
    try { await sendPasswordReset(email.trim()); setDone(true); }
    catch (x) { const m = (x as Error).message.toLowerCase(); setError(m.includes("rate") ? "Too many requests. Please wait a minute and try again." : "Could not send the reset email. Please try again."); }
    setBusy(false);
  };

  return (
    <AuthShell title="Reset your password" subtitle="We’ll email you a link to choose a new one.">
      {done ? (
        <div className="space-y-4">
          <FormNotice>If an account exists for {email}, a reset link is on its way. It expires shortly.</FormNotice>
          <Link to="/login" className="block text-center text-sm font-medium text-cyan-nfs hover:underline">Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <FormError>{error}</FormError>}
          <label className="block text-sm font-medium text-slate-200">Email
            <input type="email" className="input-nfs mt-1" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button type="submit" disabled={busy} className={FORM_BTN}>{busy ? <><Loader2 className="animate-spin" size={18} /> Sending…</> : "Send reset link"}</button>
          <Link to="/login" className="block text-center text-sm text-slate-400 hover:text-white">Back to sign in</Link>
        </form>
      )}
    </AuthShell>
  );
}
