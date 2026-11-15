import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import type { AppContext } from "../components/Layout";
import { ConnBanner } from "../components/ConnBanner";
import { Banner, Btn, Card, Empty, Field, RiskBadge, Sk, Tag, RISK_COLOR } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { ADDONS, BLANK, EX_LOYAL, EX_RISKY, GROUPS, lab, type FormValues } from "../lib/constants";
import { cx, pct } from "../lib/format";
import type { V1PredictionResponse } from "../lib/types";
import { useToast } from "../context/ToastContext";

export default function Predict() {
  const { conn, schema, retry } = useOutletContext<AppContext>();
  const toast = useToast();
  const [cid, setCid] = useState("");
  const [f, setF] = useState<FormValues>(BLANK);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<V1PredictionResponse | null>(null);
  const [fail, setFail] = useState("");

  const set = (k: string, v: string) => {
    const n = { ...f, [k]: v };
    if (k === "InternetService") ADDONS.forEach((a) => { if (v === "No") n[a] = "No internet service"; else if (n[a] === "No internet service") n[a] = "No"; });
    if (k === "PhoneService") { if (v === "No") n.MultipleLines = "No phone service"; else if (n.MultipleLines === "No phone service") n.MultipleLines = "No"; }
    setF(n);
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    const t = Number(f.tenure), m = Number(f.MonthlyCharges), tc = f.TotalCharges === "" ? null : Number(f.TotalCharges);
    if (f.tenure === "" || !Number.isInteger(t) || t < 0 || t > 120) e.tenure = "Enter whole months between 0 and 120.";
    if (f.MonthlyCharges === "" || isNaN(m) || m <= 0) e.MonthlyCharges = "Enter a monthly charge above 0.";
    if (tc !== null && (isNaN(tc) || tc < 0)) e.TotalCharges = "Enter 0 or more, or leave blank.";
    setErr(e); setFail(""); setOut(null);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const res = await api<V1PredictionResponse>("/v1/predict", {
        customer_id: cid.trim() || null,
        customer: { ...f, SeniorCitizen: Number(f.SeniorCitizen), tenure: t, MonthlyCharges: m, TotalCharges: tc },
      }, { auth: true });
      setOut(res);
      if (res.saved) toast("success", "Prediction saved to your history.");
      else toast("error", res.save_error || "The prediction could not be saved.");
    } catch (x) {
      const ex = x as ApiError;
      if (ex.kind === "validation" && Array.isArray(ex.detail)) {
        const fe: Record<string, string> = {};
        (ex.detail as { loc: (string | number)[]; msg: string }[]).forEach((d) => { fe[String(d.loc[d.loc.length - 1])] = d.msg; });
        setErr(fe); setFail("The API rejected some fields.");
      } else setFail(ex.message ?? "Prediction failed.");
    }
    setBusy(false);
  };

  const maxD = out ? Math.max(...out.drivers.map((d) => Math.abs(d.effect_points)), 1) : 1;

  const control = (k: string) => {
    if (["tenure", "MonthlyCharges", "TotalCharges"].includes(k)) {
      return <input type="number" step="any" className="input-nfs" value={f[k]} onChange={(e) => set(k, e.target.value)}
        placeholder={k === "tenure" ? "e.g. 8" : k === "MonthlyCharges" ? "e.g. 79.5" : "leave blank if new"} />;
    }
    const opts: [string, string][] = k === "SeniorCitizen" ? [["0", "No"], ["1", "Yes"]] : (schema?.categorical_features[k] ?? []).map((o) => [o, o]);
    const locked = (ADDONS.includes(k) && f.InternetService === "No") || (k === "MultipleLines" && f.PhoneService === "No");
    return (
      <select className={cx("input-nfs", locked && "opacity-60")} disabled={locked} value={f[k]} onChange={(e) => set(k, e.target.value)}>
        {opts.map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
      </select>
    );
  };

  return (
    <div className="space-y-5">
      <ConnBanner conn={conn} retry={retry} />
      <Banner><b>Live prediction.</b> Results come from the trained Random Forest saved by your notebook, served by the FastAPI backend. The model was trained on the IBM Telco <i>sample</i> dataset, so this is a portfolio demonstration, not a production churn system.</Banner>
      {!schema ? (
        <Card><Empty icon={Sparkles} title="Form unavailable" text="The form is built from the API’s feature schema. Connect to the API to continue." /></Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-5">
          <Card className="xl:col-span-3" title="Customer information" sub="All 19 fields the model was trained on"
            right={<div className="flex gap-2">
              <Btn kind="ghost" className="!px-2 !py-1 text-xs" onClick={() => { setF(EX_RISKY); setErr({}); setOut(null); }}>Example: new customer</Btn>
              <Btn kind="ghost" className="!px-2 !py-1 text-xs" onClick={() => { setF(EX_LOYAL); setErr({}); setOut(null); }}>Example: loyal customer</Btn>
            </div>}>
            <div className="mb-5 max-w-sm">
              <Field label="Customer ID (optional)"><input className="input-nfs" maxLength={100} value={cid} onChange={(e) => setCid(e.target.value)} placeholder="e.g. 7590-VHVEG" /></Field>
            </div>
            {GROUPS.map(([title, keys]) => (
              <div key={title} className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
                <div className="grid gap-4 sm:grid-cols-2">{keys.map((k) => <Field key={k} label={lab(k)} error={err[k]}>{control(k)}</Field>)}</div>
              </div>
            ))}
            <div className="flex gap-3">
              <Btn onClick={submit} disabled={busy || conn.state !== "ok"}>
                {busy ? <><Loader2 className="animate-spin" size={18} /> Predicting…</> : <><Sparkles size={18} /> Predict churn risk</>}
              </Btn>
              <Btn kind="ghost" onClick={() => { setF(BLANK); setCid(""); setErr({}); setOut(null); setFail(""); }}>Reset</Btn>
            </div>
          </Card>
          <Card className="xl:col-span-2" title="Result" right={<Tag>Live model</Tag>}>
            {busy ? <div className="space-y-3"><Sk h="h-16" /><Sk h="h-32" /></div>
            : fail ? <div className="flex gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100"><AlertTriangle className="mt-0.5 shrink-0" size={18} />{fail}</div>
            : !out ? <Empty icon={Sparkles} title="No prediction yet" text="Fill in the form (or load an example) and click “Predict churn risk”." />
            : (
              <div className="space-y-5">
                <div>
                  <p className="text-xs text-slate-400">Predicted churn probability · {out.model.name}</p>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="text-5xl font-bold" style={{ color: RISK_COLOR[out.risk_level] }}>{pct(out.churn_probability)}</span>
                    <RiskBadge level={out.risk_level} />
                  </div>
                  <div className="mt-3 h-2.5 rounded-full bg-white/10"><div className="h-2.5 rounded-full bg-nfs-gradient" style={{ width: out.churn_probability * 100 + "%" }} /></div>
                  <p className="mt-1 text-xs text-slate-500">{new Date(out.created_at).toLocaleString()} · {out.saved ? "saved to your history" : "not saved"}</p>
                  <p className="mt-2 text-sm text-slate-300">The model predicts this customer is <b>{out.predicted_churn ? "likely to churn" : "likely to stay"}</b> (probability {out.predicted_churn ? "at or above" : "below"} the {pct(out.threshold)} decision threshold). This is a prediction, not a confirmed outcome. Risk bands: Medium from {pct(out.risk_bands.medium)}, High from {pct(out.risk_bands.high)}.</p>
                </div>
                {out.warnings.length > 0 && <div className="space-y-1 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">{out.warnings.map((w) => <p key={w}>⚠ {w}</p>)}</div>}
                {out.drivers.length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-white">Biggest levers for this customer</p>
                    <ul className="space-y-2.5">
                      {out.drivers.map((d) => (
                        <li key={d.feature} className="text-sm">
                          <div className="flex justify-between gap-2">
                            <span className="text-slate-300">{lab(d.feature)}: <b>{String(d.value)}</b></span>
                            <span className={d.effect_points > 0 ? "text-rose-400" : "text-emerald-400"}>{d.effect_points > 0 ? "+" : ""}{d.effect_points} pts</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-white/10"><div className={cx("h-1.5 rounded-full", d.effect_points > 0 ? "bg-rose-400" : "bg-emerald-400")} style={{ width: (Math.abs(d.effect_points) / maxD) * 100 + "%" }} /></div>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-slate-500">What-if sensitivity: how many percentage points the probability would move if that one field were swapped for the typical training value. It is not SHAP and does not prove cause.</p>
                  </div>
                )}
                <p className="text-xs text-slate-500">The model was trained with class_weight “{out.model.class_weight}”, so treat the percentage as a <b>risk score for ranking customers</b>, not an exact real-world likelihood.</p>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
