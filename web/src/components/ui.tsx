import type { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { AlertTriangle, Info, type LucideIcon } from "lucide-react";
import { cx } from "../lib/format";
import type { Risk } from "../lib/types";

export const RISK_COLOR: Record<Risk, string> = { High: "#F43F5E", Medium: "#F59E0B", Low: "#10B981" };

export function Card({ title, sub, right, children, className = "" }: { title?: string; sub?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("glass rounded-2xl", className)}>
      {title && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div><h3 className="font-semibold text-white">{title}</h3>{sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}</div>
          {right}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Banner({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) {
  const Icon = tone === "error" ? AlertTriangle : Info;
  return (
    <div className={cx("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
      tone === "error" ? "border-rose-400/30 bg-rose-500/10 text-rose-100" : "border-electric/30 bg-electric/10 text-blue-100")}>
      <Icon className="mt-0.5 shrink-0" size={18} /><div>{children}</div>
    </div>
  );
}

export const Tag = ({ children }: { children: ReactNode }) => (
  <span className="whitespace-nowrap rounded-full bg-violet-nfs/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200 ring-1 ring-violet-nfs/30">{children}</span>
);

export function RiskBadge({ level }: { level: Risk }) {
  const s: Record<Risk, string> = {
    High: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
    Medium: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
    Low: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  };
  return <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1", s[level])}>{level}</span>;
}

export function Empty({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-white/5 text-slate-400"><Icon size={22} /></div>
      <p className="font-medium text-slate-100">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Btn({ children, onClick, kind = "primary", disabled, className = "", type = "button" }: {
  children: ReactNode; onClick?: () => void; kind?: "primary" | "ghost"; disabled?: boolean; className?: string; type?: "button" | "submit";
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={cx("inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        kind === "primary" ? "bg-nfs-gradient text-white shadow-glow hover:brightness-110" : "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10", className)}>
      {children}
    </button>
  );
}

export const Sk = ({ h = "h-24" }: { h?: string }) => <div className={cx("animate-pulse rounded-2xl bg-white/5", h)} />;

export function Kpi({ label, value, icon: Icon, tone, note }: { label: string; value: ReactNode; icon: LucideIcon; tone: string; note?: string }) {
  return (
    <div className="glass flex items-center gap-4 rounded-2xl p-5">
      <div className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-xl", tone)}><Icon size={22} /></div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-2xl font-bold leading-tight text-white">{value}</p>
        {note && <p className="truncate text-[11px] text-slate-500">{note}</p>}
      </div>
    </div>
  );
}

export const Chart = ({ children, h = "h-64" }: { children: ReactNode; h?: string }) => (
  <div className={h}><ResponsiveContainer width="100%" height="100%">{children as any}</ResponsiveContainer></div>
);

export function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">{label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="input-nfs">{options.map((o) => <option key={o}>{o}</option>)}</select>
    </label>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-200">{label}
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs font-normal text-rose-400">{error}</p>}
    </label>
  );
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="print-hide fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6 shadow-glow">
        <h3 className="mb-3 text-lg font-semibold text-white">{title}</h3>
        <div className="text-sm text-slate-300">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, text, confirmLabel = "Delete", busy, onConfirm, onCancel }: {
  open: boolean; title: string; text: string; confirmLabel?: string; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}
      footer={<><Btn kind="ghost" onClick={onCancel} disabled={busy}>Cancel</Btn>
        <button onClick={onConfirm} disabled={busy} className="inline-flex items-center rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-400 disabled:opacity-50">{busy ? "Working…" : confirmLabel}</button></>}>
      {text}
    </Modal>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1, to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
      <span>{from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-2">
        <Btn kind="ghost" className="!px-3 !py-1.5" disabled={page <= 0} onClick={() => onPage(page - 1)}>Previous</Btn>
        <span>Page {page + 1} of {pages}</span>
        <Btn kind="ghost" className="!px-3 !py-1.5" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next</Btn>
      </div>
    </div>
  );
}
