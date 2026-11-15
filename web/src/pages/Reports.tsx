import { useState } from "react";
import { AlertTriangle, Download, FileText, Loader2, Printer } from "lucide-react";
import { Banner, Btn, Card, Empty, Select, Tag } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useAsync } from "../hooks/useAsync";
import { api, ApiError } from "../lib/api";
import { listBatches } from "../lib/db";
import { csvFromRows, downloadText } from "../lib/export";
import { cx } from "../lib/format";
import type { Report } from "../lib/types";

const KINDS = [
  { id: "executive", title: "Executive summary", text: "Key figures, risk distribution, segments and the model in use." },
  { id: "risk", title: "Customer risk report", text: "Risk distribution, contract breakdown, segments and daily activity." },
  { id: "segment", title: "Customer segment report", text: "Segments plus risk by contract, tenure, monthly charge and tech support." },
  { id: "batch", title: "Batch prediction report", text: "Counts and risk split for one uploaded batch." },
  { id: "model", title: "Model performance report", text: "Recorded test metrics, confusion matrix, comparison and limitations." },
] as const;

export default function Reports() {
  const toast = useToast();
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("executive");
  const [batchLabel, setBatchLabel] = useState("");
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState("");
  const batches = useAsync(() => listBatches({ page: 0, pageSize: 50 }), []);
  const status = useAsync(() => api<{ configured: boolean }>("/v1/assistant/status", undefined, { auth: true }).catch(() => ({ configured: false })), []);

  const batchRows = batches.data?.rows ?? [];
  const labels = batchRows.map((b) => b.filename + " · " + new Date(b.created_at).toLocaleString());
  const chosen = batchRows[labels.indexOf(batchLabel)] ?? batchRows[0];
  const aiOk = Boolean(status.data?.configured);

  const generate = async () => {
    setErr(""); setReport(null);
    if (kind === "batch" && !chosen) { setErr("Upload and save a batch first, then pick it here."); return; }
    setBusy(true);
    try {
      const r = await api<Report>("/v1/reports/generate", { kind, batch_id: kind === "batch" ? chosen.id : null, include_ai_summary: ai && aiOk }, { auth: true });
      setReport(r); toast("success", "Report generated.");
    } catch (e) { setErr((e as ApiError).message || "Could not generate the report."); }
    setBusy(false);
  };

  const csv = () => {
    if (!report) return;
    const rows: unknown[][] = [[report.title], ["Generated (UTC)", report.generated_at], []];
    report.sections.forEach((s) => {
      rows.push([s.heading]);
      s.paragraphs.forEach((p) => rows.push([p]));
      if (s.table) { rows.push(s.table.columns); s.table.rows.forEach((r) => rows.push(r)); }
      rows.push([]);
    });
    if (report.ai_summary) rows.push(["AI-written narrative (not a model prediction)"], [report.ai_summary], []);
    rows.push(["Note", report.disclaimer]);
    downloadText("nfs_" + report.kind + "_report.csv", csvFromRows(rows));
  };

  return (
    <div className="space-y-5">
      <Banner>Reports are built from your real saved predictions and the recorded model metrics. Use <b>Print / Save as PDF</b> to export a PDF with your browser.</Banner>
      <div className="print-hide grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {KINDS.map((k) => (
          <button key={k.id} onClick={() => setKind(k.id)} className={cx("glass rounded-2xl p-4 text-left transition", kind === k.id ? "glow-border" : "hover:border-white/25")}>
            <p className="font-semibold text-white">{k.title}</p><p className="mt-1 text-xs text-slate-400">{k.text}</p>
          </button>))}
      </div>
      <Card className="print-hide">
        <div className="flex flex-wrap items-end gap-4">
          {kind === "batch" && (batchRows.length ? <div className="min-w-[260px]"><Select label="Batch" value={batchLabel || labels[0]} onChange={setBatchLabel} options={labels} /></div> : <p className="text-sm text-slate-400">No saved batches yet.</p>)}
          <label className={cx("flex items-center gap-2 text-sm", aiOk ? "text-slate-200" : "text-slate-500")} title={aiOk ? "" : "AI is not configured on the server"}>
            <input type="checkbox" disabled={!aiOk} checked={ai && aiOk} onChange={(e) => setAi(e.target.checked)} className="accent-electric" /> Add an AI-written narrative {!aiOk && "(requires AI configuration)"}
          </label>
          <Btn onClick={generate} disabled={busy}>{busy ? <><Loader2 className="animate-spin" size={16} /> Generating…</> : <><FileText size={16} /> Generate report</>}</Btn>
        </div>
        {err && <p className="mt-3 flex items-center gap-2 text-sm text-rose-300"><AlertTriangle size={16} />{err}</p>}
      </Card>

      {!report ? <Card className="print-hide"><Empty icon={FileText} title="No report generated" text="Choose a report type and click “Generate report”." /></Card> : (
        <div className="print-area space-y-4">
          <div className="print-hide flex flex-wrap gap-2"><Btn kind="ghost" onClick={csv}><Download size={16} /> Download CSV</Btn><Btn kind="ghost" onClick={() => window.print()}><Printer size={16} /> Print / Save as PDF</Btn></div>
          <Card>
            <h2 className="text-2xl font-bold text-white">NFS · {report.title}</h2>
            <p className="mt-1 text-xs text-slate-400">Generated {new Date(report.generated_at).toLocaleString()}</p>
          </Card>
          {report.ai_summary && <Card title="Narrative summary" right={<Tag>AI-generated</Tag>}><p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{report.ai_summary}</p><p className="mt-3 text-xs text-slate-500">Written by a language model from the figures in this report; not a model prediction.</p></Card>}
          {report.sections.map((s) => (
            <Card key={s.heading} title={s.heading}>
              {s.paragraphs.map((p, i) => <p key={i} className="mb-2 text-sm text-slate-300">{p}</p>)}
              {s.table && (
                <div className="overflow-x-auto"><table className="w-full text-sm">
                  <thead><tr className="border-b border-white/10">{s.table.columns.map((c, i) => <th key={i} className="th-nfs">{c}</th>)}</tr></thead>
                  <tbody>{s.table.rows.map((r, i) => <tr key={i} className="border-b border-white/5">{r.map((c, j) => <td key={j} className="td-nfs text-slate-200">{c === null ? "n/a" : String(c)}</td>)}</tr>)}</tbody>
                </table></div>)}
            </Card>))}
          <p className="text-xs text-slate-500">{report.disclaimer}</p>
        </div>)}
    </div>
  );
}
