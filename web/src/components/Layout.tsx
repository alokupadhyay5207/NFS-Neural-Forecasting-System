import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { BarChart3, Bot, FileText, GitBranch, History, LayoutDashboard, LogOut, Menu, Settings, Sparkles, Upload, Users, X, type LucideIcon } from "lucide-react";
import { Logo } from "./Logo";
import { ErrorBoundary } from "./ErrorBoundary";
import { Tag } from "./ui";
import { useConnection } from "../hooks/useConnection";
import { useAuth } from "../context/AuthContext";
import type { ConnState, Schema } from "../lib/types";
import { cx } from "../lib/format";

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/predict", label: "Predict", icon: Sparkles },
  { to: "/batch", label: "Batch Prediction", icon: Upload },
  { to: "/history", label: "Prediction History", icon: History },
  { to: "/performance", label: "Model Performance", icon: BarChart3 },
  { to: "/segments", label: "Customer Segments", icon: Users },
  { to: "/workflow", label: "ML Workflow", icon: GitBranch },
  { to: "/assistant", label: "AI Assistant", icon: Bot },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/settings", label: "Settings", icon: Settings },
];

export interface AppContext { conn: ConnState; schema: Schema | null; retry: () => void }

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, profile, signOut } = useAuth();
  const name = profile?.full_name || user?.email || "Account";
  return (
    <div className="flex h-full flex-col border-r border-white/5 bg-navy-950/90 backdrop-blur">
      <div className="px-5 py-5"><Logo /></div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} onClick={onNavigate}
            className={({ isActive }) => cx("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition",
              isActive ? "bg-electric/20 text-white ring-1 ring-white/10" : "text-slate-400 hover:bg-white/5 hover:text-slate-200")}>
            <Icon size={18} />{label}
          </NavLink>
        ))}
      </nav>
      <div className="glass m-3 rounded-xl p-3">
        <p className="truncate text-sm font-medium text-white" title={name}>{name}</p>
        {profile?.full_name && <p className="truncate text-xs text-slate-400" title={user?.email ?? ""}>{user?.email}</p>}
        <button onClick={() => void signOut()} className="mt-2 flex items-center gap-2 text-xs text-slate-300 hover:text-white"><LogOut size={14} /> Sign out</button>
      </div>
    </div>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { conn, schema, retry } = useConnection();
  const current = NAV.find((n) => pathname.startsWith(n.to));

  useEffect(() => { document.title = (current ? current.label + " · " : "") + "NFS – Neural Forecasting System"; }, [current]);
  useEffect(() => { setOpen(false); }, [pathname]);

  const chip =
    conn.state === "ok" ? ["bg-emerald-400", "API connected"]
    : conn.state === "checking" ? ["bg-amber-400", "Connecting…"]
    : conn.state === "no-model" ? ["bg-amber-500", "Model not loaded"]
    : ["bg-rose-500", "API offline"];
  const ctx: AppContext = { conn, schema, retry };

  return (
    <div className="min-h-screen">
      <aside className="print-hide fixed inset-y-0 left-0 z-30 hidden w-64 lg:block"><Sidebar /></aside>
      {open && (
        <div className="print-hide fixed inset-0 z-40 flex lg:hidden">
          <div className="relative w-64"><Sidebar onNavigate={() => setOpen(false)} />
            <button aria-label="Close menu" onClick={() => setOpen(false)} className="absolute right-2 top-4 text-slate-400"><X size={20} /></button></div>
          <button aria-label="Close menu" className="flex-1 bg-black/60" onClick={() => setOpen(false)} />
        </div>
      )}
      <div className="lg:pl-64">
        <header className="print-hide sticky top-0 z-20 flex items-center gap-3 border-b border-white/5 bg-navy-950/70 px-4 py-3 backdrop-blur sm:px-8">
          <button className="text-slate-300 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
          <h1 className="flex-1 text-lg font-semibold text-white">{current?.label ?? "NFS"}</h1>
          <span className="hidden items-center gap-1.5 text-xs text-slate-300 sm:flex"><span className={cx("h-2 w-2 rounded-full", chip[0])} />{chip[1]}</span>
          <Tag>Live model</Tag>
        </header>
        <main className="max-w-[1400px] px-4 py-6 sm:px-8">
          <ErrorBoundary key={pathname}><Outlet context={ctx} /></ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
