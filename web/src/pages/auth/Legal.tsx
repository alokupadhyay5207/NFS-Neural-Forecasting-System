import { Link } from "react-router-dom";
import { Logo } from "../../components/Logo";

const wrap = (title: string, body: JSX.Element) => (
  <div className="mx-auto max-w-2xl px-4 py-10">
    <Link to="/login"><Logo /></Link>
    <h1 className="mt-8 text-2xl font-bold text-white">{title}</h1>
    <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">{body}</div>
    <Link to="/signup" className="mt-8 inline-block text-sm text-cyan-nfs hover:underline">Back to sign up</Link>
  </div>
);

export const Terms = () => wrap("Terms of Use", (
  <>
    <p>NFS (Neural Forecasting System) is a data-science portfolio and demonstration product. It estimates customer churn risk with a model trained on the public IBM Telco sample dataset.</p>
    <p>Predictions are statistical risk scores, not confirmed outcomes, and are not guaranteed to reflect real-world performance. Do not use them as the sole basis for decisions that significantly affect individuals.</p>
    <p>You are responsible for the data you upload and for having the right to process it. Do not upload data you are not authorised to use.</p>
  </>
));

export const Privacy = () => wrap("Privacy Policy", (
  <>
    <p><b className="text-white">What is stored.</b> Your name and email (via Supabase Auth), and the predictions you run: for single predictions, the 19 model input fields, the customer ID you typed (optional), and the model’s output; for batch uploads, the file name, counts, and for each successfully scored row the customer ID, probability, risk level and four segment fields (contract, tenure, monthly charges, tech support). Failed rows and the rest of your CSV are not stored.</p>
    <p><b className="text-white">Who can see it.</b> Only you. Database rules restrict every row to its owner. Prediction data is written by the NFS backend, never by the browser.</p>
    <p><b className="text-white">AI assistant.</b> If enabled by the operator, questions you ask are sent with aggregate statistics about your own account (not raw customer rows) to the configured AI provider. Individual prediction details are only included if you attach one.</p>
    <p><b className="text-white">Deleting data.</b> You can delete individual records or your whole history in Prediction History and Settings.</p>
  </>
));
