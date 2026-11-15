import { useState, type KeyboardEvent } from "react";
import { useOutletContext } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import type { AppContext } from "../components/Layout";
import { Banner, Btn, Card, Empty, Sk, Tag } from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { cx, pct } from "../lib/format";
import type { Metrics, PipelineInfo } from "../lib/types";

interface Stage { title: string; node: string; short: string; body: string[] }

type Step = { type: string; strategy?: unknown; handle_unknown?: unknown };
const find = (steps: Step[] | undefined, type: string) => steps?.find((x) => x.type === type);

function buildStages(p: PipelineInfo, schemaMissing: string[], inputCount: number): Stage[] {
  const num = p.preprocessing.branches.find((b) => b.name === "num");
  const cat = p.preprocessing.branches.find((b) => b.name === "cat");
  const numImp = find(num?.steps, "SimpleImputer"), catImp = find(cat?.steps, "SimpleImputer"), scaler = find(num?.steps, "StandardScaler"), ohe = find(cat?.steps, "OneHotEncoder");
  const chain = (b?: { steps: Step[] }) => b ? b.steps.map((x) => x.type + (x.strategy ? " (" + String(x.strategy) + ")" : "") + (x.handle_unknown ? " (handle_unknown=" + String(x.handle_unknown) + ")" : "")).join(" → ") : "unavailable";
  const m = p.model, bands = p.risk_bands, th = p.threshold;
  return [
    { title: "Customer Data Input", node: "Customer data", short: "19 fields", body: [
      `${inputCount} input fields: ${num?.columns.length ?? "?"} numeric (${num?.columns.join(", ") ?? "unavailable"}) and ${cat?.columns.length ?? "?"} categorical (${cat?.columns.join(", ") ?? "unavailable"}).`,
      "Values arrive from the Predict form or from a CSV row. The optional Customer ID is only a label for your history; the model never sees it." ] },
    { title: "Data Validation", node: "Validation", short: "Strict schema", body: [
      "Before the model runs, every request is checked by a strict schema that mirrors feature_schema.json (and is cross-checked against it when the API starts): only the 19 known fields, only the allowed category values, and numeric limits (tenure 0–120 months, MonthlyCharges above 0 up to 1,000, TotalCharges 0–1,000,000 or blank).",
      "An invalid single prediction is rejected with a field-level message. In a CSV batch, invalid rows are reported with their errors and are never scored or stored as predictions." ] },
    { title: "Numerical Preprocessing", node: "Numeric branch", short: `${num?.columns.length ?? "?"} columns`, body: [
      `The saved pipeline's ColumnTransformer sends the numeric columns (${num?.columns.join(", ") ?? "unavailable"}) through their own branch: ${chain(num)}.`,
      "Columns not assigned to a branch would be dropped (remainder: " + (p.preprocessing.remainder ?? "unavailable") + "). The fitted transformer from training is reused for every prediction, so inputs are processed identically." ] },
    { title: "Categorical Preprocessing", node: "Categorical branch", short: `${cat?.columns.length ?? "?"} columns`, body: [
      `The categorical columns go through a separate branch: ${chain(cat)}.`,
      "Allowed values for each field come from feature_schema.json." ] },
    { title: "Missing-Value Imputation", node: "Imputation", short: "median / most frequent", body: [
      `Numeric blanks are filled with the training ${String(numImp?.strategy ?? "median")}; categorical blanks with the ${String(catImp?.strategy ?? "most frequent")} training value (both fitted on the training data only).`,
      schemaMissing.length ? `In the training data only ${schemaMissing.join(", ")} had missing values, so that is where imputation normally matters; a blank TotalCharges is accepted.` : "The feature schema reports no numeric field with missing values in training.",
      "The API also returns warnings when a numeric value is missing (the typical training value is used), falls outside the range seen in training, or when phone/internet service fields contradict each other." ] },
    { title: "Numerical Scaling", node: "Scaling", short: scaler?.type ?? "StandardScaler", body: [
      `Numeric columns are standardised with ${scaler?.type ?? "a scaler"} (zero mean, unit variance, using the training mean and standard deviation) after imputation.`,
      "Tree models such as Random Forests do not strictly need scaling; it is simply a step that exists in the saved pipeline." ] },
    { title: "One-Hot Encoding", node: "One-hot encoding", short: "0/1 indicators", body: [
      `Categorical fields become 0/1 indicator columns with ${ohe?.type ?? "OneHotEncoder"}${ohe?.handle_unknown ? " (handle_unknown=" + String(ohe.handle_unknown) + ", so an unseen category is encoded as all zeros)" : ""}.`,
      "There is no custom feature-engineering step in the saved pipeline: its only top-level stages are " + p.top_level_steps.map((x) => `“${x.name}” (${x.type})`).join(" and ") + "." ] },
    { title: "Random Forest Classification", node: m?.type === "RandomForestClassifier" ? "Random Forest" : (m?.type ?? "Model"), short: m ? `${m.n_estimators} trees` : "n/a", body: m ? [
      `${m.type} with ${m.n_estimators} decision trees (min_samples_leaf=${m.min_samples_leaf}, max_features=${m.max_features}, criterion=${m.criterion}, class_weight=${m.class_weight}, random_state=${m.random_state}).`,
      "Each tree votes on the customer and the forest combines the votes. class_weight=balanced makes the model pay more attention to the rarer churn class, which raises recall but means scores are not calibrated probabilities." ] : ["Model details unavailable."] },
    { title: "Probability Generation", node: "Probability", short: "predict_proba", body: [
      "The forest's probability for the churn class (0 to 1) is returned, rounded to 4 decimal places.",
      "This number is a risk score used to rank customers. It is a prediction, not observed churn." ] },
    { title: "Risk Classification", node: "Risk bands", short: "High / Medium / Low", body: [
      bands ? `Low below ${bands.medium}; Medium from ${bands.medium} up to ${bands.high}; High at ${bands.high} or above.` : "Risk bands unavailable.",
      "Bands are fixed in feature_schema.json and applied by the backend." ] },
    { title: "Final Prediction", node: "Final prediction", short: "Decision + drivers", body: [
      th !== null ? `A customer is predicted to churn when the probability is at least ${th} (${pct(th, 0)}).` : "Threshold unavailable.",
      "The response also includes what-if drivers: for each of the most influential fields, how much the probability would change if that field were swapped for the typical training value. These are sensitivities, not causes.",
      "NFS saves each successful prediction to your account. NFS never retrains the model: it only loads the saved pipeline." ] },
  ];
}

// 11 nodes laid out in a snake: 4 + 4 (right to left) + 3
const POS = [[120, 80], [360, 80], [600, 80], [840, 80], [840, 215], [600, 215], [360, 215], [120, 215], [120, 350], [360, 350], [600, 350]];

export default function Workflow() {
  const { schema } = useOutletContext<AppContext>();
  const [sel, setSel] = useState(0);
  const data = useAsync(async () => ({ p: await api<PipelineInfo>("/pipeline"), m: await api<Metrics>("/metrics").catch(() => null) }), []);

  if (data.loading) return <div className="space-y-4"><Sk h="h-64" /><Sk h="h-40" /></div>;
  if (data.error || !data.data) return <Card><Empty icon={AlertTriangle} title="Workflow unavailable" text={data.error || "The backend returned no pipeline description."} action={<Btn onClick={data.reload}>Try again</Btn>} /></Card>;

  const { p, m } = data.data;
  const missing = schema ? Object.entries(schema.numeric_features).filter(([, v]) => v.has_missing_in_training).map(([k]) => k) : [];
  const stages = buildStages(p, missing, p.input_features ?? 19);
  const cur = stages[sel];
  const onKey = (i: number) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(i); } };

  return (
    <div className="space-y-5">
      <Banner>This page is generated from the <b>actual saved pipeline</b> that the backend loaded, not from a hand-written diagram. Click a stage to read what it does.</Banner>

      <Card title="Prediction-time workflow" sub="What happens, live, every time you score a customer" right={<Tag>live</Tag>}>
        <div className="hidden md:block">
          <svg viewBox="0 0 960 430" className="w-full" role="group" aria-label="Prediction workflow diagram">
            <defs><linearGradient id="wfg" x1="0" x2="1"><stop offset="0" stopColor="#22D3EE" /><stop offset="1" stopColor="#8B5CF6" /></linearGradient></defs>
            {POS.slice(0, -1).map((a, i) => { const b = POS[i + 1]; const d = a[1] === b[1] ? `M${a[0] + (b[0] > a[0] ? 86 : -86)} ${a[1]} L${b[0] + (b[0] > a[0] ? -86 : 86)} ${b[1]}` : `M${a[0]} ${a[1] + 34} L${b[0]} ${b[1] - 34}`;
              return <path key={i} d={d} stroke="url(#wfg)" strokeWidth="2" fill="none" className="nfs-flow" opacity={i < sel ? 1 : 0.45} />; })}
            {stages.map((s, i) => { const [x, y] = POS[i]; const on = i === sel; return (
              <g key={s.title} role="button" tabIndex={0} aria-pressed={on} aria-label={`Stage ${i + 1}: ${s.title}`} onClick={() => setSel(i)} onKeyDown={onKey(i)} style={{ cursor: "pointer", outline: "none" }}>
                <rect x={x - 86} y={y - 34} width="172" height="68" rx="14" fill={on ? "rgba(59,130,246,.28)" : "rgba(18,33,74,.75)"} stroke={on ? "#60A5FA" : "rgba(148,163,184,.3)"} strokeWidth={on ? 2 : 1} />
                <circle cx={x - 62} cy={y} r="13" fill="url(#wfg)" /><text x={x - 62} y={y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">{i + 1}</text>
                <text x={x - 42} y={y - 3} fontSize="12" fontWeight="600" fill="#F1F5F9">{s.node}</text>
                <text x={x - 42} y={y + 14} fontSize="10" fill="#94A3B8">{s.short}</text>
              </g>); })}
          </svg>
        </div>
        <ol className="space-y-2 md:hidden">
          {stages.map((s, i) => (
            <li key={s.title}><button onClick={() => setSel(i)} className={cx("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm", i === sel ? "border-electric/60 bg-electric/15 text-white" : "border-white/10 bg-white/5 text-slate-300")}>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-nfs-gradient text-xs font-bold text-white">{i + 1}</span><span><span className="block font-medium">{s.title}</span><span className="text-xs text-slate-400">{s.short}</span></span></button></li>))}
        </ol>
        <div className="glow-border mt-4 rounded-xl border bg-navy-900/60 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-400">Stage {sel + 1} of {stages.length}</p>
          <h3 className="mt-1 text-lg font-semibold text-white">{cur.title}</h3>
          <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-300">{cur.body.map((t, i) => <p key={i}>{t}</p>)}</div>
          <div className="mt-4 flex gap-2"><Btn kind="ghost" className="!py-1.5" disabled={sel === 0} onClick={() => setSel(sel - 1)}>Previous</Btn><Btn kind="ghost" className="!py-1.5" disabled={sel === stages.length - 1} onClick={() => setSel(sel + 1)}>Next</Btn></div>
        </div>
      </Card>

      <Card title="Training-time workflow" sub="Done once, offline, in your training notebook (not run by this app)" right={<Tag>offline</Tag>}>
        {m ? (
          <ol className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
            <li className="rounded-xl bg-white/5 p-4"><b className="text-white">1. Split.</b> {m.dataset.rows_after_cleaning.toLocaleString()} cleaned customers were split into {m.dataset.train_rows.toLocaleString()} training and {m.dataset.test_rows.toLocaleString()} held-out test rows (test_size {m.settings.test_size ?? "n/a"}, random_state {m.settings.random_state}).</li>
            <li className="rounded-xl bg-white/5 p-4"><b className="text-white">2. Fit.</b> The imputers, scaler, encoder and Random Forest were fitted on the training rows only, using class_weight “{m.settings.class_weight}”.</li>
            <li className="rounded-xl bg-white/5 p-4"><b className="text-white">3. Select.</b> Model selection used {m.selection.method}, comparing candidates by {m.selection.metric}; “{m.selected_model}” was selected.</li>
            <li className="rounded-xl bg-white/5 p-4"><b className="text-white">4. Evaluate &amp; save.</b> The selected model was scored once on the untouched test rows (see Model Performance) and saved with its schema and metrics. This app only loads those saved files.</li>
          </ol>
        ) : <p className="text-sm text-slate-500">Training metadata is unavailable.</p>}
      </Card>
    </div>
  );
}
