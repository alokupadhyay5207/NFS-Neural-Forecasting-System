import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { supabaseConfigured } from "../../lib/supabase";
import { passwordStrength } from "../../lib/password";
import { ConfigMissing, LoadingScreen } from "../../components/Screens";
import { AuthShell, FORM_BTN, FormError } from "./AuthShell";

/** Opened from the emailed link: Supabase turns the link into a temporary session, which authorises the change. */
export default function ResetPassword() {
  const { session, loading, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const st = passwordStrength(pw);
  if (!supabaseConfigured) return <ConfigMissing />;
  if (loading) return <LoadingScreen text="Verifying your reset link…" />;

  if (!session) return (
    <AuthShell title="Link expired or invalid">
      <div className="space-y-4 text-center text-sm text-slate-300">
        <p>This password reset link is no longer valid. Request a new one.</p>
        <Link to="/forgot-password" className="font-medium text-cyan-nfs hover:underline">Send a new reset link</Link>
      </div>
    </AuthShell>
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError("");
    if (!st.ok) return setError("Choose a stronger password. " + st.hint);
    if (pw !== pw2) return setError("The passwords do not match.");
    setBusy(true);
    try { await updatePassword(pw); navigate("/overview", { replace: true }); }
    catch (x) { setError((x as Error).message); }
    setBusy(false);
  };

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <FormError>{error}</FormError>}
        <label className="block text-sm font-medium text-slate-200">New password
          <input type="password" className="input-nfs mt-1" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          {pw && <p className="mt-1 text-xs font-normal text-slate-400">{st.label}{st.hint && " · " + st.hint}</p>}
        </label>
        <label className="block text-sm font-medium text-slate-200">Confirm new password
          <input type="password" className="input-nfs mt-1" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        <button type="submit" disabled={busy} className={FORM_BTN}>{busy ? <><Loader2 className="animate-spin" size={18} /> Saving…</> : "Update password"}</button>
      </form>
    </AuthShell>
  );
}
