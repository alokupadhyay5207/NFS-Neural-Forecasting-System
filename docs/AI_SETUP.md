# AI assistant setup (optional)

NFS includes a rule-based Intelligence Assistant that works without a paid API key and uses the signed-in
user's saved Supabase analytics. Optional LLM integration can provide enhanced AI-generated responses and
narratives where supported. Configure a provider only if you want those additional capabilities.

The provider key stays only in the backend (backend\\.env); it is never sent to the browser.

The key lives **only** in the backend (`backend\.env`). It is never sent to the browser.

## 1. Choose a provider and edit `backend\.env`
Open `backend\.env` with Notepad (created by `setup_windows.bat` from `.env.example`). Fill in ONE of these blocks, then restart the backend.

**Anthropic (Claude)**
```
NFS_LLM_PROVIDER=anthropic
NFS_LLM_API_KEY=your-anthropic-api-key
NFS_LLM_MODEL=claude-sonnet-5-5
```
(`NFS_LLM_MODEL` may be left empty for Anthropic; it then defaults to `claude-sonnet-5-5`. Use any Claude model your account can access.)

**OpenAI**
```
NFS_LLM_PROVIDER=openai
NFS_LLM_API_KEY=your-openai-api-key
NFS_LLM_MODEL=a-model-name-your-account-can-use
```

**OpenAI-compatible provider** (OpenRouter, a local server such as LM Studio or Ollama's OpenAI endpoint, Azure-style gateways, ...)
```
NFS_LLM_PROVIDER=openai
NFS_LLM_BASE_URL=https://your-provider.example.com/v1
NFS_LLM_API_KEY=the-key-for-that-provider
NFS_LLM_MODEL=the-model-name-that-provider-uses
```
The base URL must be the one that serves `/chat/completions`. Local servers that need no key still need a non-empty placeholder in `NFS_LLM_API_KEY`.

Optional: `NFS_LLM_MAX_TOKENS` (default 900) and `NFS_CHAT_RATE_PER_MIN` (default 20 questions per user per minute).

## 2. Check that it is on
Restart `run_all.bat`, sign in, open **Settings**. The "AI assistant" card should say *Enabled: provider ..., model ...*. It never shows the key.

## 3. What the AI is (and is not) given
- Aggregate statistics for the signed-in user only: totals, risk counts, average probability, segment and contract/tenure/charge/support breakdowns, 30-day activity, and the saved model metrics.
- One customer's 19 input fields, probability and what-if drivers **only if you attach that saved prediction** on the Assistant page. The customer ID is never sent.
- Never: other users' data, raw CSV rows, names, emails, or API keys.
The system prompt tells the model to use only that data, to treat everything as a *prediction* (not confirmed churn), to mention uncertainty, and not to claim causation. A language model can still make mistakes, so replies are labelled "AI-generated" and you should check key figures on the Overview.
Your questions and that context are sent to the provider you configured and are subject to that provider's terms.

## 4. Troubleshooting
| Message in the app | Meaning / fix |
|---|---|
| "AI functionality requires configuration" | `NFS_LLM_PROVIDER`, `NFS_LLM_API_KEY` or `NFS_LLM_MODEL` is missing in `backend\.env`, or the backend was not restarted |
| "The AI provider returned an error (401)" | The API key is wrong or expired |
| "... error (404)" | The model name or base URL is wrong for that provider |
| "... error (429)" | Provider rate limit or no credit; wait or check billing |
| "Too many assistant requests" | NFS's own limit (20/minute); wait a minute |
| "Could not read analytics" in AI answers | The database is not configured (see `docs/DATABASE_SETUP.md`); the assistant then only knows the model metrics |
