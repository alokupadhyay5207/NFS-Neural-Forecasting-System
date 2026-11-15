// SMOKE-TEST STAND-IN for @supabase/supabase-js. Seeded, in-memory, deterministic. NOT the real client.
const uid = "user-1", DAY = 86400000, T0 = Date.UTC(2026, 10, 1, 12);
const USERS = { "ok@nfs.test": "Passw0rd!xyz" };
const bands = { medium: 0.35, high: 0.6 };
const lvl = (p) => (p >= bands.high ? "High" : p >= bands.medium ? "Medium" : "Low");
const prob = (contract, tenure, mc) => Math.max(0.02, Math.min(0.97, (contract === "Month-to-month" ? 0.55 : contract === "One year" ? 0.25 : 0.08) + (tenure < 12 ? 0.2 : tenure > 48 ? -0.1 : 0) + (mc > 85 ? 0.12 : 0)));
const mk = (i, contract, tenure, mc, ts) => ({ contract, tenure, monthly_charges: mc, tech_support: ts, p: Math.round(prob(contract, tenure, mc) * 10000) / 10000 });
const CONTRACTS = ["Month-to-month", "One year", "Two year"];
let db = { profiles: [{ id: uid, full_name: "Test User", email: "ok@nfs.test", theme: "dark", toasts_enabled: true, created_at: new Date(T0 - 30 * DAY).toISOString() }], predictions: [], prediction_batches: [], batch_prediction_results: [] };
for (let i = 0; i < 12; i++) {
  const c = mk(i, CONTRACTS[i % 3], (i * 7) % 70, 30 + ((i * 13) % 80), i % 3 === 0 ? "Yes" : i % 3 === 1 ? "No" : "No internet service");
  db.predictions.push({ id: "p" + i, user_id: uid, customer_id: i % 4 === 0 ? null : "C-" + i, features: { Contract: c.contract, tenure: c.tenure, MonthlyCharges: c.monthly_charges, TechSupport: c.tech_support }, churn_probability: c.p, risk_level: lvl(c.p), predicted_churn: c.p >= 0.5, threshold: 0.5, model_name: "Random Forest", drivers: [{ feature: "Contract", value: c.contract, effect_points: 12.5 }], created_at: new Date(T0 - (i % 5) * DAY).toISOString(), contract: c.contract, tenure: c.tenure, monthly_charges: c.monthly_charges, tech_support: c.tech_support });
}
[["batch-a.csv", 30], ["batch-b.csv", 18]].forEach(([name, n], bi) => {
  const rows = []; for (let r = 1; r <= n; r++) { const c = mk(r, CONTRACTS[(r + bi) % 3], (r * 5 + bi) % 72, 25 + ((r * 11) % 85), r % 2 ? "No" : "Yes"); rows.push({ id: `r${bi}-${r}`, batch_id: "b" + bi, user_id: uid, row_number: r, customer_id: "B" + bi + "-" + r, churn_probability: c.p, risk_level: lvl(c.p), predicted_churn: c.p >= 0.5, contract: c.contract, tenure: c.tenure, monthly_charges: c.monthly_charges, tech_support: c.tech_support, created_at: new Date(T0 - bi * DAY).toISOString() }); }
  const cnt = (l) => rows.filter((x) => x.risk_level === l).length;
  db.prediction_batches.push({ id: "b" + bi, user_id: uid, filename: name, total_rows: n + 2, successful_rows: n, failed_rows: 2, high_count: cnt("High"), medium_count: cnt("Medium"), low_count: cnt("Low"), processing_ms: 120 + bi, model_name: "Random Forest", created_at: new Date(T0 - bi * DAY).toISOString() });
  db.batch_prediction_results.push(...rows);
});
const all = () => [...db.predictions, ...db.batch_prediction_results];
const avg = (a) => (a.length ? Math.round((a.reduce((s, x) => s + Number(x.churn_probability), 0) / a.length) * 10000) / 10000 : null);
const group = (rows, keyFn, ordFn) => { const m = new Map(); rows.forEach((r) => { const k = keyFn(r); if (k == null) return; (m.get(k) || m.set(k, []).get(k)).push(r); }); return [...m].map(([label, rs]) => ({ ord: ordFn ? ordFn(rs[0]) : undefined, label, contract: label, predictions: rs.length, high: rs.filter((x) => x.risk_level === "High").length, avg_probability: avg(rs) })).sort((a, b) => (ordFn ? a.ord - b.ord : String(a.label).localeCompare(String(b.label)))); };
const RPC = {
  analytics_overview: () => { const a = all(); const ids = new Set(a.filter((x) => x.customer_id).map((x) => x.customer_id)); const ts = a.map((x) => x.created_at).sort();
    return { total_predictions: a.length, single_predictions: db.predictions.length, batch_predictions: db.batch_prediction_results.length, customers_analysed: ids.size + a.filter((x) => !x.customer_id).length, predicted_churn: a.filter((x) => x.predicted_churn).length, high: a.filter((x) => x.risk_level === "High").length, medium: a.filter((x) => x.risk_level === "Medium").length, low: a.filter((x) => x.risk_level === "Low").length, avg_probability: avg(a), first_prediction_at: ts[0] || null, last_prediction_at: ts[ts.length - 1] || null, batches: db.prediction_batches.length }; },
  activity_by_day: () => { const m = new Map(); all().forEach((r) => { const d = r.created_at.slice(0, 10); (m.get(d) || m.set(d, []).get(d)).push(r); }); return [...m].sort().map(([d, rs]) => ({ activity_day: d, prediction_count: rs.length, high_count: rs.filter((x) => x.risk_level === "High").length, churn_count: rs.filter((x) => x.predicted_churn).length, avg_probability: avg(rs) })); },
  breakdown_by_contract: () => group(all().filter((r) => r.contract), (r) => r.contract),
  segment_stats: () => { const defs = { new_month_to_month: (r) => r.contract === "Month-to-month" && r.tenure < 12, high_bill_no_tech_support: (r) => r.monthly_charges > 85 && r.tech_support === "No", loyal_long_term: (r) => r.tenure >= 36 && r.contract !== "Month-to-month" };
    return Object.entries(defs).map(([key, f]) => { const rs = all().filter(f); const n = (l) => rs.filter((x) => x.risk_level === l).length; return { key, size: rs.length, high: n("High"), medium: n("Medium"), low: n("Low"), avg_probability: avg(rs), avg_tenure: rs.length ? Math.round(rs.reduce((s, x) => s + x.tenure, 0) / rs.length * 10) / 10 : null, avg_monthly_charges: rs.length ? Math.round(rs.reduce((s, x) => s + x.monthly_charges, 0) / rs.length * 100) / 100 : null }; }); },
  attribute_breakdowns: () => ({ tenure_band: group(all(), (r) => (r.tenure < 12 ? "0-11 months" : r.tenure < 24 ? "12-23 months" : r.tenure < 48 ? "24-47 months" : "48+ months"), (r) => (r.tenure < 12 ? 1 : r.tenure < 24 ? 2 : r.tenure < 48 ? 3 : 4)),
    monthly_charge_band: group(all(), (r) => (r.monthly_charges < 35 ? "Under $35" : r.monthly_charges < 65 ? "$35 to $64.99" : r.monthly_charges <= 85 ? "$65 to $85" : "Over $85"), (r) => (r.monthly_charges < 35 ? 1 : r.monthly_charges < 65 ? 2 : r.monthly_charges <= 85 ? 3 : 4)), tech_support: group(all(), (r) => r.tech_support) }),
};
function qb(table) {
  const st = { filters: [], order: null, range: null, limit: null, count: false, del: false, upd: null, single: false };
  const api = {
    select(_c, o) { st.count = !!(o && o.count); return api; }, eq(c, v) { st.filters.push((r) => r[c] === v); return api; },
    ilike(c, p) { const n = p.replace(/%/g, "").toLowerCase(); st.filters.push((r) => String(r[c] ?? "").toLowerCase().includes(n)); return api; },
    gte(c, v) { st.filters.push((r) => r[c] >= v); return api; }, lt(c, v) { st.filters.push((r) => r[c] < v); return api; },
    order(c, o) { st.order = { c, asc: !(o && o.ascending === false) }; return api; }, range(a, b) { st.range = [a, b]; return api; }, limit(n) { st.limit = n; return api; },
    delete() { st.del = true; return api; }, update(p) { st.upd = p; return api; }, maybeSingle() { st.single = true; return api; },
    then(res, rej) { return Promise.resolve().then(run).then(res, rej); },
  };
  function run() {
    let rows = db[table].filter((r) => st.filters.every((f) => f(r)));
    if (st.del) { const ids = new Set(rows.map((r) => r.id)); db[table] = db[table].filter((r) => !ids.has(r.id)); if (table === "prediction_batches") db.batch_prediction_results = db.batch_prediction_results.filter((r) => !ids.has(r.batch_id)); return { data: null, error: null }; }
    if (st.upd) { rows.forEach((r) => Object.assign(r, st.upd)); return { data: null, error: null }; }
    if (st.order) rows = [...rows].sort((a, b) => (a[st.order.c] > b[st.order.c] ? 1 : a[st.order.c] < b[st.order.c] ? -1 : 0) * (st.order.asc ? 1 : -1));
    const count = rows.length;
    if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1);
    if (st.limit != null) rows = rows.slice(0, st.limit);
    return { data: st.single ? rows[0] ?? null : rows, count: st.count ? count : null, error: null };
  }
  return api;
}
export function createClient(url, key, opts) {
  let session = null; const cbs = new Set(); const emit = (e) => cbs.forEach((f) => f(e, session));
  const user = (email) => ({ id: uid, email, created_at: new Date(T0 - 30 * DAY).toISOString() });
  window.__sb = { calls: [], get session() { return session; }, db: () => db, storageProbe: opts && opts.auth && opts.auth.storage };
  return {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: (cb) => { cbs.add(cb); setTimeout(() => cb("INITIAL_SESSION", session), 0); return { data: { subscription: { unsubscribe: () => cbs.delete(cb) } } }; },
      signInWithPassword: async ({ email, password }) => { window.__sb.calls.push(["signIn", email]);
        if (email === "unverified@nfs.test") return { error: new Error("Email not confirmed") };
        if (USERS[email] !== password) return { error: new Error("Invalid login credentials") };
        session = { access_token: "tok." + email, user: user(email) }; emit("SIGNED_IN"); return { error: null }; },
      signUp: async (a) => { window.__sb.calls.push(["signUp", a.email, a.options && a.options.data]); if (USERS[a.email]) return { data: { session: null }, error: new Error("User already registered") }; return { data: { session: null }, error: null }; },
      signInWithOAuth: async () => ({ error: null }), resend: async (a) => { window.__sb.calls.push(["resend", a.email]); return { error: null }; },
      resetPasswordForEmail: async (e) => { window.__sb.calls.push(["reset", e]); return { error: null }; },
      updateUser: async (a) => { window.__sb.calls.push(["updateUser", Object.keys(a)]); return { error: null }; },
      signOut: async (o) => { window.__sb.calls.push(["signOut", o && o.scope]); session = null; emit("SIGNED_OUT"); return { error: null }; },
    },
    from: (t) => qb(t),
    rpc: async (fn, args) => { if (!RPC[fn]) return { data: null, error: { message: "unknown rpc " + fn } }; return { data: RPC[fn](args), error: null }; },
  };
}
