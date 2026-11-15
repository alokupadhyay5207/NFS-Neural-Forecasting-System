import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Download, History as HistoryIcon, Search, Trash2 } from "lucide-react";
import { Banner, Btn, Card, ConfirmDialog, Empty, Modal, Pagination, RiskBadge, Select, Sk } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useAsync } from "../hooks/useAsync";
import { deleteBatch, deletePrediction, fetchAll, listBatches, listBatchResults, listPredictions } from "../lib/db";
import { downloadText, toCsv } from "../lib/export";
import { cx, pct } from "../lib/format";
import type { BatchRecord, PredictionRow, Risk } from "../lib/types";

const PAGE = 20;
const RISKS = ["All", "High", "Medium", "Low"];
const yn = (b: boolean) => (b ? "Yes" : "No");

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function Filters({ search, setSearch, risk, setRisk, from, setFrom, to, setTo, placeholder, hideRisk }: {
  search: string; setSearch: (v: string) => void; risk?: string; setRisk?: (v: string) => void; from: string; setFrom: (v: string) => void; to: string; setTo: (v: string) => void; placeholder: string; hideRisk?: boolean;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="relative min-w-[200px] flex-1 text-xs text-slate-400">Search
        <Search size={16} className="absolute left-3 top-[30px] text-slate-500" />
        <input className="input-nfs mt-1 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder} />
      </label>
      {!hideRisk && setRisk && <Select label="Risk" value={risk ?? "All"} onChange={setRisk} options={RISKS} />}
      <label className="text-xs text-slate-400">From<input type="date" className="input-nfs mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="text-xs text-slate-400">To<input type="date" className="input-nfs mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
    </div>
  );
}

function SortHead({ label, field, sort, asc, onSort }: { label: string; field: string; sort: string; asc: boolean; onSort: (f: string) => void }) {
  return <th className="th-nfs"><button onClick={() => onSort(field)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-white">{label}{sort === field && <span>{asc ? "▲" : "▼"}</span>}</button></th>;
}

// ------------------------------------------------------------------ individual predictions
function PredictionsTab() {
  const toast = useToast();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState(""); const q = useDebounced(search);
  const [risk, setRisk] = useState("All");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [sort, setSort] = useState("created_at"); const [asc, setAsc] = useState(false);
  const [detail, setDetail] = useState<PredictionRow | null>(null);
  const [del, setDel] = useState<PredictionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const filt = { search: q, risk: risk as Risk | "All", from: from || undefined, to: to || undefined, sort, asc };
  const data = useAsync(() => listPredictions({ ...filt, page, pageSize: PAGE }), [page, q, risk, from, to, sort, asc]);
  useEffect(() => { setPage(0); }, [q, risk, from, to, sort, asc]);

  const onSort = (f: string) => { if (sort === f) setAsc(!asc); else { setSort(f); setAsc(false); } };
  const exportCsv = async () => {
    try {
      const all = await fetchAll((p, size) => listPredictions({ ...filt, page: p, pageSize: size }));
      downloadText("nfs_prediction_history.csv", toCsv(["customer_id", "churn_probability", "risk_level", "predicted_churn", "model", "source", "timestamp_utc"],
        all.map((r) => [r.customer_id ?? "", r.churn_probability, r.risk_level, yn(r.predicted_churn), r.model_name, "Single", r.created_at])));
      toast("success", "Exported " + all.length + " predictions.");
    } catch (e) { toast("error", (e as Error).message); }
  };
  const remove = async () => {
    if (!del) return; setBusy(true);
    try { await deletePrediction(del.id); toast("success", "Prediction deleted."); setDel(null); data.reload(); }
    catch (e) { toast("error", (e as Error).message); }
    setBusy(false);
  };

  return (
    <Card title="Individual predictions" sub="Single-customer predictions saved to your account" right={<Btn kind="ghost" className="!py-1.5" onClick={exportCsv}><Download size={16} /> Export CSV</Btn>}>
      <Filters search={search} setSearch={setSearch} risk={risk} setRisk={setRisk} from={from} setFrom={setFrom} to={to} setTo={setTo} placeholder="Customer ID" />
      {data.loading ? <Sk h="h-48" /> : data.error ? <Empty icon={HistoryIcon} title="Could not load history" text={data.error} action={<Btn onClick={data.reload}>Try again</Btn>} />
      : !data.data || data.data.total === 0 ? <Empty icon={HistoryIcon} title="No predictions found" text={q || risk !== "All" || from || to ? "No records match these filters." : "Single predictions you run are saved here."} />
      : (<>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-white/10">
            <th className="th-nfs">Customer ID</th>
            <SortHead label="Probability" field="churn_probability" sort={sort} asc={asc} onSort={onSort} />
            <th className="th-nfs">Risk</th><th className="th-nfs">Predicted churn</th><th className="th-nfs">Model</th><th className="th-nfs">Source</th>
            <SortHead label="Timestamp" field="created_at" sort={sort} asc={asc} onSort={onSort} /><th className="th-nfs" />
          </tr></thead>
          <tbody>{data.data.rows.map((r) => (
            <tr key={r.id} className="cursor-pointer border-b border-white/5 hover:bg-white/5" onClick={() => setDetail(r)}>
              <td className="td-nfs font-medium text-slate-100">{r.customer_id || "—"}</td>
              <td className="td-nfs">{pct(Number(r.churn_probability))}</td><td className="td-nfs"><RiskBadge level={r.risk_level} /></td>
              <td className="td-nfs">{yn(r.predicted_churn)}</td><td className="td-nfs text-slate-300">{r.model_name}</td><td className="td-nfs text-slate-300">Single</td>
              <td className="td-nfs text-slate-500">{new Date(r.created_at).toLocaleString()}</td>
              <td className="td-nfs"><button aria-label="Delete prediction" className="text-slate-500 hover:text-rose-400" onClick={(e) => { e.stopPropagation(); setDel(r); }}><Trash2 size={16} /></button></td>
            </tr>))}</tbody>
        </table></div>
        <Pagination page={page} pageSize={PAGE} total={data.data.total} onPage={setPage} />
      </>)}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Prediction details" footer={<Btn kind="ghost" onClick={() => setDetail(null)}>Close</Btn>}>
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-3"><span className="text-3xl font-bold text-white">{pct(Number(detail.churn_probability))}</span><RiskBadge level={detail.risk_level} /></div>
            <p>{detail.customer_id ? "Customer " + detail.customer_id + " · " : ""}{new Date(detail.created_at).toLocaleString()} · {detail.model_name} · decision threshold {pct(Number(detail.threshold))}</p>
            <div><p className="mb-1 text-xs font-semibold uppercase text-slate-500">Input fields</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">{Object.entries(detail.features).map(([k, v]) => <Fragment key={k}><dt className="text-slate-500">{k}</dt><dd className="text-slate-200">{v === null ? "—" : String(v)}</dd></Fragment>)}</dl></div>
            {detail.drivers && detail.drivers.length > 0 && <div><p className="mb-1 text-xs font-semibold uppercase text-slate-500">What-if drivers (not causal)</p>
              <ul className="space-y-1 text-xs">{detail.drivers.map((d) => <li key={d.feature} className="flex justify-between"><span>{d.feature}: {String(d.value)}</span><span className={d.effect_points > 0 ? "text-rose-400" : "text-emerald-400"}>{d.effect_points > 0 ? "+" : ""}{d.effect_points} pts</span></li>)}</ul></div>}
          </div>)}
      </Modal>
      <ConfirmDialog open={!!del} busy={busy} title="Delete this prediction?" text="This permanently removes the prediction from your history. This cannot be undone." onConfirm={remove} onCancel={() => setDel(null)} />
    </Card>
  );
}

// ------------------------------------------------------------------ batches
function BatchResults({ batch }: { batch: BatchRecord }) {
  const toast = useToast();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState(""); const q = useDebounced(search);
  const [risk, setRisk] = useState("All");
  const filt = { search: q, risk: risk as Risk | "All" };
  const data = useAsync(() => listBatchResults(batch.id, { ...filt, page, pageSize: 25 }), [batch.id, page, q, risk]);
  useEffect(() => { setPage(0); }, [q, risk]);
  const exportCsv = async () => {
    try {
      const all = await fetchAll((p, size) => listBatchResults(batch.id, { ...filt, page: p, pageSize: size }), 20000);
      downloadText("nfs_batch_" + batch.filename.replace(/\.csv$/i, "").replace(/[^\w.-]+/g, "_") + ".csv", toCsv(["row", "customer_id", "churn_probability", "risk_level", "predicted_churn"],
        all.map((r) => [r.row_number, r.customer_id ?? "", r.churn_probability, r.risk_level, yn(r.predicted_churn)])));
    } catch (e) { toast("error", (e as Error).message); }
  };
  return (
    <div className="rounded-xl bg-navy-900/60 p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-400">Customer ID<input className="input-nfs mt-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" /></label>
          <Select label="Risk" value={risk} onChange={setRisk} options={RISKS} />
        </div>
        <Btn kind="ghost" className="!py-1.5" onClick={exportCsv}><Download size={16} /> Export results</Btn>
      </div>
      {data.loading ? <Sk h="h-32" /> : data.error ? <p className="text-sm text-rose-300">{data.error}</p> : !data.data?.total ? <p className="py-4 text-center text-sm text-slate-500">No results match.</p> : (<>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-white/10"><th className="th-nfs">Row</th><th className="th-nfs">Customer ID</th><th className="th-nfs">Probability</th><th className="th-nfs">Risk</th><th className="th-nfs">Predicted churn</th></tr></thead>
          <tbody>{data.data.rows.map((r) => (
            <tr key={r.id} className="border-b border-white/5"><td className="td-nfs text-slate-500">{r.row_number}</td><td className="td-nfs">{r.customer_id || "—"}</td>
              <td className="td-nfs">{pct(Number(r.churn_probability))}</td><td className="td-nfs"><RiskBadge level={r.risk_level} /></td><td className="td-nfs">{yn(r.predicted_churn)}</td></tr>))}</tbody>
        </table></div>
        <Pagination page={page} pageSize={25} total={data.data.total} onPage={setPage} />
      </>)}
    </div>
  );
}

function BatchesTab() {
  const toast = useToast();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState(""); const q = useDebounced(search);
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [del, setDel] = useState<BatchRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const data = useAsync(() => listBatches({ page, pageSize: 10, search: q, from: from || undefined, to: to || undefined }), [page, q, from, to]);
  useEffect(() => { setPage(0); }, [q, from, to]);
  const remove = async () => {
    if (!del) return; setBusy(true);
    try { await deleteBatch(del.id); toast("success", "Batch deleted."); setDel(null); setOpen(null); data.reload(); }
    catch (e) { toast("error", (e as Error).message); }
    setBusy(false);
  };
  return (
    <Card title="Batch uploads" sub="Expand a batch to see every customer’s saved probability and risk level">
      <Filters search={search} setSearch={setSearch} from={from} setFrom={setFrom} to={to} setTo={setTo} placeholder="File name" hideRisk />
      {data.loading ? <Sk h="h-48" /> : data.error ? <Empty icon={HistoryIcon} title="Could not load batches" text={data.error} action={<Btn onClick={data.reload}>Try again</Btn>} />
      : !data.data || data.data.total === 0 ? <Empty icon={HistoryIcon} title="No batches found" text={q || from || to ? "No batches match these filters." : "Upload a CSV on the Batch Prediction page and it will be saved here."} />
      : (<>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b border-white/10"><th className="th-nfs" /><th className="th-nfs">File</th><th className="th-nfs">Rows</th><th className="th-nfs">Scored</th><th className="th-nfs">Failed</th><th className="th-nfs">High</th><th className="th-nfs">Medium</th><th className="th-nfs">Low</th><th className="th-nfs">Time</th><th className="th-nfs">Timestamp</th><th className="th-nfs" /></tr></thead>
          <tbody>{data.data.rows.map((b) => (
            <Fragment key={b.id}>
              <tr className={cx("cursor-pointer border-b border-white/5 hover:bg-white/5", open === b.id && "bg-white/5")} onClick={() => setOpen(open === b.id ? null : b.id)}>
                <td className="td-nfs text-slate-400">{open === b.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                <td className="td-nfs font-medium text-slate-100">{b.filename}</td><td className="td-nfs">{b.total_rows}</td><td className="td-nfs">{b.successful_rows}</td>
                <td className="td-nfs">{b.failed_rows}</td><td className="td-nfs text-rose-300">{b.high_count}</td><td className="td-nfs text-amber-300">{b.medium_count}</td><td className="td-nfs text-emerald-300">{b.low_count}</td>
                <td className="td-nfs text-slate-400">{b.processing_ms === null ? "—" : b.processing_ms + " ms"}</td><td className="td-nfs text-slate-500">{new Date(b.created_at).toLocaleString()}</td>
                <td className="td-nfs"><button aria-label="Delete batch" className="text-slate-500 hover:text-rose-400" onClick={(e) => { e.stopPropagation(); setDel(b); }}><Trash2 size={16} /></button></td>
              </tr>
              {open === b.id && <tr><td colSpan={11} className="px-2 pb-4"><BatchResults batch={b} /></td></tr>}
            </Fragment>))}</tbody>
        </table></div>
        <Pagination page={page} pageSize={10} total={data.data.total} onPage={setPage} />
      </>)}
      <ConfirmDialog open={!!del} busy={busy} title="Delete this batch?" text={"This permanently removes “" + (del?.filename ?? "") + "” and all of its saved customer results. This cannot be undone."} onConfirm={remove} onCancel={() => setDel(null)} />
    </Card>
  );
}

export default function HistoryPage() {
  const [tab, setTab] = useState<"single" | "batch">("single");
  const navigate = useNavigate();
  return (
    <div className="space-y-5">
      <Banner>History is stored in your account and visible only to you. Probabilities and risk levels are the model’s saved outputs; failed CSV rows are counted but never stored with a probability. <button className="underline" onClick={() => navigate("/batch")}>Run a batch</button></Banner>
      <div className="flex gap-2" role="tablist">
        {([["single", "Individual predictions"], ["batch", "Batch uploads"]] as const).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cx("rounded-lg px-4 py-2 text-sm font-medium transition", tab === k ? "bg-electric/20 text-white ring-1 ring-white/10" : "text-slate-400 hover:bg-white/5")}>{label}</button>))}
      </div>
      {tab === "single" ? <PredictionsTab /> : <BatchesTab />}
    </div>
  );
}
