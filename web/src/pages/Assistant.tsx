
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Bot,
  RefreshCw,
  Send,
  Sparkles,
  User,
  Trash2,
  Database,
  TrendingUp,
} from "lucide-react";

import {
  getOverview,
  getSegments,
  getByContract,
  getAttributeBreakdowns,
  recentPredictions,
} from "../lib/db";

import type {
  Overview,
  SegmentRow,
  ContractRow,
  AttributeBreakdowns,
  PredictionRow,
} from "../lib/types";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

interface ChatData {
  overview: Overview;
  segments: SegmentRow[];
  contracts: ContractRow[];
  breakdowns: AttributeBreakdowns;
  predictions: PredictionRow[];
}

const SUGGESTIONS = [
  "How many high-risk predictions do I have?",
  "Summarize my latest prediction results.",
  "Which customer segment has the highest churn risk?",
  "Which contract type has the highest churn risk?",
  "Analyze my customer tenure patterns.",
  "Suggest responsible customer retention strategies.",
  "Explain my latest prediction.",
];

function percentage(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "Not available";
  return `${(value <= 1 ? value * 100 : value).toFixed(1)}%`;
}

function number(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to load analytics.";
}

function generateReply(question: string, data: ChatData, selectedId: string): string {
  const q = question.toLowerCase();
  const { overview, segments, contracts, breakdowns, predictions } = data;

  const selected = predictions.find((p) => p.id === selectedId);

  if (
    q.includes("latest prediction") ||
    q.includes("recent prediction") ||
    q.includes("last prediction")
  ) {
    const latest = predictions[0];

    if (!latest) return "There are no saved predictions in your account yet.";

    return [
      "Here is your latest saved prediction:",
      "",
      `Customer: ${latest.customer_id || "Customer ID not available"}`,
      `Risk level: ${latest.risk_level}`,
      `Churn probability: ${percentage(latest.churn_probability)}`,
      `Predicted churn: ${latest.predicted_churn ? "Yes" : "No"}`,
      `Model: ${latest.model_name}`,
      `Date: ${new Date(latest.created_at).toLocaleString()}`,
      "",
      "This is the saved output of your original prediction model.",
    ].join("\n");
  }

  if (
    q.includes("explain my latest") ||
    q.includes("explain attached") ||
    q.includes("this prediction")
  ) {
    const prediction = selected || predictions[0];

    if (!prediction) return "No saved prediction is available to explain.";

    const drivers = prediction.drivers ?? [];

    return [
      `Prediction explanation for ${prediction.customer_id || "selected customer"}:`,
      "",
      `Risk: ${prediction.risk_level}`,
      `Churn probability: ${percentage(prediction.churn_probability)}`,
      `Predicted churn: ${prediction.predicted_churn ? "Yes" : "No"}`,
      `Decision threshold: ${percentage(prediction.threshold)}`,
      "",
      "Recorded prediction drivers:",
      ...(drivers.length
        ? drivers.slice(0, 5).map(
            (d) => `• ${d.feature}: ${d.effect_points > 0 ? "+" : ""}${d.effect_points.toFixed(2)} points`
          )
        : ["No driver details were saved for this prediction."]),
      "",
      "Driver values describe model sensitivity, not proof of causation.",
    ].join("\n");
  }

  if (
    q.includes("high-risk") ||
    q.includes("high risk") ||
    q.includes("risk count")
  ) {
    return [
      "Your saved prediction overview:",
      "",
      `High risk: ${number(overview.high)}`,
      `Medium risk: ${number(overview.medium)}`,
      `Low risk: ${number(overview.low)}`,
      `Total predictions: ${number(overview.total_predictions)}`,
      "",
      "These are saved prediction counts, not necessarily unique customers.",
    ].join("\n");
  }

  if (
    q.includes("segment") ||
    q.includes("highest churn") ||
    q.includes("customer group")
  ) {
    if (!segments.length) return "No customer segment data is available yet.";

    const ranked = [...segments].sort(
      (a, b) => (b.avg_probability ?? -1) - (a.avg_probability ?? -1)
    );

    return [
      "Customer segments ranked by average predicted churn probability:",
      "",
      ...ranked.slice(0, 5).map(
        (s, i) =>
          `${i + 1}. ${s.key}\n   Customers/predictions: ${number(s.size)} · Average probability: ${percentage(s.avg_probability)} · High risk: ${number(s.high)}`
      ),
      "",
      "These rankings describe your saved prediction data. They do not establish why customers churn.",
    ].join("\n");
  }

  if (
    q.includes("contract") ||
    q.includes("monthly") ||
    q.includes("month-to-month")
  ) {
    if (!contracts.length) return "No contract breakdown is available yet.";

    const ranked = [...contracts].sort(
      (a, b) => (b.avg_probability ?? -1) - (a.avg_probability ?? -1)
    );

    return [
      "Contract breakdown:",
      "",
      ...ranked.map(
        (c) =>
          `${c.contract}: ${number(c.predictions)} predictions · High risk: ${number(c.high)} · Average churn probability: ${percentage(c.avg_probability)}`
      ),
      "",
      "Compare these groups before deciding which customers need additional support.",
    ].join("\n");
  }

  if (
    q.includes("tenure") ||
    q.includes("monthly charge") ||
    q.includes("technical support") ||
    q.includes("tech support")
  ) {
    const rows = q.includes("tenure")
      ? breakdowns.tenure_band
      : q.includes("charge")
        ? breakdowns.monthly_charge_band
        : breakdowns.tech_support;

    const heading = q.includes("tenure")
      ? "Customer tenure"
      : q.includes("charge")
        ? "Monthly charges"
        : "Technical support";

    if (!rows?.length) return `No ${heading.toLowerCase()} breakdown is available.`;

    return [
      `${heading} breakdown:`,
      "",
      ...rows.map(
        (r) =>
          `${r.label}: ${number(r.predictions)} predictions · High risk: ${number(r.high)} · Average probability: ${percentage(r.avg_probability)}`
      ),
      "",
      "This is an aggregate view of saved predictions.",
    ].join("\n");
  }

  if (
    q.includes("retention") ||
    q.includes("retain") ||
    q.includes("recommend") ||
    q.includes("suggest")
  ) {
    const highRiskSegments = [...segments]
      .filter((s) => s.size > 0)
      .sort((a, b) => (b.avg_probability ?? -1) - (a.avg_probability ?? -1))
      .slice(0, 3);

    return [
      "Responsible retention actions based on your saved analytics:",
      "",
      "1. Prioritize reviewing customers classified as High risk.",
      "2. Examine high-risk segments and compare their tenure, charges and support patterns.",
      "3. Offer customers clear plan information and suitable alternatives.",
      "4. Review unresolved support issues and service experience.",
      "5. Track future prediction outcomes to evaluate whether interventions help.",
      "",
      ...(highRiskSegments.length
        ? [
            "Segments worth reviewing:",
            ...highRiskSegments.map(
              (s) => `• ${s.key}: ${percentage(s.avg_probability)} average predicted probability`
            ),
          ]
        : []),
      "",
      "These are general suggestions, not guaranteed churn-reduction outcomes. Use customer consent and fair, non-discriminatory practices.",
    ].join("\n");
  }

  if (
    q.includes("performance") ||
    q.includes("accuracy") ||
    q.includes("model limitation") ||
    q.includes("model metrics")
  ) {
    return [
      "NFS uses your saved Random Forest prediction pipeline.",
      "",
      `Model name in latest saved predictions: ${predictions[0]?.model_name || "No saved model information"}`,
      `Total saved predictions: ${number(overview.total_predictions)}`,
      "",
      "For measured accuracy, precision, recall, F1-score and ROC-AUC, open the Model Performance page. I will not invent performance figures.",
      "",
      "Remember: historical test metrics do not guarantee future real-world prediction accuracy.",
    ].join("\n");
  }

  if (
    q.includes("summary") ||
    q.includes("overview") ||
    q.includes("analytics") ||
    q.includes("dashboard")
  ) {
    return [
      "Your NFS analytics summary:",
      "",
      `Total predictions: ${number(overview.total_predictions)}`,
      `Customers analysed: ${number(overview.customers_analysed)}`,
      `Predicted churn: ${number(overview.predicted_churn)}`,
      `High risk: ${number(overview.high)}`,
      `Medium risk: ${number(overview.medium)}`,
      `Low risk: ${number(overview.low)}`,
      `Average churn probability: ${percentage(overview.avg_probability)}`,
      `Saved batches: ${number(overview.batches)}`,
      "",
      "All figures come from your account's saved analytics.",
    ].join("\n");
  }

  return [
    "I can analyse the real prediction and analytics data saved in your NFS account.",
    "",
    "Try asking me:",
    "• How many high-risk predictions do I have?",
    "• Which customer segment has the highest churn risk?",
    "• Show my latest prediction.",
    "• Analyse customer tenure patterns.",
    "• Suggest retention strategies.",
    "• Explain my model performance.",
    "",
    "I use rule-based analysis, not a paid language-model API. I will not invent missing data.",
  ].join("\n");
}

export default function Assistant() {
  const [data, setData] = useState<ChatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Welcome to NFS Intelligence. I can analyse your saved predictions, customer segments, risk distribution and analytics. Ask me a question to get started.",
    },
  ]);
  const [input, setInput] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [overview, segments, contracts, breakdowns, predictions] =
        await Promise.all([
          getOverview(),
          getSegments(),
          getByContract(),
          getAttributeBreakdowns(),
          recentPredictions(50),
        ]);

      setData({ overview, segments, contracts, breakdowns, predictions });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  function sendMessage(question: string) {
    const q = question.trim();
    if (!q || !data || busy) return;

    setMessages((previous) => [
      ...previous,
      { role: "user", content: q },
    ]);
    setInput("");
    setBusy(true);

    // Run local, deterministic analytics against the authenticated user's data.
    window.setTimeout(() => {
      const reply = generateReply(q, data, selectedId);
      setMessages((previous) => [
        ...previous,
        { role: "assistant", content: reply },
      ]);
      setBusy(false);
    }, 250);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(input);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl bg-cyan-500/10 p-2 text-cyan-400">
              <Sparkles size={21} />
            </div>
            <h1 className="text-2xl font-bold text-white">
              NFS Intelligence
            </h1>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Your rule-based customer analytics assistant
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw size={15} />
            Refresh data
          </button>
          <button
            onClick={() =>
              setMessages([
                {
                  role: "assistant",
                  content: "Chat cleared. Ask me about your NFS analytics.",
                },
              ])
            }
            className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            <Trash2 size={15} />
            Clear chat
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <Database className="mb-2 text-cyan-400" size={19} />
          <p className="text-xs text-slate-400">Saved predictions</p>
          <p className="mt-1 text-xl font-semibold text-white">
            {loading ? "..." : number(data?.overview.total_predictions)}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <TrendingUp className="mb-2 text-violet-400" size={19} />
          <p className="text-xs text-slate-400">Predicted churn</p>
          <p className="mt-1 text-xl font-semibold text-white">
            {loading ? "..." : number(data?.overview.predicted_churn)}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <AlertTriangle className="mb-2 text-amber-400" size={19} />
          <p className="text-xs text-slate-400">High-risk predictions</p>
          <p className="mt-1 text-xl font-semibold text-white">
            {loading ? "..." : number(data?.overview.high)}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          Could not load your analytics: {error}
          <button
            onClick={() => void loadData()}
            className="ml-2 underline"
          >
            Try again
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40">
        <div className="flex items-center gap-3 border-b border-white/10 p-4">
          <div className="rounded-xl bg-cyan-500/10 p-2 text-cyan-400">
            <Bot size={22} />
          </div>
          <div>
            <p className="font-semibold text-white">Analytics Chat</p>
            <p className="text-xs text-emerald-400">
              {loading ? "Loading account data..." : error ? "Data unavailable" : "Connected to your saved analytics"}
            </p>
          </div>
        </div>

        <div className="max-h-[480px] min-h-[320px] space-y-4 overflow-y-auto p-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className={`h-9 w-9 shrink-0 rounded-xl p-2 ${
                  message.role === "user"
                    ? "bg-violet-500/15 text-violet-300"
                    : "bg-cyan-500/15 text-cyan-300"
                }`}
              >
                {message.role === "user" ? <User size={19} /> : <Bot size={19} />}
              </div>

              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "bg-violet-500/15 text-slate-100"
                    : "border border-white/10 bg-white/[0.04] text-slate-200"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Bot size={18} />
              Analysing your saved data...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-white/10 p-4">
          <label className="mb-2 block text-xs text-slate-400">
            Optional: attach a saved prediction
          </label>
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="mb-3 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
          >
            <option value="">Latest prediction (default)</option>
            {(data?.predictions ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.customer_id || "No customer ID"} · {percentage(p.churn_probability)} · {p.risk_level}
              </option>
            ))}
          </select>

          <form onSubmit={submit} className="flex gap-2">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={loading || !!error || !data || busy}
              placeholder="Ask about your customer analytics..."
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading || !!error || !data || busy}
              className="rounded-xl bg-cyan-500 px-4 py-3 text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send message"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-slate-300">
          Suggested questions
        </p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => sendMessage(suggestion)}
              disabled={loading || !!error || !data || busy}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-left text-xs text-slate-300 transition hover:border-cyan-500/40 hover:bg-cyan-500/10 disabled:opacity-40"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs leading-5 text-slate-500">
        This assistant uses deterministic, rule-based responses based on your
        account's saved Supabase analytics. It does not use a paid LLM, does
        not generate new ML predictions, and does not claim that correlations
        establish causation.
      </p>
    </div>
  );
}
