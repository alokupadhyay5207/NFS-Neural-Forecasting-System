/** Data access through Supabase. Row Level Security guarantees each user only ever receives their own rows. */
import { supabase } from "./supabase";
import type { ActivityDay, AttributeBreakdowns, BatchRecord, BatchResultRow, ContractRow, Overview, PredictionRow, Profile, Risk, SegmentRow } from "./types";

const sb = () => { if (!supabase) throw new Error("Supabase is not configured."); return supabase; };
const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

export interface ListQuery { page: number; pageSize: number; search?: string; risk?: Risk | "All"; from?: string; to?: string; sort?: string; asc?: boolean }
export interface Page<T> { rows: T[]; total: number }

/** Escape characters that have meaning inside a PostgREST ilike pattern. */
const likeSafe = (s: string) => s.replace(/[%_,()*\\]/g, " ").trim();
const dayStart = (d: string) => new Date(d + "T00:00:00").toISOString();
const dayEnd = (d: string) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + 1); return x.toISOString(); };

function applyFilters<Q extends { ilike: Function; eq: Function; gte: Function; lt: Function }>(q: Q, f: ListQuery): Q {
  let r: any = q;
  if (f.search && likeSafe(f.search)) r = r.ilike("customer_id", "%" + likeSafe(f.search) + "%");
  if (f.risk && f.risk !== "All") r = r.eq("risk_level", f.risk);
  if (f.from) r = r.gte("created_at", dayStart(f.from));
  if (f.to) r = r.lt("created_at", dayEnd(f.to));
  return r;
}

export async function listPredictions(f: ListQuery): Promise<Page<PredictionRow>> {
  let q: any = sb().from("predictions").select("id,customer_id,features,churn_probability,risk_level,predicted_churn,threshold,model_name,drivers,created_at", { count: "exact" });
  q = applyFilters(q, f).order(f.sort ?? "created_at", { ascending: f.asc ?? false }).range(f.page * f.pageSize, f.page * f.pageSize + f.pageSize - 1);
  const { data, count, error } = await q; fail(error);
  return { rows: (data ?? []) as PredictionRow[], total: count ?? 0 };
}

export async function listBatches(f: { page: number; pageSize: number; search?: string; from?: string; to?: string }): Promise<Page<BatchRecord>> {
  let q: any = sb().from("prediction_batches").select("*", { count: "exact" });
  if (f.search && likeSafe(f.search)) q = q.ilike("filename", "%" + likeSafe(f.search) + "%");
  if (f.from) q = q.gte("created_at", dayStart(f.from));
  if (f.to) q = q.lt("created_at", dayEnd(f.to));
  q = q.order("created_at", { ascending: false }).range(f.page * f.pageSize, f.page * f.pageSize + f.pageSize - 1);
  const { data, count, error } = await q; fail(error);
  return { rows: (data ?? []) as BatchRecord[], total: count ?? 0 };
}

export async function listBatchResults(batchId: string, f: ListQuery): Promise<Page<BatchResultRow>> {
  let q: any = sb().from("batch_prediction_results").select("id,batch_id,row_number,customer_id,churn_probability,risk_level,predicted_churn,created_at", { count: "exact" }).eq("batch_id", batchId);
  q = applyFilters(q, { ...f, from: undefined, to: undefined }).order(f.sort ?? "row_number", { ascending: f.asc ?? true }).range(f.page * f.pageSize, f.page * f.pageSize + f.pageSize - 1);
  const { data, count, error } = await q; fail(error);
  return { rows: (data ?? []) as BatchResultRow[], total: count ?? 0 };
}

/** Fetch every row matching a query in pages of 1000 (Supabase's default cap), up to `cap` rows, for CSV export. */
export async function fetchAll<T>(page: (p: number, size: number) => Promise<Page<T>>, cap = 20000): Promise<T[]> {
  const out: T[] = []; const size = 1000;
  for (let p = 0; out.length < cap; p++) {
    const r = await page(p, size);
    out.push(...r.rows);
    if (r.rows.length < size) break;
  }
  return out;
}

export async function deletePrediction(id: string) { const { error } = await sb().from("predictions").delete().eq("id", id); fail(error); }
export async function deleteBatch(id: string) { const { error } = await sb().from("prediction_batches").delete().eq("id", id); fail(error); }
export async function deleteAllHistory(userId: string) {
  const a = await sb().from("prediction_batches").delete().eq("user_id", userId); fail(a.error);   // results cascade
  const b = await sb().from("predictions").delete().eq("user_id", userId); fail(b.error);
}

export async function getOverview(): Promise<Overview> { const { data, error } = await sb().rpc("analytics_overview"); fail(error); return data as Overview; }
export async function getActivity(days: number): Promise<ActivityDay[]> { const { data, error } = await sb().rpc("activity_by_day", { p_days: days }); fail(error); return (data ?? []) as ActivityDay[]; }
export async function getByContract(): Promise<ContractRow[]> { const { data, error } = await sb().rpc("breakdown_by_contract"); fail(error); return (data ?? []) as ContractRow[]; }
export async function getAttributeBreakdowns(): Promise<AttributeBreakdowns> { const { data, error } = await sb().rpc("attribute_breakdowns"); fail(error); return data as AttributeBreakdowns; }
export async function getSegments(): Promise<SegmentRow[]> { const { data, error } = await sb().rpc("segment_stats"); fail(error); return (data ?? []) as SegmentRow[]; }

export async function recentPredictions(n: number): Promise<PredictionRow[]> {
  const { data, error } = await sb().from("predictions").select("id,customer_id,features,churn_probability,risk_level,predicted_churn,threshold,model_name,drivers,created_at").order("created_at", { ascending: false }).limit(n);
  fail(error); return (data ?? []) as PredictionRow[];
}
export async function recentBatches(n: number): Promise<BatchRecord[]> {
  const { data, error } = await sb().from("prediction_batches").select("*").order("created_at", { ascending: false }).limit(n);
  fail(error); return (data ?? []) as BatchRecord[];
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await sb().from("profiles").select("*").eq("id", userId).maybeSingle(); fail(error); return (data as Profile) ?? null;
}
export async function updateProfile(userId: string, patch: Partial<Pick<Profile, "full_name" | "theme" | "toasts_enabled">>) {
  const { error } = await sb().from("profiles").update(patch).eq("id", userId); fail(error);
}
