export type Risk = "High" | "Medium" | "Low";

export interface Schema {
  threshold: number;
  risk_bands: { medium: number; high: number };
  feature_order: string[];
  numeric_features: Record<string, { min: number; max: number; median: number; has_missing_in_training: boolean }>;
  categorical_features: Record<string, string[]>;
}

export interface ModelInfo {
  name: string;
  trained_at_utc?: string | null;
  scikit_learn_saved?: string | null;
  scikit_learn_running: string;
  class_weight?: string | null;
}

export interface Driver { feature: string; value: unknown; effect_points: number }

export interface PredictionResponse {
  churn_probability: number;
  predicted_churn: boolean;
  risk_level: Risk;
  threshold: number;
  risk_bands: { medium: number; high: number };
  warnings: string[];
  drivers: Driver[];
  model: ModelInfo;
}

export interface BatchRowResult {
  row: number;
  id?: string | null;
  status: "ok" | "error";
  churn_probability?: number | null;
  predicted_churn?: boolean | null;
  risk_level?: Risk | null;
  warnings: string[];
  errors: string[];
}

export interface BatchResponse {
  count: number;
  scored: number;
  failed: number;
  summary: Record<Risk, number>;
  results: BatchRowResult[];
  model: ModelInfo;
}

export interface Health {
  status: string;
  model_loaded: boolean;
  error?: string | null;
  version_warning?: string | null;
}

export interface MetricSet { accuracy: number; precision: number; recall: number; f1: number; roc_auc: number; tn?: number; fp?: number; fn?: number; tp?: number }

export interface Metrics {
  created_at_utc: string;
  selected_model: string;
  selection: { metric: string; method: string };
  dataset: { rows_after_cleaning: number; train_rows: number; test_rows: number; churn_rate_overall: number };
  settings: { random_state: number; threshold: number; class_weight: string; cv_folds: number; test_size?: number };
  cross_validation_mean: Record<string, MetricSet>;
  cross_validation_std: Record<string, MetricSet>;
  test_metrics: Record<string, MetricSet & { tn: number; fp: number; fn: number; tp: number }>;
  environment: { python: string; scikit_learn: string; pandas: string };
}

export type ConnState =
  | { state: "checking" }
  | { state: "ok"; health: Health }
  | { state: "no-model"; error: string }
  | { state: "offline"; message: string };

export interface SavedInfo { saved: boolean; save_error?: string | null; created_at: string }
export interface V1PredictionResponse extends PredictionResponse, SavedInfo { prediction_id?: string | null }
export interface V1BatchResponse extends BatchResponse, SavedInfo { batch_id?: string | null; processing_ms: number }

export interface Overview {
  total_predictions: number; single_predictions: number; batch_predictions: number; customers_analysed: number;
  predicted_churn: number; high: number; medium: number; low: number; avg_probability: number | null;
  first_prediction_at: string | null; last_prediction_at: string | null; batches: number;
}
export interface ActivityDay { activity_day: string; prediction_count: number; high_count: number; churn_count: number; avg_probability: number | null }
export interface ContractRow { contract: string; predictions: number; high: number; avg_probability: number | null }
export interface SegmentRow { key: string; size: number; high: number; medium: number; low: number; avg_probability: number | null; avg_tenure: number | null; avg_monthly_charges: number | null }

export interface PredictionRow {
  id: string; customer_id: string | null; features: Record<string, unknown>; churn_probability: number; risk_level: Risk;
  predicted_churn: boolean; threshold: number; model_name: string; drivers: Driver[] | null; created_at: string;
}
export interface BatchRecord {
  id: string; filename: string; total_rows: number; successful_rows: number; failed_rows: number;
  high_count: number; medium_count: number; low_count: number; processing_ms: number | null; model_name: string | null; created_at: string;
}
export interface BatchResultRow {
  id: string; batch_id: string; row_number: number; customer_id: string | null; churn_probability: number; risk_level: Risk; predicted_churn: boolean; created_at: string;
}
export interface Profile { id: string; full_name: string | null; email: string | null; theme: "dark" | "light"; toasts_enabled: boolean; created_at: string }

export interface PipelineStep { name: string; type: string; [k: string]: unknown }
export interface PipelineInfo {
  top_level_steps: { name: string; type: string }[];
  preprocessing: { branches: { name: string; columns: string[]; steps: PipelineStep[] }[]; remainder: string | null };
  model: { type: string; n_estimators?: number; max_depth?: number | null; min_samples_leaf?: number; min_samples_split?: number; max_features?: string; criterion?: string; class_weight?: string; random_state?: number } | null;
  input_features: number | null; threshold: number | null; risk_bands: { medium: number; high: number } | null;
  feature_importance: { feature: string; importance: number; type: "numeric" | "categorical" }[] | null;
}

export interface BreakdownRow { ord?: number; label: string; predictions: number; high: number; avg_probability: number | null }
export interface AttributeBreakdowns { tenure_band: BreakdownRow[]; monthly_charge_band: BreakdownRow[]; tech_support: BreakdownRow[] }

export interface ReportSection { heading: string; paragraphs: string[]; table: { columns: string[]; rows: (string | number | null)[][] } | null }
export interface Report { kind: string; title: string; generated_at: string; sections: ReportSection[]; ai_summary: string | null; disclaimer: string }
