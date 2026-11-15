import { Link } from "react-router-dom";
import { Database } from "lucide-react";
import { Logo, LogoMark } from "./Logo";
import { Card } from "./ui";

export function LoadingScreen({ text = "Loading NFS…" }: { text?: string }) {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-4" role="status" aria-live="polite">
        <div style={{ animation: "nfs-pulse 1.6s ease-in-out infinite" }}><LogoMark size={64} /></div>
        <p className="text-sm text-slate-400">{text}</p>
      </div>
    </div>
  );
}

export function ConfigMissing() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-xl space-y-5">
        <Logo size={44} />
        <Card title="Supabase is not configured">
          <div className="flex items-start gap-3 text-sm text-slate-300">
            <Database className="mt-0.5 shrink-0 text-electric" size={20} />
            <div className="space-y-2">
              <p>NFS needs a Supabase project for sign-in and saved history. Nothing is faked when it is missing.</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Create a Supabase project and run <code>supabase/migrations/0001_init.sql</code>.</li>
                <li>Copy <code>web/.env.example</code> to <code>web/.env.local</code> and fill in <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.</li>
                <li>Restart <code>npm run dev</code>.</li>
              </ol>
              <p className="text-slate-400">Full steps are in <code>docs/DATABASE_SETUP.md</code>.</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function ErrorScreen({ code, title, text }: { code: string; title: string; text: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div>
        <div className="mx-auto mb-4 w-fit"><LogoMark size={56} /></div>
        <p className="text-gradient text-5xl font-bold">{code}</p>
        <h2 className="mt-2 text-xl font-semibold text-white">{title}</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">{text}</p>
        <Link to="/overview" className="mt-5 inline-block rounded-lg bg-nfs-gradient px-4 py-2 text-sm font-medium text-white">Back to dashboard</Link>
      </div>
    </div>
  );
}
