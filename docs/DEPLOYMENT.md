# Deployment and integration checklist

## 1. Supabase

1. Create a project and note the project ref, URL, anon key, and service role
   key.
2. Link and apply the migrations in order:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Migrations:

| Version | Purpose |
| --- | --- |
| `20261019125531_init_amethyst_backend` | Enums, 18 tables, RLS, triggers, credit/rate/claim/finalize functions, private bucket |
| `20261019125713_companion_pairing_exchange` | Atomic pairing-code exchange |
| `20261019125911_graph_payload_and_finalize` | Stored graph payload + 12-argument `finalize_job` |
| `20261019131416_credit_accounting_fix` | Correct available-balance on commit; safe idempotent grant |
| `20261019131809_privilege_and_index_hardening` | Revoke trigger-function EXECUTE; add FK covering indexes |
| `20261020181432_revoke_anon_select` | Revoke anonymous table access and default grants |
| `20261023121717_harden_dodo_checkout_credits` | Store expected Dodo price/currency; serialize grants by idempotency key |

The baseline migrations through `20261020181432` were applied to the
development project through the Supabase MCP. The Dodo hardening migration
`20261023121717` is now applied as well, so `checkout_sessions.expected_amount`
and `checkout_sessions.expected_currency` exist.

3. Confirm the private bucket `analysis-artifacts` exists with a 50 MB cap and
   JSON-only MIME type. Do not add public read policies.
4. Enable the auth providers you need in Supabase Auth. This backend verifies
   sessions but does not render sign-in pages.
5. Generate HMAC secrets:

```bash
openssl rand -base64 48   # PAIRING_CODE_SECRET
openssl rand -base64 48   # COMPANION_TOKEN_SECRET (must be different)
```

## 2. Server environment

Copy `.env.example` and fill in:

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server only; never expose |
| `APP_URL` | yes in production | Origin used for Dodo return/cancel URLs. Falls back to `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL` on Vercel |
| `PAIRING_CODE_SECRET` | yes | HMAC key, 32+ random bytes |
| `COMPANION_TOKEN_SECRET` | yes | Different HMAC key |
| `ARTIFACT_BUCKET` | no | Default `analysis-artifacts` |
| `MAX_ARTIFACT_BYTES` | no | Default 25 MB; must not exceed the bucket cap |
| `AI_PROVIDER` | no | `auto` (default), `openai`, or `gemini` |
| `AI_API_KEY` | for AI | Provider API key; server-side only |
| `AI_BASE_URL` | no | Default `https://api.openai.com/v1`. Native Gemini: `https://generativelanguage.googleapis.com/v1beta` |
| `AI_MODEL` | for native Gemini | OpenAI-compatible default is `gpt-4.1-mini`. For native Gemini set a model id, or include it in a full `:generateContent` URL |
| `AI_REQUEST_TIMEOUT_MS` | no | Default 60s |
| `AI_MAX_EVIDENCE_CHARS` | no | Default 30,000 |
| `CREDITS_AI_CHAT` | no | Default 1 |
| `CREDITS_CODEGEN` | no | Default 5 |
| `DODO_PAYMENTS_API_KEY` | for billing | Dodo API key |
| `DODO_PAYMENTS_WEBHOOK_KEY` | for billing | Standard Webhooks signing secret |
| `DODO_ENVIRONMENT` | no | `test_mode` or `live_mode` |
| `DODO_PRODUCT_CREDITS` | for billing | JSON map of product id → `{ "credits": n }` |
| `TIGERGRAPH_URL` | no | If unset, graph queries return 503 and sync is skipped |
| `TIGERGRAPH_GRAPH` | no | Default `Amethyst` |
| `TIGERGRAPH_TOKEN` | no | Bearer token for TigerGraph |
| `TIGERGRAPH_TIMEOUT_MS` | no | Default 10s |

Never put server secrets in `NEXT_PUBLIC_*` variables.

## 3. Build and run

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

On Vercel, the App Router deploys as-is. Route handlers that call external
services declare `maxDuration` (60s AI chat, 90s codegen); adjust to your plan.
The companion is a separate long-running process and must not be deployed as a
serverless function.

## 4. Dodo Payments

The test-mode account has three one-time USD products:

| Product | Credits | Price |
| --- | --- | --- |
| Amethyst Credits — 100 | 100 | $5.00 |
| Amethyst Credits — 500 | 500 | $20.00 |
| Amethyst Credits — 1000 | 1000 | $35.00 |

Their product ids are mapped in `DODO_PRODUCT_CREDITS` in `.env.local`.

1. Create one-time-price products in Dodo (or reuse the test-mode products
   above).
2. Set `DODO_PRODUCT_CREDITS` to the exact product ids and intended credits.
   The checkout API reads the authoritative price and currency from Dodo and
   stores them on the checkout session for webhook validation.
3. The test-mode webhook endpoint is configured as:

```
POST https://amethyst-rose-nine.vercel.app/api/v1/webhooks/dodo
```

It is subscribed to `payment.succeeded`. Use the webhook signing secret as
`DODO_PAYMENTS_WEBHOOK_KEY`. The endpoint must run the same code and have the
same server environment as the app; the Vercel deployment currently reports
`dodo: false` from `/api/v1/health` until its environment variables are set.
4. Set `APP_URL` to the public origin so checkout returns to
   `/billing/return` (cancel goes to `/billing/cancel`). Local development can
   use `http://localhost:3000`, but Dodo's servers cannot reach a localhost
   webhook.
5. Send a test event from Dodo and verify:
   - `webhook_events.status = 'processed'`
   - one `payments` row
   - one `credit_transactions` row with `reference_id = payment_id`
   - the account balance increased exactly once
   - replaying the same webhook returns `duplicate` / no new grant
   - `/usage` shows the payment in purchase history

Checkout previews for all three products and a real test-mode checkout session
were validated against the Dodo API. The local webhook route also accepted a
correctly signed test event and rejected an invalid signature. A completed
payment still requires the configured public deployment (or another public
origin) to receive Dodo's webhook.

## 5. AI provider

The server supports two API shapes and never mixes them:

- **OpenAI-compatible:** calls `<AI_BASE_URL>/chat/completions` with a bearer key
  and `response_format: { "type": "json_object" }`.
- **Native Gemini:** calls
  `<AI_BASE_URL>/models/<AI_MODEL>:generateContent` with `x-goog-api-key`,
  `systemInstruction`, `contents`, and
  `generationConfig.responseMimeType = "application/json"`.

`AI_PROVIDER=auto` treats `generativelanguage.googleapis.com` as native Gemini,
except for its `/openai` compatible path, and treats every other base URL as
OpenAI-compatible. Set `AI_PROVIDER` explicitly to override detection. The
server rejects a native `:generateContent` URL when the provider is OpenAI and
rejects an `/openai` URL when the provider is Gemini.

Validate that the selected model supports JSON mode. If the provider rejects the
request, AI chat and codegen return `503`; a non-JSON chat response is returned
only as a clearly labeled `partial` fallback with no citations.

Only bounded findings are sent. No repository or binary contents are uploaded.

## 6. TigerGraph

See [tigergraph/README.md](../tigergraph/README.md). Set `TIGERGRAPH_URL`,
`TIGERGRAPH_GRAPH`, and `TIGERGRAPH_TOKEN`. When unset:

- `POST /projects/:id/graph/query` returns `503`;
- job finalization still succeeds and `graph_sync.status` becomes `skipped`.

Graph upsert/query payloads were written from the documented REST shape but
were not executed against a live instance.

## 7. Companion rollout

From the Amethyst repository root, on the machine that will run analysis:

```bash
cd /path/to/amethyst
npm run companion:setup
```

This script belongs to the Amethyst repository; it is intentionally unavailable
from analysis targets. It builds the companion, installs a self-contained copy
under `~/.local/share/amethyst-companion`, and writes the
`~/.local/bin/amethyst-companion` launcher. Re-run setup after updating the
repository.

If `amethyst-companion` is not found, add the launcher directory to the shell:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

For zsh, use `~/.zshrc`. The direct fallback is
`~/.local/bin/amethyst-companion --help`. Then, from any directory:

```bash
amethyst-companion pair --server https://<your-origin> --code <code>
amethyst-companion select --project <project-id> --kind javascript_application
# Only for a target registered from the web:
amethyst-companion approve --path /absolute/path
AMETHYST_AUTO_APPROVE=0 amethyst-companion run
```

`select` opens a native picker (`zenity`, `kdialog`, or `yad`), validates the
chosen path on the companion machine, records local approval, and registers the
target. Install `zenity` on Ubuntu if no picker is installed. Use
`--path /absolute/path` only for non-interactive runs.

Recommended:

- Run as an unprivileged user with access only to intended analysis targets.
- Keep `AMETHYST_AUTO_APPROVE` unset unless the machine is dedicated and you
  understand that queued paths will be approved automatically.
- Pin `REA_PACKAGE` and set `REA_VERSION` in the environment for auditability.
- Use Node.js 24.15+ in the 24.x line or 26+ if you need the SQLite workflow.
  Other workflows need Node.js 22.19+. A systemd unit must put that runtime
  first on `PATH` (or invoke its `node` explicitly); distro Node 18 fails inside
  REA with `ERR_IMPORT_ASSERTION_TYPE_MISSING`.
- Install a process supervisor (systemd, launchd, etc.) for long-running use.
  A supervisord worker has no TTY, so approve every target first with
  `amethyst-companion approve` (or `select`) rather than relying on a prompt.
- JavaScript folders containing `node_modules`, `.next`, `.git`, or similar
  dependency/build directories are analyzed from a temporary source-only
  snapshot. The job summary records `analysis_scope` and excluded directories.
  The home directory is refused, and a bounded pre-copy inventory rejects
  targets above 25,000 retained files or 2 GiB before any staging copy starts.
- Revoke the companion with `amethyst-companion revoke` if the machine
  is retired.

Companion environment variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `REA_BIN` | unset | Existing executable; overrides npx |
| `REA_PACKAGE` | `rea-agents@6.7.0` | Pinned package for npx |
| `REA_VERSION` | unset | Recorded in job summary |
| `AMETHYST_CONFIG` | `~/.amethyst/companion.json` | Config path |
| `AMETHYST_JOB_TIMEOUT_MS` | `900000` | Per-job timeout |
| `AMETHYST_MAX_ARTIFACT_BYTES` | `26214400` | Local artifact cap |
| `AMETHYST_MAX_STAGE_FILES` | `25000` | Maximum retained files before staging |
| `AMETHYST_MAX_STAGE_BYTES` | `2147483648` | Maximum retained bytes before staging |
| `AMETHYST_AUTO_APPROVE` | unset | `1` auto-approves targets |
| `AMETHYST_ALLOW_INSECURE_HTTP` | unset | `1` allows non-local HTTP |
| `AMETHYST_APP_DIR` | auto-detected | Repository path refused as an analysis target |

## 8. End-to-end smoke test

1. Sign in through Supabase and obtain an access token.
2. `GET /api/v1/health` and confirm Supabase is `true`.
3. `POST /api/v1/projects`, then run `companion select --project <id>` on the
   target machine and confirm the selected target appears in the project.
4. Pair a companion and start `run`.
5. Create a job for that target and companion.
6. Confirm the job moves `queued → claimed → running → succeeded`.
7. Download the artifact and verify its SHA-256 matches the job detail.
8. Confirm findings are listed and, if configured, TigerGraph sync succeeded.
9. Ask an AI question with `finding_ids` and confirm the answer cites only those
   findings and credits were debited once.
10. Start a Dodo checkout, pay in test mode, and verify exactly one credit
    grant after the webhook.

## 9. Unverified integrations

These were implemented but could not be exercised with real credentials or
samples in this environment:

- Live TigerGraph schema install, upsert, and neighbor query.
- Live Dodo checkout creation and a real signed webhook.
- Managed-artifact, Go, and Rust workflows (no sample artifacts available).

Live AI chat and code generation were exercised through the configured Gemini
provider with a temporary account. The OpenAI-compatible provider path remains
unverified against a live endpoint.

The JavaScript and SQLite workflows were exercised successfully with
`rea-agents@6.7.0` through the companion's `runRea` on local samples (JavaScript
on Node 22, SQLite on Node 24.15). A full paired companion-to-server JavaScript
job also succeeded: target selection, real REA execution, result upload,
findings, graph counts, and artifact download were verified, and the temporary
account rows were removed.

Do not treat this repository as production-verified for those paths until the
smoke test above passes in staging.
