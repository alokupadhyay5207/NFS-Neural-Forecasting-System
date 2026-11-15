import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { AlertTriangle, Check, FileText, Gauge, Loader2, Search, Target, Upload } from "lucide-react";
import type { AppContext } from "../components/Layout";
import { ConnBanner } from "../components/ConnBanner";
import { Banner, Btn, Card, Empty, Kpi, Pagination, RiskBadge, Select, Tag } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { downloadText, toCsv } from "../lib/export";
import { useToast } from "../context/ToastContext";
import { SAMPLE_CSV } from "../lib/constants";
import { prepareBatch } from "../lib/csv";
import { cx, pct } from "../lib/format";
import type { V1BatchResponse } from "../lib/types";

export default function Batch() {
  const { conn, schema, retry } = useOutletContext<AppContext>();
  const toast = useToast();
  const [readPct, setReadPct] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<V1BatchResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [show, setShow] = useState("All rows");
  const [q, setQ] = useState("");
  const [rpage, setRpage] = useState(0);
  const RPAGE = 25;

  const handleText = (text: string, fname: string) => {
    setRes(null); setErr(""); setRows([]); setName(fname);
    if (!schema) { setErr("The API schema is not loaded yet. Connect to the API first."); return; }
    const prepared = prepareBatch(text, schema.feature_order);
    if (!prepared.ok) { setErr(prepared.error); return; }
    setRows(prepared.rows);
  };

  const onFile = (file?: File) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { setErr("Please upload a .csv file."); setRows([]); setRes(null); return; }
    if (file.size > 25 * 1024 * 1024) { setErr("That file is larger than 25 MB."); setRows([]); setRes(null); return; }
    const rd = new FileReader();
    setReadPct(0);
    rd.onprogress = (e) => { if (e.lengthComputable) setReadPct(Math.round((e.loaded / e.total) * 100)); };
    rd.onload = () => { setReadPct(null); handleText(String(rd.result), file.name); };
    rd.onerror = () => { setReadPct(null); setErr("Could not read that file."); };
    rd.readAsText(file);
  };

  const run = async () => {
    setBusy(true); setErr("");
    try {
      const out = await api<V1BatchResponse>("/v1/predict/batch", { filename: name.slice(0, 255), customers: rows }, { auth: true });
      setRes(out);
      if (out.saved) toast("success", "Batch saved: " + out.scored + " customer results stored in your history.");
      else toast("error", out.save_error || "The batch could not be saved.");
    } catch (x) { setErr((x as ApiError).message ?? "Batch prediction failed."); }
    setBusy(false);
  };

  const download = () => {
    if (!res) return;
    const idOf = (id?: string | null) => id ?? "";
    downloadText("nfs_predictions_" + name.replace(/\.csv$/i, "").replace(/[^\w.-]+/g, "_") + ".csv", toCsv(
      ["row", "customer_id", "status", "churn_probability", "risk_level", "predicted_churn", "warnings", "errors"],
      res.results.map((r) => [r.row, idOf(r.id), r.status, r.churn_probability ?? "", r.risk_level ?? "", r.predicted_churn === null || r.predicted_churn === undefined ? "" : r.predicted_churn ? "yes" : "no", r.warnings.join("; "), r.errors.join("; ")])));
  };

  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const needle = q.trim().toLowerCase();
  const shown = res ? res.results.filter((r) =>
    (show === "All rows" || (show === "Invalid rows" && r.status === "error") || (show.endsWith(" risk") && r.status === "ok" && r.risk_level === show.split(" ")[0])) &&
    (!needle || (r.id ?? "").toLowerCase().includes(needle) || String(r.row) === needle)) : [];
  useEffect(() => { setRpage(0); }, [show, q, res]);

  return (
    <div className="space-y-5">
      <ConnBanner conn={conn} retry={retry} />
      <Banner><b>Live batch scoring.</b> Your CSV is read in your browser and sent only to your own prediction API. Required columns (any order, any capitalisation): {schema ? schema.feature_order.filter((c) => c !== "TotalCharges").join(", ") : "…"}. <code>TotalCharges</code> and <code>customerID</code> are optional; other columns (like <code>Churn</code>) are ignored. The original Telco CSV works as-is.</Banner>
      <Card title="1. Upload a CSV">
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
          className={cx("rounded-xl border-2 border-dashed p-8 text-center transition", drag ? "border-violet-nfs bg-violet-nfs/10" : "border-white/15")}>
          <div className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-full bg-electric/15 text-electric"><Upload size={20} /></div>
          <p className="text-sm text-slate-300">Drag a .csv file here, or <label className="cursor-pointer font-medium text-cyan-nfs underline">browse
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} /></label></p>
          {readPct !== null && <div className="mx-auto mt-3 h-2 w-64 rounded-full bg-white/10" role="progressbar" aria-valuenow={readPct}><div className="h-2 rounded-full bg-nfs-gradient transition-all" style={{ width: readPct + "%" }} /></div>}
          <p className="mt-1 text-xs text-slate-500">or</p>
          <Btn kind="ghost" className="mt-2" onClick={() => handleText(SAMPLE_CSV, "sample_customers.csv (hand-written examples)")}>Load sample CSV (6 hand-written customers)</Btn>
        </div>
        {err && <div className="mt-4 flex gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100"><AlertTriangle className="mt-0.5 shrink-0" size={18} />{err}</div>}
      </Card>
      {rows.length > 0 && (
        <Card title="2. Preview" sub={name + " · " + rows.length + " rows (showing first 5)"}
          right={<Btn onClick={run} disabled={busy || conn.state !== "ok"}>{busy ? <><Loader2 className="animate-spin" size={18} /> Scoring…</> : "Run predictions"}</Btn>}>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b border-white/10">{cols.map((k) => <th key={k} className="th-nfs">{k}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 5).map((o, i) => <tr key={i} className="border-b border-white/5">{cols.map((k) => <td key={k} className="td-nfs text-slate-300">{o[k]}</td>)}</tr>)}</tbody>
          </table></div>
        </Card>
      )}
      {busy && <Card><div className="flex items-center gap-3 text-sm text-slate-300"><Loader2 className="animate-spin" size={18} /> Scoring {rows.length.toLocaleString()} rows with the live model and saving results… large files can take a few seconds.</div></Card>}
      {res && !busy && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi label="Total rows" value={res.count.toLocaleString()} icon={FileText} tone="bg-slate-500/15 text-slate-300" note={res.processing_ms + " ms · " + (res.saved ? "saved" : "not saved")} />
            <Kpi label="Scored" value={res.scored} icon={Check} tone="bg-electric/15 text-electric" note={res.failed ? res.failed + " invalid row(s)" : "all rows valid"} />
            <Kpi label="High risk" value={res.summary.High} icon={AlertTriangle} tone="bg-rose-500/15 text-rose-400" />
            <Kpi label="Medium risk" value={res.summary.Medium} icon={Gauge} tone="bg-amber-500/15 text-amber-400" />
            <Kpi label="Low risk" value={res.summary.Low} icon={Target} tone="bg-emerald-500/15 text-emerald-400" />
          </div>
          <Card title="3. Results" sub={"Model: " + res.model.name + " · " + shown.length.toLocaleString() + " of " + res.count.toLocaleString() + " rows match"}
            right={<div className="flex flex-wrap items-center gap-2"><Btn kind="ghost" className="!py-1.5" onClick={download}>Download CSV</Btn><Tag>Live model</Tag><input className="input-nfs !w-44" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer ID or row" aria-label="Search results" /><Select label="" value={show} onChange={setShow} options={["All rows", "High risk", "Medium risk", "Low risk", "Invalid rows"]} /></div>}>
            {shown.length === 0 ? <Empty icon={Search} title="Nothing to show" text="No rows match this filter." /> : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="border-b border-white/10"><th className="th-nfs">Row</th><th className="th-nfs">Customer</th><th className="th-nfs">Probability</th><th className="th-nfs">Risk</th><th className="th-nfs">Notes</th></tr></thead>
                <tbody>{shown.slice(rpage * RPAGE, (rpage + 1) * RPAGE).map((r) => (
                  <tr key={r.row} className="border-b border-white/5">
                    <td className="td-nfs text-slate-500">{r.row}</td>
                    <td className="td-nfs font-medium text-slate-100">{r.id || "—"}</td>
                    {r.status === "error"
                      ? <td className="px-4 py-2.5 text-xs text-rose-400" colSpan={3}>Invalid: {r.errors.join("; ")}</td>
                      : <><td className="td-nfs">{pct(r.churn_probability as number)}</td><td className="td-nfs"><RiskBadge level={r.risk_level!} /></td><td className="px-4 py-2.5 text-xs text-amber-300">{r.warnings.join(" ")}</td></>}
                  </tr>))}</tbody>
              </table></div>
            )}
            {shown.length > RPAGE && <Pagination page={rpage} pageSize={RPAGE} total={shown.length} onPage={setRpage} />}
          </Card>
        </>
      )}
      {!rows.length && !err && <Card><Empty icon={FileText} title="No data loaded" text="Upload a CSV or load the sample to preview rows and run live predictions." /></Card>}
    </div>
  );
}
