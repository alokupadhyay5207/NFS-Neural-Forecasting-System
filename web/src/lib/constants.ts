/** Form constants ported from the original single-file page (field groups, labels, example customers). */
export const ADDONS = ["OnlineSecurity", "OnlineBackup", "DeviceProtection", "TechSupport", "StreamingTV", "StreamingMovies"];

export const GROUPS: [string, string[]][] = [
  ["Account & billing", ["tenure", "MonthlyCharges", "TotalCharges", "Contract", "PaperlessBilling", "PaymentMethod"]],
  ["Phone & internet services", ["PhoneService", "MultipleLines", "InternetService", ...ADDONS]],
  ["Customer profile", ["gender", "SeniorCitizen", "Partner", "Dependents"]],
];

const LABELS: Record<string, string> = {
  tenure: "Tenure (months)", MonthlyCharges: "Monthly charges ($)", TotalCharges: "Total charges ($) – optional",
  SeniorCitizen: "Senior citizen", PaperlessBilling: "Paperless billing", PaymentMethod: "Payment method",
  PhoneService: "Phone service", MultipleLines: "Multiple lines", InternetService: "Internet service",
  OnlineSecurity: "Online security", OnlineBackup: "Online backup", DeviceProtection: "Device protection",
  TechSupport: "Tech support", StreamingTV: "Streaming TV", StreamingMovies: "Streaming movies",
  Partner: "Has partner", Dependents: "Has dependents", Contract: "Contract", gender: "Gender",
};
export const lab = (f: string) => LABELS[f] || f;

export type FormValues = Record<string, string>;

export const TYPICAL: FormValues = {
  gender: "Female", SeniorCitizen: "0", Partner: "No", Dependents: "No", PhoneService: "Yes", MultipleLines: "No",
  InternetService: "Fiber optic", OnlineSecurity: "No", OnlineBackup: "No", DeviceProtection: "No", TechSupport: "No",
  StreamingTV: "No", StreamingMovies: "No", Contract: "Month-to-month", PaperlessBilling: "Yes", PaymentMethod: "Electronic check",
};
export const EX_RISKY: FormValues = { ...TYPICAL, tenure: "3", MonthlyCharges: "95.5", TotalCharges: "286.5", MultipleLines: "Yes", StreamingTV: "Yes", StreamingMovies: "Yes" };
export const EX_LOYAL: FormValues = {
  gender: "Male", SeniorCitizen: "0", Partner: "Yes", Dependents: "Yes", PhoneService: "Yes", MultipleLines: "No",
  InternetService: "DSL", OnlineSecurity: "Yes", OnlineBackup: "Yes", DeviceProtection: "Yes", TechSupport: "Yes",
  StreamingTV: "No", StreamingMovies: "No", Contract: "Two year", PaperlessBilling: "No",
  PaymentMethod: "Bank transfer (automatic)", tenure: "60", MonthlyCharges: "55", TotalCharges: "3300",
};
export const BLANK: FormValues = { ...TYPICAL, tenure: "", MonthlyCharges: "", TotalCharges: "" };

/** Batch sample CSV (hand-written examples, one deliberately invalid row), same as the original page. */
export const COLS = ["customerID", "SeniorCitizen", "tenure", "MonthlyCharges", "TotalCharges", "gender", "Partner", "Dependents",
  "PhoneService", "MultipleLines", "InternetService", ...ADDONS, "Contract", "PaperlessBilling", "PaymentMethod"];
const NOINET: FormValues = {
  InternetService: "No", OnlineSecurity: "No internet service", OnlineBackup: "No internet service", DeviceProtection: "No internet service",
  TechSupport: "No internet service", StreamingTV: "No internet service", StreamingMovies: "No internet service",
};
const SAMPLE_ROWS: FormValues[] = [
  { customerID: "S-1", ...EX_RISKY }, { customerID: "S-2", ...EX_LOYAL },
  { customerID: "S-3", ...TYPICAL, tenure: "14", MonthlyCharges: "78.9", TotalCharges: "1100", Contract: "One year", PaymentMethod: "Credit card (automatic)", TechSupport: "Yes" },
  { customerID: "S-4", ...TYPICAL, ...NOINET, tenure: "30", MonthlyCharges: "20.25", TotalCharges: "600", Contract: "One year", PaperlessBilling: "No", PaymentMethod: "Mailed check" },
  { customerID: "S-5", ...TYPICAL, tenure: "0", MonthlyCharges: "70", TotalCharges: "" },
  { customerID: "S-6 (deliberately invalid)", ...TYPICAL, tenure: "5", MonthlyCharges: "60", TotalCharges: "300", Contract: "Weekly" },
];
export const SAMPLE_CSV = [COLS.join(","), ...SAMPLE_ROWS.map((r) => COLS.map((c) => r[c] ?? "").join(","))].join("\n");
