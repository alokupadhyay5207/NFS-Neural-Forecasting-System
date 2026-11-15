import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { Metrics, Report } from "../lib/types";
import { Activity, AlertTriangle, BarChart3, Bot, Gauge, LayoutDashboard, Loader2, Sparkles, Target, Upload, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { Banner, Btn, Card, Chart, Empty, Kpi, RISK_COLOR, RiskBadge, Select, Sk, Tag } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { getActivity, getByContract, getOverview, getSegments, recentBatches, recentPredictions } from "../lib/db";
import { pct } from "../lib/format";

const tick = { fill: "#94A3B8", fontSize: 12 };
const tip = { background: "#0C1838", border: "1px solid rgba(148,163,184,.25)", borderRadius: 8, color: "#E2E8F0" };
const RANGES: Record<string, number> = { "Last 7 days": 7, "Last 30 days": 30, "Last 90 days": 90 };

export default function Overview() {
  const navigate = useNavigate();
  const [range, setRange] = useState("Last 30 days");
  const o = useAsync(getOverview, []);
  const act = useAsync(() => getActivity(RANGES[range]), [range]);
  const con = useAsync(getByContract, []);
  const model = useAsync(() => api<Metrics>("/metrics"), []);
  const segs = useAsync(getSegments, []);
  const aiStatus = useAsync(() => api<{ configured: boolean }>("/v1/assistant/status", undefined, { auth: true }).catch(() => ({ configured: false })), []);
  const [insight, setInsight] = useState<{ busy: boolean; text?: string; error?: string }>({ busy: false });
  const generateInsights = async () => {
    setInsight({ busy: true });
    try {
      const r = await api<Report>("/v1/reports/generate", { kind: "executive", include_ai_summary: true }, { auth: true });
      setInsight({ busy: false, text: r.ai_summary ?? undefined, error: r.ai_summary ? undefined : "The server returned no narrative." });
    } catch (e) { setInsight({ busy: false, error: (e as Error).message }); }
  };
  const recent = useAsync(async () => ({ p: await recentPredictions(6), b: await recentBatches(4) }), []);

  if (o.loading) return <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Sk key={i} />)}</div><Sk h="h-72" /></div>;
  if (o.error || !o.data) return <Card><Empty icon={AlertTriangle} title="Could not load analytics" text={o.error || "No data returned."} action={<Btn onClick={o.reload}>Try again</Btn>} /></Card>;

  const d = o.data;
  if (!d.total_predictions) {
    return (
      <Card>
        <Empty icon={LayoutDashboard} title="No predictions yet" text="Your dashboard is built only from real predictions saved to your account. Run a single prediction or upload a CSV to see analytics here."
          action={<div className="flex justify-center gap-2"><Btn onClick={() => navigate("/predict")}><Sparkles size={16} /> Predict a customer</Btn><Btn kind="ghost" onClick={() => navigate("/batch")}><Upload size={16} /> Upload CSV</Btn></div>} />
      </Card>
    );
  }

  const pie = [{ name: "High", value: d.high }, { name: "Medium", value: d.medium }, { name: "Low", value: d.low }].filter((x) => x.value > 0);
  const days = (act.data ?? []).map((a) => ({ day: a.activity_day.slice(5), predictions: a.prediction_count, high: a.high_count, avg: a.avg_probability === null ? null : Math.round(Number(a.avg_probability) * 1000) / 10 }));
  const contracts = (con.data ?? []).map((c) => ({ contract: c.contract, avg: c.avg_probability === null ? 0 : Math.round(Number(c.avg_probability) * 1000) / 10, predictions: c.predictions }));

  return (
    <div className="space-y-5">
      <Banner>Every number here is computed from the predictions saved to your account. They are model predictions (risk scores), not confirmed churn.</Banner>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Customers analysed" value={d.customers_analysed.toLocaleString()} icon={Users} tone="bg-electric/15 text-electric" note="distinct IDs + rows without an ID" />
        <Kpi label="Total predictions" value={d.total_predictions.toLocaleString()} icon={Activity} tone="bg-violet-nfs/20 text-violet-300" note={d.single_predictions + " single · " + d.batch_predictions + " batch"} />
        <Kpi label="Predicted to churn" value={d.predicted_churn.toLocaleString()} icon={Target} tone="bg-indigo-500/20 text-indigo-300" note="probability ≥ threshold" />
        <Kpi label="Avg churn probability" value={d.avg_probability === null ? "n/a" : pct(Number(d.avg_probability))} icon={Gauge} tone="bg-cyan-500/15 text-cyan-300" />
        <Kpi label="High risk" value={d.high.toLocaleString()} icon={AlertTriangle} tone="bg-rose-500/15 text-rose-400" />
        <Kpi label="Medium risk" value={d.medium.toLocaleString()} icon={Gauge} tone="bg-amber-500/15 text-amber-400" />
        <Kpi label="Low risk" value={d.low.toLocaleString()} icon={Target} tone="bg-emerald-500/15 text-emerald-400" />
        <Kpi label="Batch uploads" value={d.batches.toLocaleString()} icon={Upload} tone="bg-sky-500/15 text-sky-300" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Risk distribution" sub="All saved predictions">
          <Chart><PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="none">
            {pie.map((e) => <Cell key={e.name} fill={RISK_COLOR[e.name as "High"]} />)}</Pie><Tooltip contentStyle={tip} /><Legend wrapperStyle={{ color: "#CBD5E1" }} /></PieChart></Chart>
        </Card>
        <Card className="lg:col-span-2" title="Prediction activity" sub="Predictions per day (bars) and average predicted probability % (line)" right={<Select label="" value={range} onChange={setRange} options={Object.keys(RANGES)} />}>
          {act.loading ? <Sk h="h-64" /> : days.length === 0 ? <Empty icon={BarChart3} title="No activity in this period" text="Try a longer range." /> : (
            <Chart><ComposedChart data={days}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.15)" />
              <XAxis dataKey="day" tick={tick} stroke="rgba(148,163,184,.3)" />
              <YAxis yAxisId="l" tick={tick} allowDecimals={false} stroke="rgba(148,163,184,.3)" />
              <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={tick} stroke="rgba(148,163,184,.3)" />
              <Tooltip contentStyle={tip} cursor={{ fill: "rgba(255,255,255,.04)" }} /><Legend wrapperStyle={{ color: "#CBD5E1" }} />
              <Bar yAxisId="l" dataKey="predictions" name="Predictions" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="l" dataKey="high" name="High risk" fill="#F43F5E" radius={[4, 4, 0, 0]} />
              <Line yAxisId="r" type="monotone" dataKey="avg" name="Avg probability %" stroke="#22D3EE" strokeWidth={2} dot={false} connectNulls />
            </ComposedChart></Chart>)}
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Average predicted probability by contract" sub="Customer analytics from your saved predictions">
          {con.loading ? <Sk h="h-64" /> : contracts.length === 0 ? <Empty icon={BarChart3} title="Nothing to chart yet" text="Contract data appears once predictions are saved." /> : (
            <Chart><BarChart data={contracts}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.15)" />
              <XAxis dataKey="contract" tick={tick} stroke="rgba(148,163,184,.3)" /><YAxis domain={[0, 100]} tick={tick} stroke="rgba(148,163,184,.3)" />
              <Tooltip contentStyle={tip} cursor={{ fill: "rgba(255,255,255,.04)" }} />
              <Bar dataKey="avg" name="Avg probability %" fill="#8B5CF6" radius={[4, 4, 0, 0]} /></BarChart></Chart>)}
        </Card>
        <Card title="Recent activity" right={<Link to="/history" className="text-xs text-cyan-nfs hover:underline">View all</Link>}>
          {recent.loading ? <Sk h="h-48" /> : (
            <ul className="divide-y divide-white/5 text-sm">
              {(recent.data?.p ?? []).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-slate-200">Single · {p.customer_id || "no ID"}<span className="ml-2 text-xs text-slate-500">{new Date(p.created_at).toLocaleString()}</span></span>
                  <span className="flex items-center gap-2"><span className="text-slate-300">{pct(Number(p.churn_probability))}</span><RiskBadge level={p.risk_level} /></span>
                </li>))}
              {(recent.data?.b ?? []).map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-slate-200">Batch · {b.filename}<span className="ml-2 text-xs text-slate-500">{new Date(b.created_at).toLocaleString()}</span></span>
                  <span className="whitespace-nowrap text-xs text-slate-400">{b.successful_rows} scored · {b.high_count} high</span>
                </li>))}
              {!(recent.data?.p.length || recent.data?.b.length) && <li className="py-6 text-center text-slate-500">No recent activity.</li>}
            </ul>)}
        </Card>
      </div>
      <Card title="Segment analytics" sub="Rule-based groups from your saved predictions (groups can overlap)" right={<Link to="/segments" className="text-xs text-cyan-nfs hover:underline">Explore segments</Link>}>
        {segs.loading ? <Sk h="h-20" /> : !segs.data ? <p className="text-sm text-slate-500">Segments unavailable ({segs.error}).</p> : (
          <div className="grid gap-3 md:grid-cols-3">
            {segs.data.map((g) => { const label: Record<string, string> = { new_month_to_month: "New month-to-month", high_bill_no_tech_support: "High bill, no tech support", loyal_long_term: "Loyal long-term" }; return (
              <div key={g.key} className="rounded-lg bg-white/5 px-3 py-2 text-sm">
                <p className="text-xs text-slate-400">{label[g.key] ?? g.key}</p>
                <p className="font-semibold text-white">{g.size.toLocaleString()} <span className="text-xs font-normal text-slate-400">customers</span></p>
                <p className="text-xs text-slate-400">{g.size ? "avg predicted risk " + pct(Number(g.avg_probability)) + " · " + g.high + " high" : "none in your data yet"}</p>
              </div>); })}
          </div>)}
      </Card>
      <Card title="AI business insights" sub="Written by a language model from your aggregate statistics" right={<Tag>AI-generated</Tag>}>
        {aiStatus.loading ? <Sk h="h-16" /> : !aiStatus.data?.configured ? (
          <p className="flex items-start gap-2 text-sm text-slate-300"><Bot size={18} className="mt-0.5 shrink-0 text-amber-400" /> AI functionality requires configuration. The server operator must set <code>NFS_LLM_PROVIDER</code>, <code>NFS_LLM_API_KEY</code> and <code>NFS_LLM_MODEL</code> (see <code>docs/AI_SETUP.md</code>). Nothing is simulated.</p>
        ) : (
          <div className="space-y-3">
            <Btn onClick={generateInsights} disabled={insight.busy}>{insight.busy ? <><Loader2 className="animate-spin" size={16} /> Generating…</> : <><Bot size={16} /> Generate insights</>}</Btn>
            {insight.error && <p role="alert" className="text-sm text-rose-300">{insight.error}</p>}
            {insight.text && <div><p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{insight.text}</p><p className="mt-2 text-xs text-slate-500">AI-generated from the figures shown on this dashboard; these are model predictions, not confirmed churn. Verify important numbers above.</p></div>}
          </div>)}
      </Card>
      <Card title="Model information" sub="The model behind every prediction on this page">
        {model.loading ? <Sk h="h-20" /> : !model.data ? <p className="text-sm text-slate-500">Model information is unavailable ({model.error || "backend offline"}).</p> : (() => {
          const m = model.data, t = m.test_metrics[m.selected_model];
          return (
            <div className="space-y-3 text-sm">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {([["Live model", m.selected_model], ["Decision threshold", String(m.settings.threshold)], ["Test F1 · ROC-AUC", t.f1.toFixed(3) + " · " + t.roc_auc.toFixed(3)], ["Evaluated on", m.dataset.test_rows.toLocaleString() + " held-out customers"]] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-white/5 px-3 py-2"><p className="text-xs text-slate-400">{k}</p><p className="font-medium text-slate-100">{v}</p></div>))}
              </div>
              <p className="text-xs text-slate-500">These are saved training-time evaluation results on the IBM Telco sample dataset, not live performance. <Link to="/performance" className="text-cyan-nfs hover:underline">Details</Link></p>
            </div>);
        })()}
      </Card>
    </div>
  );
}
