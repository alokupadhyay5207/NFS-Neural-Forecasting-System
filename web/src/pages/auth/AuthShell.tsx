import { lazy, Suspense, type ReactNode } from "react";
import { Lock, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "../../components/Logo";
import { NeuralFallback } from "../../components/NeuralCore";

const NeuralCore = lazy(() => import("../../components/NeuralCore"));

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden border-r border-white/5 lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-950 to-navy-800" />
        <div className="absolute inset-0"><Suspense fallback={<NeuralFallback />}><NeuralCore /></Suspense></div>
        <div className="relative z-10 flex h-full flex-col justify-between p-10">
          <Logo size={44} />
          <div className="max-w-md">
            <p className="text-gradient text-3xl font-bold leading-tight">Predict Beyond Patterns.<br />Anticipate the Future.</p>
            <p className="mt-3 text-sm text-slate-300">AI-Powered Customer Behaviour Prediction &amp; Risk Assessment.</p>
            <ul className="mt-6 space-y-2 text-sm text-slate-400">
              <li className="flex items-center gap-2"><Sparkles size={16} className="text-cyan-nfs" /> Live Random Forest churn-risk scoring</li>
              <li className="flex items-center gap-2"><ShieldCheck size={16} className="text-cyan-nfs" /> Your history is private to your account</li>
            </ul>
          </div>
        </div>
      </section>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo size={40} /></div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          <div className="glass mt-6 rounded-2xl p-6">{children}</div>
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-500"><Lock size={12} /> Encrypted connection · Authentication by Supabase Auth</p>
        </div>
      </main>
    </div>
  );
}

export const FormError = ({ children }: { children: ReactNode }) => (
  <div role="alert" className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{children}</div>
);
export const FormNotice = ({ children }: { children: ReactNode }) => (
  <div role="status" className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{children}</div>
);
export const FORM_BTN = "inline-flex w-full items-center justify-center gap-2 rounded-lg bg-nfs-gradient px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60";
