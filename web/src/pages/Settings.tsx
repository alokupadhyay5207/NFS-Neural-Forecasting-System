
import { useEffect, useState, type FormEvent } from "react";
import { Bot, LogOut, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { Banner, Btn, Card, ConfirmDialog, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { deleteAllHistory, updateProfile } from "../lib/db";
import { passwordStrength } from "../lib/password";

export default function Settings() {
  const {
    user,
    profile,
    refreshProfile,
    updatePassword,
    sendPasswordReset,
    signOut,
    signOutEverywhere,
  } = useAuth();

  const ai = useAsync(
    () =>
      api<{
        configured: boolean;
        provider: string | null;
        model: string | null;
      }>("/v1/assistant/status", undefined, { auth: true }),
    []
  );

  const toast = useToast();

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState("");

  const [confirm, setConfirm] = useState(false);
  const [wiping, setWiping] = useState(false);

  const [toastsOn, setToastsOn] = useState(true);

  useEffect(() => {
    setName(profile?.full_name ?? "");
  }, [profile?.full_name]);

  useEffect(() => {
    setToastsOn(profile?.toasts_enabled !== false);
  }, [profile?.toasts_enabled]);

  if (!user) return null;

  const saveName = async (e: FormEvent) => {
    e.preventDefault();

    if (name.trim().length > 120) {
      toast("error", "Name must be 120 characters or fewer.");
      return;
    }

    setSavingName(true);

    try {
      await updateProfile(user.id, {
        full_name: name.trim() || null,
      });

      await refreshProfile();
      toast("success", "Profile updated.");
    } catch (x) {
      toast("error", (x as Error).message);
    }

    setSavingName(false);
  };

  const changePw = async (e: FormEvent) => {
    e.preventDefault();
    setPwErr("");

    const st = passwordStrength(pw);

    if (!st.ok) {
      return setPwErr("Choose a stronger password. " + st.hint);
    }

    if (pw !== pw2) {
      return setPwErr("The passwords do not match.");
    }

    setPwBusy(true);

    try {
      await updatePassword(pw);
      setPw("");
      setPw2("");
      toast("success", "Password updated.");
    } catch (x) {
      setPwErr((x as Error).message);
    }

    setPwBusy(false);
  };

  const toggleToasts = async (v: boolean) => {
    setToastsOn(v);

    try {
      await updateProfile(user.id, {
        toasts_enabled: v,
      });

      await refreshProfile();
    } catch (x) {
      setToastsOn(!v);
      toast("error", (x as Error).message);
    }
  };

  const wipe = async () => {
    setWiping(true);

    try {
      await deleteAllHistory(user.id);
      setConfirm(false);
      toast("success", "All prediction history deleted.");
    } catch (x) {
      toast("error", (x as Error).message);
    }

    setWiping(false);
  };

  return (
    <div className="grid max-w-3xl gap-5">

      {/* PROFILE */}
      <Card title="Profile" sub="How you appear in NFS">
        <form onSubmit={saveName} className="space-y-4">
          <Field label="Full name">
            <input
              className="input-nfs"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </Field>

          <Field label="Email">
            <input
              className="input-nfs"
              value={user.email ?? ""}
              readOnly
            />
          </Field>

          <p className="text-xs text-slate-500">
            Account created{" "}
            {new Date(user.created_at).toLocaleDateString()}.
            Your email is managed by Supabase Auth and cannot be changed here.
          </p>

          <Btn type="submit" disabled={savingName}>
            {savingName ? "Saving…" : "Save profile"}
          </Btn>
        </form>
      </Card>

      {/* PASSWORD */}
      <Card title="Password" sub="Change it now, or get a reset link by email">
        <form onSubmit={changePw} className="space-y-4">
          {pwErr && (
            <p role="alert" className="text-sm text-rose-300">
              {pwErr}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password">
              <input
                type="password"
                autoComplete="new-password"
                className="input-nfs"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </Field>

            <Field label="Confirm new password">
              <input
                type="password"
                autoComplete="new-password"
                className="input-nfs"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <Btn type="submit" disabled={pwBusy}>
              {pwBusy ? "Updating…" : "Update password"}
            </Btn>

            <Btn
              kind="ghost"
              onClick={() =>
                user.email &&
                sendPasswordReset(user.email)
                  .then(() =>
                    toast("success", "Reset link sent to " + user.email)
                  )
                  .catch((x) => toast("error", (x as Error).message))
              }
            >
              <Mail size={16} />
              Email me a reset link
            </Btn>
          </div>
        </form>
      </Card>

      {/* APPEARANCE AND NOTIFICATIONS */}
      <Card title="Appearance &amp; notifications">
        <div className="space-y-4 text-sm">
          <div>
            <p className="mb-2 font-medium text-slate-200">
              Theme
            </p>

            <div className="flex gap-2">
              <span className="rounded-lg bg-electric/20 px-3 py-1.5 text-white ring-1 ring-white/10">
                Dark (active)
              </span>

              <span
                className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-500"
                title="Not available yet"
              >
                Light — not available yet
              </span>
            </div>
          </div>

          <label className="flex items-start gap-3 text-slate-200">
            <input
              type="checkbox"
              className="mt-1 accent-electric"
              checked={toastsOn}
              onChange={(e) => void toggleToasts(e.target.checked)}
            />

            <span>
              Show in-app confirmation messages

              <span className="block text-xs text-slate-500">
                Saved, exported and generated messages.
                Errors are always shown. NFS does not send email notifications.
              </span>
            </span>
          </label>
        </div>
      </Card>

      {/* AI ASSISTANT */}
      <Card
        title="AI assistant"
        sub="NFS Intelligence — Customer Analytics"
      >
        <div className="space-y-3 text-sm text-slate-300">

          <div className="flex items-start gap-2">
            <Bot
              size={19}
              className="mt-0.5 shrink-0 text-emerald-400"
            />

            <div>
              <p className="font-medium text-emerald-400">
                Rule-based assistant
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Available without a paid AI API key.
              </p>
            </div>
          </div>

          <p>
            NFS Intelligence analyzes your saved prediction history,
            customer segments and churn analytics to answer questions
            and provide data-driven retention suggestions.
          </p>

          <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="font-medium text-white">
              Optional LLM integration
            </p>

            <p className="text-xs text-slate-400">
              Advanced AI-generated report narratives require a
              separately configured LLM provider. This is optional
              and does not affect the rule-based analytics assistant.
            </p>

            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs ${
                ai.data?.configured
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "bg-amber-400/10 text-amber-300"
              }`}
            >
              {ai.loading
                ? "Checking optional LLM..."
                : ai.data?.configured
                  ? `LLM configured: ${ai.data.provider ?? "Provider"}`
                  : "Optional LLM not configured"}
            </span>
          </div>

        </div>
      </Card>

      {/* PRIVACY */}
      <Card title="Privacy">
        <div className="space-y-3 text-sm text-slate-300">

          <p className="flex gap-2">
            <ShieldCheck
              size={18}
              className="mt-0.5 shrink-0 text-emerald-400"
            />
            Your predictions are visible only to you;
            database rules enforce this per account.
          </p>

          <p>
            Single predictions store the 19 input fields you submitted.
            Batch uploads store the file name, counts and, per scored row,
            the customer ID, probability, risk level and four segment fields.
            Failed rows and the rest of your CSV are not stored. See the{" "}
            <a
              className="text-cyan-nfs hover:underline"
              href="/privacy"
              target="_blank"
              rel="noreferrer"
            >
              Privacy Policy
            </a>.
          </p>

          <Btn kind="ghost" onClick={() => setConfirm(true)}>
            <Trash2 size={16} />
            Delete all my prediction history
          </Btn>
        </div>
      </Card>

      {/* SESSION */}
      <Card
        title="Session"
        sub="Sessions refresh automatically and end when you sign out"
      >
        <div className="flex flex-wrap gap-2">
          <Btn kind="ghost" onClick={() => void signOut()}>
            <LogOut size={16} />
            Sign out
          </Btn>

          <Btn kind="ghost" onClick={() => void signOutEverywhere()}>
            <LogOut size={16} />
            Sign out on all devices
          </Btn>
        </div>
      </Card>

      <Banner>
        Deleting your account itself is not available in the app.
        Contact the operator to remove your login.
      </Banner>

      <ConfirmDialog
        open={confirm}
        busy={wiping}
        title="Delete all prediction history?"
        text="This permanently deletes every saved single prediction and batch (with all customer results) in your account. This cannot be undone."
        confirmLabel="Delete everything"
        onConfirm={wipe}
        onCancel={() => setConfirm(false)}
      />

    </div>
  );
}
