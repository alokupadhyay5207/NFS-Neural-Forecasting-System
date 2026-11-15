const { chromium } = require("/home/claude/.npm-global/lib/node_modules/playwright");
const fs = require("fs");
const D = (n) => fs.readFileSync("/tmp/smoke/data/" + n + ".json", "utf8");
const results = []; const fails = [];
const ok = (name, cond, extra = "") => { results.push([name, !!cond]); if (!cond) fails.push(name + (extra ? " :: " + extra : "")); console.log((cond ? "PASS " : "FAIL ") + name + (!cond && extra ? "  [" + extra + "]" : "")); };
const apiLog = []; let aiConfigured = false;

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  await ctx.route("http://nfs.test/**", async (route) => {
    const req = route.request(); const u = new URL(req.url()); const p = u.pathname; const json = (b, s = 200) => route.fulfill({ status: s, contentType: "application/json", body: typeof b === "string" ? b : JSON.stringify(b) });
    if (p === "/bundle.js") return route.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync("/tmp/smoke/dist/bundle.js") });
    if (p.startsWith("/api/")) {
      const body = req.postData() ? JSON.parse(req.postData()) : null; apiLog.push({ p, method: req.method(), auth: req.headers()["authorization"], body });
      if (p === "/api/health") return json({ status: "ok", model_loaded: true, error: null, version_warning: null, model: { name: "Random Forest" } });
      if (p === "/api/schema") return json(D("schema")); if (p === "/api/metrics") return json(D("metrics")); if (p === "/api/pipeline") return json(D("pipeline"));
      if (p === "/api/v1/assistant/status") return json({ configured: aiConfigured, provider: aiConfigured ? "anthropic" : null, model: aiConfigured ? "test-model" : null });
      if (p === "/api/v1/predict") return json({ churn_probability: 0.7312, predicted_churn: true, risk_level: "High", threshold: 0.5, risk_bands: { medium: 0.35, high: 0.6 }, warnings: [], drivers: [{ feature: "Contract", value: "Month-to-month", effect_points: 14.2 }], model: { name: "Random Forest", class_weight: "balanced", scikit_learn_running: "1.6.1" }, prediction_id: "new-1", saved: true, save_error: null, created_at: new Date().toISOString() });
      if (p === "/api/v1/predict/batch") { const rows = body.customers; const res = rows.map((c, i) => c.Contract === "Weekly" ? { row: i + 1, id: c.customerID, status: "error", errors: ["Contract: invalid"], warnings: [] } : { row: i + 1, id: c.customerID, status: "ok", churn_probability: 0.4, predicted_churn: false, risk_level: "Medium", warnings: [], errors: [] });
        const sc = res.filter((r) => r.status === "ok").length; return json({ count: rows.length, scored: sc, failed: rows.length - sc, summary: { High: 0, Medium: sc, Low: 0 }, results: res, model: { name: "Random Forest" }, batch_id: "nb-1", saved: true, save_error: null, processing_ms: 42, created_at: new Date().toISOString() }); }
      if (p === "/api/v1/assistant/chat") return json({ reply: "You have 60 saved predictions. These are model predictions, not confirmed churn.", provider: "anthropic", model: "test-model", used_context: ["overview", "model_metrics"] });
      if (p === "/api/v1/reports/generate") return json({ kind: body.kind, title: "Customer segment report", generated_at: new Date().toISOString(), sections: [{ heading: "Customer segments", paragraphs: ["Segments can overlap."], table: { columns: ["Segment", "Size"], rows: [["New month-to-month customers", 7]] } }], ai_summary: body.include_ai_summary ? "AI narrative text" : null, disclaimer: "Risk levels are model predictions." });
      return json({ detail: "not found" }, 404);
    }
    return route.fulfill({ status: 200, contentType: "text/html", body: '<!doctype html><html><head><title>t</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>' });
  });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + String(e).slice(0, 300)));
  const text = async () => (await page.locator("body").innerText());
  const has = async (s) => (await text()).includes(s);
  const waitText = async (s, t = 4000) => { try { await page.waitForFunction((x) => document.body.innerText.includes(x), s, { timeout: t }); return true; } catch { return false; } };
  const nav = async (label) => { await page.locator("nav[aria-label=Main] >> text=" + label).first().click(); };
  const sb = (fn) => page.evaluate(fn);

  // ---------------- auth
  await page.goto("http://nfs.test/history");
  ok("protected route redirects anonymous user to /login", await waitText("Welcome back") && page.url().endsWith("/login"));
  await page.fill('input[type=email]', "ok@nfs.test"); await page.fill('input[autocomplete="current-password"]', "wrong"); await page.click("button[type=submit]");
  ok("wrong password shows a friendly error", await waitText("Incorrect email or password."));
  await page.fill('input[type=email]', "unverified@nfs.test"); await page.click("button[type=submit]");
  ok("unverified email explains verification and offers resend", await waitText("Please verify your email"));
  await page.click("text=Resend email"); ok("resend verification calls Supabase", await waitText("Verification email sent") && (await sb(() => window.__sb.calls.some((c) => c[0] === "resend"))));
  await page.click('[aria-label="Show password"]'); ok("show/hide password toggles input type", (await page.locator('input[autocomplete="current-password"]').getAttribute("type")) === "text");
  await page.fill('input[type=email]', "ok@nfs.test"); await page.fill('input[autocomplete="current-password"]', "Passw0rd!xyz"); await page.click("button[type=submit]");
  ok("valid login lands on the originally requested page (/history)", await waitText("Individual predictions") && page.url().endsWith("/history"));

  // ---------------- overview (numbers must equal the seeded database)
  await nav("Overview"); await waitText("Customers analysed");
  const truth = await sb(() => { const d = window.__sb.db(); const a = [...d.predictions, ...d.batch_prediction_results]; return { total: a.length, high: a.filter((x) => x.risk_level === "High").length, medium: a.filter((x) => x.risk_level === "Medium").length, low: a.filter((x) => x.risk_level === "Low").length, avg: (a.reduce((s, x) => s + x.churn_probability, 0) / a.length * 100).toFixed(1) }; });
  const kpi = async (label) => (await page.locator("p", { hasText: new RegExp("^" + label + "$") }).first().locator("xpath=following-sibling::p[1]").innerText());
  ok("overview total predictions equals database (" + truth.total + ")", (await kpi("Total predictions")) === String(truth.total), await kpi("Total predictions"));
  ok("overview high/medium/low equal database", (await kpi("High risk")) === String(truth.high) && (await kpi("Medium risk")) === String(truth.medium) && (await kpi("Low risk")) === String(truth.low), [await kpi("High risk"), truth.high].join("/"));
  ok("overview average probability equals database (" + truth.avg + "%)", (await kpi("Avg churn probability")).startsWith(truth.avg), await kpi("Avg churn probability"));
  ok("overview shows model information from saved metrics", await has("Model information") && await has("Random Forest") && await has("not live performance"));
  ok("overview shows segment analytics from the database", await has("Segment analytics") && await has("New month-to-month") && await has("Loyal long-term"));
  ok("overview AI insights say AI requires configuration when it is off", await waitText("AI functionality requires configuration"));
  ok("overview charts rendered (pie, activity, contract)", (await page.locator("[data-chart=PieChart]").count()) === 1 && (await page.locator("[data-chart=ComposedChart]").count()) === 1);

  // ---------------- predict
  await nav("Predict"); await waitText("Customer information");
  await page.fill('input[placeholder="e.g. 7590-VHVEG"]', "  CUST-9 "); await page.click("text=Example: new customer"); await page.click("text=Predict churn risk");
  ok("single prediction shows probability, risk and saved status", await waitText("73.1%") && await has("saved to your history") && await has("likely to churn"));
  const pr = apiLog.filter((x) => x.p === "/api/v1/predict").pop();
  ok("predict sends bearer token + typed payload", pr && pr.auth === "Bearer tok.ok@nfs.test" && pr.body.customer_id === "CUST-9" && pr.body.customer.tenure === 3 && pr.body.customer.SeniorCitizen === 0 && pr.body.customer.TotalCharges === 286.5, JSON.stringify(pr && pr.body).slice(0, 160));
  await page.click("text=Reset"); await page.fill('input[placeholder="e.g. 8"]', "-4"); await page.fill('input[placeholder="e.g. 79.5"]', "0"); await page.click("text=Predict churn risk");
  ok("client validation blocks bad tenure / charge", await has("Enter whole months between 0 and 120.") && await has("Enter a monthly charge above 0."));

  // ---------------- batch
  await nav("Batch Prediction"); await page.click("text=Load sample CSV"); ok("sample CSV previews 6 rows", await waitText("6 rows") && await has("Run predictions"));
  await page.click("text=Run predictions"); ok("batch results show counts and failed row", await waitText("Results") && await has("Invalid: Contract: invalid") && await has("Total rows"));
  const RT = page.locator("table:has(th:has-text('Probability')) tbody tr");
  await page.fill('input[aria-label="Search results"]', "S-2"); ok("batch results search narrows to the matching customer", (await RT.count()) === 1 && await has("S-2"));
  await page.fill('input[aria-label="Search results"]', ""); await page.locator("select").last().selectOption("Invalid rows"); ok("batch filter 'Invalid rows' shows only the failed row", (await RT.count()) === 1 && await has("Invalid: Contract: invalid"));
  await page.locator("select").last().selectOption("Medium risk"); ok("batch filter by risk level works", (await RT.count()) === 5);
  await page.locator("select").last().selectOption("All rows");
  const bp = apiLog.filter((x) => x.p === "/api/v1/predict/batch").pop();
  ok("batch sends bearer token, filename and 6 rows", bp && bp.auth && bp.body.customers.length === 6 && bp.body.filename.includes("sample_customers"));
  const dl = page.waitForEvent("download"); await page.click("text=Download CSV"); const d = await dl; const csv = fs.readFileSync(await d.path(), "utf8").replace(/^\ufeff/, "");
  ok("downloaded results CSV has header, 6 rows and the failed row's error", csv.split("\r\n").length === 7 && csv.startsWith("row,customer_id,status") && csv.includes("Contract: invalid"), csv.split("\r\n")[0]);
  await page.setInputFiles('input[type=file]', { name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("x") }); ok("non-CSV upload rejected", await waitText("Please upload a .csv file."));

  // ---------------- history
  await nav("Prediction History"); await waitText("Individual predictions");
  const rowsN = async () => page.locator("tbody tr").count();
  ok("history lists all 12 saved single predictions", (await rowsN()) === 12, String(await rowsN()));
  await page.fill('input[placeholder="Customer ID"]', "C-1"); await page.waitForTimeout(600); ok("search filters by customer id (C-1, C-10, C-11)", (await rowsN()) === 3, String(await rowsN()));
  await page.fill('input[placeholder="Customer ID"]', ""); await page.waitForTimeout(600);
  await page.selectOption("select", "High"); await page.waitForTimeout(400);
  const highTruth = await sb(() => window.__sb.db().predictions.filter((x) => x.risk_level === "High").length);
  ok("risk filter shows only High (" + highTruth + ")", (await rowsN()) === highTruth && (await page.locator("tbody span", { hasText: /^Medium$/ }).count()) === 0, String(await rowsN()));
  await page.selectOption("select", "All"); await page.waitForTimeout(300);
  await page.locator("tbody tr").first().click(); ok("clicking a row opens details with input fields and drivers", await waitText("Prediction details") && await has("What-if drivers"));
  await page.click("text=Close"); await page.locator('[aria-label="Delete prediction"]').first().click(); ok("delete asks for confirmation", await waitText("Delete this prediction?"));
  await page.click("button:has-text('Delete')"); await page.waitForTimeout(500); ok("confirmed delete removes the record from the database", (await rowsN()) === 11 && (await sb(() => window.__sb.db().predictions.length)) === 11);
  await page.click("text=Batch uploads"); await waitText("batch-a.csv"); await page.locator("tbody tr", { hasText: "batch-a.csv" }).first().click();
  ok("expanding a batch shows per-customer probability and risk (no dashes)", await waitText("Predicted churn") && (await page.locator("tbody tr").filter({ has: page.locator("td", { hasText: /^B0-1$/ }) }).last().innerText()).match(/\d+\.\d%/) !== null);
  ok("batch results paginate (30 rows, 25 per page)", await has("1–25 of 30"));
  await page.locator("button:has-text('Next')").first().click(); ok("page 2 shows rows 26-30", await waitText("26–30 of 30"));

  // ---------------- segments, performance, workflow
  await nav("Customer Segments"); await waitText("Explore by attribute");
  ok("segments: 3 rule segments + unavailable support-contacts note", await has("New month-to-month customers") && await has("Loyal long-term customers") && await has("unavailable") && await has("no support-ticket"));
  ok("segments: key observations are computed from the data", await has("Key observations") && await has("Highest average predicted risk by contract"));
  ok("segments: tenure / charge / support / contract breakdowns present", await has("By tenure") && await has("0-11 months") && await has("By monthly charge") && await has("By tech-support status") && await has("By contract type"));
  await nav("Model Performance"); await waitText("Confusion matrix");
  ok("performance shows the saved confusion matrix 813/222/99/275", await has("813") && await has("222") && await has("99") && await has("275"));
  ok("performance shows ROC-AUC 0.842 and F1 0.631 (JSON holds 0.6315, 0.8417)", await has("0.842") && await has("0.631"));
  ok("performance: feature importance chart has 19 fields, limitations and saved-vs-live note", (await page.locator('[data-chart=BarChart][data-points="19"]').count()) === 1 && await has("does not measure live production performance") && await has("Model limitations"));
  await nav("ML Workflow"); await waitText("Prediction-time workflow");
  ok("workflow shows all 11 stages", (await page.locator('[aria-label^="Stage "]').count()) === 11);
  ok("workflow stage 1 states the 19 real input fields", await has("Customer Data Input") && await has("19 input fields: 4 numeric") && await has("TotalCharges"));
  const stage = async (n, needles, name) => { await page.locator(`[aria-label^="Stage ${n}:"]`).click(); let allOk = true; for (const t of needles) allOk = (await waitText(t)) && allOk; ok(name, allOk, needles.join(" | ")); };
  await stage(2, ["strict schema that mirrors feature_schema.json", "tenure 0–120 months", "never scored or stored"], "workflow stage 2 (data validation) is accurate");
  await stage(3, ["numeric columns (SeniorCitizen, tenure, MonthlyCharges, TotalCharges)", "SimpleImputer (median) → StandardScaler", "remainder: drop"], "workflow stage 3 (numeric preprocessing) shows the real branch");
  await stage(4, ["SimpleImputer (most_frequent) → OneHotEncoder (handle_unknown=ignore)"], "workflow stage 4 (categorical preprocessing) shows the real branch");
  await stage(5, ["only TotalCharges had missing values", "median"], "workflow stage 5 (imputation) names the real field");
  await stage(6, ["StandardScaler", "zero mean, unit variance"], "workflow stage 6 (scaling)");
  await stage(7, ["There is no custom feature-engineering step", "OneHotEncoder"], "workflow stage 7 (one-hot) states there is no feature engineering");
  await stage(8, ["RandomForestClassifier with 300 decision trees", "class_weight=balanced", "min_samples_leaf=5"], "workflow stage 8 (Random Forest) shows real parameters");
  await stage(10, ["Low below 0.35; Medium from 0.35 up to 0.6; High at 0.6 or above"], "workflow stage 10 (risk bands) uses the project thresholds");
  await stage(11, ["at least 0.5", "never retrains the model"], "workflow stage 11 (final prediction) states the threshold and no retraining");
  ok("workflow separates training-time (offline) from prediction-time (live)", await has("Training-time workflow") && await has("offline") && await has("Fit.") && await has("held-out test rows"));

  // ---------------- assistant (not configured, then configured)
  await nav("AI Assistant"); ok("assistant says AI requires configuration instead of faking replies", await waitText("AI functionality requires configuration"));
  aiConfigured = true; await nav("Overview"); await waitText("Generate insights");
  await page.click("text=Generate insights"); ok("overview AI insights show the AI narrative with a label when configured", await waitText("AI narrative text") && await has("AI-generated"));
  const ir = apiLog.filter((x) => x.p === "/api/v1/reports/generate").pop(); ok("AI insights request asks for an executive report with AI summary", ir && ir.body.kind === "executive" && ir.body.include_ai_summary === true && !!ir.auth);
  await nav("AI Assistant"); await waitText("NFS Intelligence");
  await page.click("text=What is my current high-risk customer count?"); ok("assistant shows the AI reply with provenance label", await waitText("60 saved predictions") && await has("AI-generated"));
  const chat = apiLog.filter((x) => x.p === "/api/v1/assistant/chat").pop(); ok("chat request carries bearer token and only role/content", chat && chat.auth && chat.body.messages.every((m) => Object.keys(m).sort().join() === "content,role") && chat.body.prediction_id === null);

  // ---------------- reports
  await nav("Reports"); await page.click("text=Customer segment report"); await page.click("button:has-text('Generate report')");
  ok("report renders sections and tables", await waitText("Customer segments") && await has("New month-to-month customers") && await has("Download CSV"));
  const rp = apiLog.filter((x) => x.p === "/api/v1/reports/generate").pop(); ok("report request is kind=segment", rp && rp.body.kind === "segment");
  const dl2 = page.waitForEvent("download"); await page.click("text=Download CSV"); const d2 = await dl2; const rcsv = fs.readFileSync(await d2.path(), "utf8");
  ok("report CSV contains title, table and disclaimer", rcsv.includes("Customer segment report") && rcsv.includes("Segment,Size") && rcsv.includes("model predictions"));
  await page.check("text=Add an AI-written narrative"); await page.click("button:has-text('Generate report')"); ok("AI narrative is labelled AI-generated when configured", await waitText("AI narrative text") && await has("AI-generated"));

  // ---------------- settings
  await nav("Settings"); await waitText("Profile");
  ok("settings shows AI provider status without any key", await waitText("Enabled: provider anthropic, model test-model") && !(await has("sk-")) && await has("never shown here"));
  await page.fill('input[maxlength="120"]', "Renamed User"); await page.click("text=Save profile"); await page.waitForTimeout(400);
  ok("profile name saved to database", (await sb(() => window.__sb.db().profiles[0].full_name)) === "Renamed User");
  await page.locator('input[type=checkbox]').first().uncheck(); await page.waitForTimeout(400); ok("notification preference persisted", (await sb(() => window.__sb.db().profiles[0].toasts_enabled)) === false);
  await page.click("text=Delete all my prediction history"); await page.click("button:has-text('Delete everything')"); await page.waitForTimeout(600);
  ok("delete-all removes batches and cascades results", (await sb(() => window.__sb.db().predictions.length + window.__sb.db().prediction_batches.length + window.__sb.db().batch_prediction_results.length)) === 0);
  await nav("Overview"); ok("overview then shows a proper empty state (no fabricated data)", await waitText("No predictions yet") && !(await has("Customers analysed")));
  await nav("Settings"); await page.click("text=Sign out on all devices"); ok("global sign-out redirects to login and uses scope=global", await waitText("Welcome back") && (await sb(() => window.__sb.calls.some((c) => c[0] === "signOut" && c[1] === "global"))));
  await page.goto("http://nfs.test/settings"); ok("after sign-out protected pages are blocked", await waitText("Welcome back"));

  // ---------------- signup
  await page.click("text=Create an account"); await waitText("Create your account");
  await page.fill('input[autocomplete="name"]', "New Person"); await page.fill('input[type=email]', "new@nfs.test"); await page.locator('input[autocomplete="new-password"]').first().fill("weak"); await page.click("button[type=submit]");
  ok("signup rejects a weak password", await waitText("Choose a stronger password"));
  await page.locator('input[autocomplete="new-password"]').first().fill("Str0ng!Passw0rd"); await page.locator('input[autocomplete="new-password"]').nth(1).fill("Different!1x"); await page.click("button[type=submit]");
  ok("signup rejects mismatched passwords", await waitText("The passwords do not match."));
  await page.locator('input[autocomplete="new-password"]').nth(1).fill("Str0ng!Passw0rd"); await page.click("button[type=submit]");
  ok("signup requires accepting terms", await waitText("accept the Terms"));
  await page.check('input[type=checkbox]'); await page.click("button[type=submit]");
  ok("signup succeeds and asks the user to verify email", await waitText("Check your email") && await has("new@nfs.test") && (await sb(() => window.__sb.calls.some((c) => c[0] === "signUp" && c[2] && c[2].full_name === "New Person"))));
  await page.goto("http://nfs.test/forgot-password"); await page.fill('input[type=email]', "ok@nfs.test"); await page.click("button[type=submit]"); ok("forgot password gives a neutral confirmation", await waitText("If an account exists"));
  await page.goto("http://nfs.test/no-such-page"); ok("unknown route while signed out goes to login (not a blank page)", await waitText("Welcome back"));

  const real = consoleErrors.filter((e) => !/favicon/.test(e));
  ok("no console errors or uncaught exceptions during the whole run", real.length === 0, real.slice(0, 3).join(" | "));
  await browser.close();
  const pass = results.filter((r) => r[1]).length; console.log(`\n${pass}/${results.length} smoke checks passed`); if (fails.length) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exitCode = 1; }
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
