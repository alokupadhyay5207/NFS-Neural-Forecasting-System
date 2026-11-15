import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useAuth } from "./AuthContext";

type Kind = "success" | "error" | "info";
interface Toast { id: number; kind: Kind; text: string }
const Ctx = createContext<(kind: Kind, text: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

/** In-app notifications. Errors always show; success/info messages respect the user's notification preference. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [items, setItems] = useState<Toast[]>([]);
  const n = useRef(0);
  const enabled = profile?.toasts_enabled !== false;

  const push = useCallback((kind: Kind, text: string) => {
    if (kind !== "error" && !enabled) return;
    const id = ++n.current;
    setItems((l) => [...l, { id, kind, text }]);
    setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), kind === "error" ? 7000 : 4000);
  }, [enabled]);

  const icon = { success: CheckCircle2, error: AlertTriangle, info: Info };
  const tone = { success: "border-emerald-400/30 text-emerald-100", error: "border-rose-400/40 text-rose-100", info: "border-electric/40 text-blue-100" };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="print-hide pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => { const Icon = icon[t.kind]; return (
          <div key={t.id} className={"glass pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-glow " + tone[t.kind]}>
            <Icon size={18} className="mt-0.5 shrink-0" /><p className="flex-1">{t.text}</p>
            <button aria-label="Dismiss" onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}><X size={16} /></button>
          </div>); })}
      </div>
    </Ctx.Provider>
  );
}
