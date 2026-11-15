import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Check, Gauge, Target } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { useAsync } from "../hooks/useAsync";
import { Banner, Btn, Card, Chart, Empty, Kpi, Sk, Tag } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { cx, pct } from "../lib/format";
import type { Metrics, PipelineInfo } from "../lib/types";

const MET: [keyof Metrics["test_metrics"][string], string][] = [["accuracy", "Accuracy"], ["precision", "Precision"], ["recall", "Recall"], ["f1", "F1-score"], ["roc_auc", "ROC-AUC"]];
const tick = { fill: "#94A3B8", fontSize: 12 };
const tooltipStyle = { background: "#0C1838", border: "1px solid rgba(148,163,184,.25)", borderRadius: 8, color: "#E2E8F0" };

export default function Performance() {
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState("");
  const [tickN, setTickN] = useState(0);
  const pipe = useAsync(() => api<PipelineInfo>("/pipeline"), []);

  useEffect(() => {
    let alive = true;
    setM(null); setErr("");
    api<Metrics>("/metrics").then((d) => { if (alive) setM(d); }).catch((e: ApiError) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [tickN]);

  if (err) return <Card><Empty icon={AlertTriangle} title="Could not load the model metrics" text={err} action={<Btn onClick={() => setTickN(tickN + 1)}>Try again</Btn>} /></Card>;
  if (!m) return <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Sk key={i} />)}</div><Sk h="h-72" /></div>;

  const sel = m.selected_model, t = m.test_metrics[sel], d = m.dataset, s = m.settings, env = m.environment;
  const names = Object.keys(m.test_metrics).filter((k) => !k.startsWith("Baseline"));
  const baseKey = Object.keys(m.test_metrics).find((k) => k.startsWith("Baseline"));
  const base = baseKey ? m.test_metrics[baseKey] : null;
  const chartData = MET.map(([key, label]) => { const o: Record<string, string | number> = { metric: label }; names.forEach((n) => { o[n] = m.test_metrics[n][key] as number; }); return o; });
  const cell = (v: number, l: string, good: boolean) => (
    <div className={cx("rounded-xl p-4 text-center", good ? "bg-electric/15 text-blue-200" : "bg-rose-500/15 text-rose-200")}>
      <p className="text-2xl font-bold">{v}</p><p className="text-xs">{l}</p>
    </div>
  );
  const colors = ["#3B82F6", "#8B5CF6", "#22D3EE"];

  return (
    <div className="space-y-5">
      <Banner><b>Held-out test-set results.</b> These numbers were recorded by the training notebook on a held-out test set of {d.test_rows.toLocaleString()} customers from the IBM Telco <i>sample</i> dataset (created {new Date(m.created_at_utc).toLocaleString()}). They describe this dataset only and are not a promise of real-world performance. The notebook did not save ROC-curve points, so only the ROC-AUC value is shown.</Banner>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={"F1-score · " + sel} value={t.f1.toFixed(3)} icon={Target} tone="bg-electric/15 text-electric" note="test set" />
        <Kpi label="ROC-AUC" value={t.roc_auc.toFixed(3)} icon={Activity} tone="bg-violet-nfs/20 text-violet-300" note="test set" />
        <Kpi label="Precision / Recall" value={t.precision.toFixed(2) + " / " + t.recall.toFixed(2)} icon={Gauge} tone="bg-indigo-500/20 text-indigo-300" note={"threshold " + s.threshold} />
        <Kpi label="Accuracy" value={pct(t.accuracy)} icon={Check} tone="bg-emerald-500/15 text-emerald-400" note={base ? "baseline “always stay”: " + pct(base.accuracy) : undefined} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Confusion matrix" sub={sel + " · " + (t.tn + t.fp + t.fn + t.tp).toLocaleString() + " test customers · threshold " + s.threshold}>
          <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-2 text-xs text-slate-400">
            <span /><span className="text-center">Predicted: stay</span><span className="text-center">Predicted: churn</span>
            <span>Actual: stay</span>{cell(t.tn, "True negative", true)}{cell(t.fp, "False positive", false)}
            <span>Actual: churn</span>{cell(t.fn, "False negative", false)}{cell(t.tp, "True positive", true)}
          </div>
        </Card>
        <Card className="lg:col-span-2" title="Model comparison" sub={sel + " is the only model used for live predictions; the others are recorded comparison metrics, not live models"}>
          <Chart>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.15)" />
              <XAxis dataKey="metric" tick={tick} stroke="rgba(148,163,184,.3)" />
              <YAxis domain={[0, 1]} tick={{ ...tick, fontSize: 11 }} stroke="rgba(148,163,184,.3)" />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,.04)" }} />
              <Legend wrapperStyle={{ color: "#CBD5E1" }} />
              {names.map((n, i) => <Bar key={n} dataKey={n} fill={colors[i % 3]} radius={[4, 4, 0, 0]} />)}
            </BarChart>
          </Chart>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Cross-validation vs. test set" sub={s.cv_folds + "-fold CV on the training set (mean ± std) was used to choose the model"}>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="border-b border-white/10"><th className="th-nfs">Model</th><th className="th-nfs">CV F1</th><th className="th-nfs">CV ROC-AUC</th><th className="th-nfs">Test F1</th><th className="th-nfs">Test ROC-AUC</th></tr></thead>
            <tbody>{names.map((n) => (
              <tr key={n} className={cx("border-b border-white/5", n === sel && "bg-violet-nfs/10")}>
                <td className="td-nfs font-medium">{n}{n === sel && <span className="ml-2"><Tag>selected</Tag></span>}</td>
                <td className="td-nfs">{m.cross_validation_mean[n].f1.toFixed(3)} ± {m.cross_validation_std[n].f1.toFixed(3)}</td>
                <td className="td-nfs">{m.cross_validation_mean[n].roc_auc.toFixed(3)} ± {m.cross_validation_std[n].roc_auc.toFixed(3)}</td>
                <td className="td-nfs">{m.test_metrics[n].f1.toFixed(3)}</td>
                <td className="td-nfs">{m.test_metrics[n].roc_auc.toFixed(3)}</td>
              </tr>))}</tbody>
          </table></div>
          <p className="mt-3 text-xs text-slate-500">The two models score very close to each other; differences this small are within the cross-validation spread.</p>
        </Card>
        <Card title="Training run details">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {([["Customers (cleaned)", d.rows_after_cleaning.toLocaleString()], ["Train / test rows", d.train_rows.toLocaleString() + " / " + d.test_rows.toLocaleString()],
              ["Churn rate", pct(d.churn_rate_overall)], ["Threshold", s.threshold], ["Class weight", s.class_weight], ["Selected by", m.selection.metric + " (CV)"],
              ["Random state", s.random_state], ["scikit-learn", env.scikit_learn], ["Python / pandas", env.python + " / " + env.pandas]] as [string, string | number][]).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-white/5 px-3 py-2"><dt className="text-xs text-slate-400">{k}</dt><dd className="break-words font-medium text-slate-100">{String(v)}</dd></div>
            ))}
          </dl>
        </Card>
      </div>
      <Card title="Feature importance" sub="Which input fields the Random Forest relied on most, summed across their one-hot columns" right={<Tag>global · from training</Tag>}>
        {pipe.loading ? <Sk h="h-64" /> : !pipe.data?.feature_importance ? <p className="text-sm text-slate-500">Feature importance is not available from the loaded model.</p> : (
          <>
            <Chart h="h-[28rem]"><BarChart layout="vertical" data={pipe.data.feature_importance.map((f) => ({ name: f.feature, pct: Math.round(f.importance * 1000) / 10, type: f.type }))} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(148,163,184,.15)" />
              <XAxis type="number" tick={tick} unit="%" stroke="rgba(148,163,184,.3)" />
              <YAxis type="category" dataKey="name" width={120} tick={tick} stroke="rgba(148,163,184,.3)" interval={0} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,.04)" }} formatter={(v: number) => [v + "%", "Importance"]} />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]}>{pipe.data.feature_importance.map((f) => <Cell key={f.feature} fill={f.type === "numeric" ? "#3B82F6" : "#8B5CF6"} />)}</Bar>
            </BarChart></Chart>
            <p className="mt-2 text-xs text-slate-500">Blue = numeric fields, violet = categorical fields. Impurity-based importance describes the trained model overall; it is not an explanation of any single customer, is known to favour fields with many distinct values, and does not show cause and effect. For one customer, use the what-if drivers on the Predict page.</p>
          </>)}
      </Card>
      <Card title="Saved evaluation vs. live performance">
        <p className="text-sm text-slate-300">Every metric on this page was recorded once, at training time, on a held-out test set. NFS does <b>not</b> measure live production performance: it never learns whether a predicted customer actually churned, so no live accuracy, precision or recall can be shown. To track real-world performance you would need to record actual outcomes and compare them with these predictions.</p>
      </Card>
      <Card title="Model limitations">
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
          <li>Results come from a single held-out split of the public IBM Telco sample dataset. They do not guarantee performance on your customers or in production.</li>
          <li>Training used class_weight “{s.class_weight}”, so predicted probabilities are risk scores for ranking customers, not calibrated likelihoods.</li>
          <li>The what-if drivers on the Predict page show how a score moves when one field changes; they are not causal explanations.</li>
          <li>Precision of {t.precision.toFixed(2)} means roughly {Math.round((1 - t.precision) * 100)}% of customers flagged as churn were false alarms on this test set.</li>
          <li>The training notebook did not save ROC-curve points, so only the ROC-AUC value can be shown.</li>
        </ul>
      </Card>
    </div>
  );
}
