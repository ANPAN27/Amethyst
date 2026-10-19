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

The same migrations were applied to the development project through the
Supabase MCP; the local filenames use the resulting migration versions so
`db push` can reconcile history.

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
| `APP_URL` | yes in production | Origin used for Dodo return/cancel URLs |
| `PAIRING_CODE_SECRET` | yes | HMAC key, 32+ random bytes |
| `COMPANION_TOKEN_SECRET` | yes | Different HMAC key |
| `ARTIFACT_BUCKET` | no | Default `analysis-artifacts` |
| `MAX_ARTIFACT_BYTES` | no | Default 25 MB; must not exceed the bucket cap |
| `AI_API_KEY` | for AI | OpenAI-compatible provider key |
| `AI_BASE_URL` | no | Default `https://api.openai.com/v1` |
| `AI_MODEL` | no | Default `gpt-4.1-mini` |
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

1. Create the products in Dodo.
2. Set `DODO_PRODUCT_CREDITS` to the exact product ids and intended credits.
3. Configure the webhook endpoint:

```
POST https://<your-origin>/api/v1/webhooks/dodo
```

Subscribe at least to `payment.succeeded`. Use the webhook signing secret as
`DODO_PAYMENTS_WEBHOOK_KEY`.
4. Set `APP_URL` to the public origin so checkout returns to
   `/billing/return` (cancel goes to `/billing/cancel`).
5. Send a test event from Dodo and verify:
   - `webhook_events.status = 'processed'`
   - one `payments` row
   - one `credit_transactions` row with `reference_id = payment_id`
   - the account balance increased exactly once
   - replaying the same webhook returns `duplicate` / no new grant

The checkout API requires a live/sandbox Dodo account. Creating sessions was
not tested here.

## 5. AI provider

The server calls `<AI_BASE_URL>/chat/completions` with a bearer key and expects
an OpenAI-compatible response. It requests `response_format: json_object`.
Validate that your provider supports it. If it does not, AI chat falls back to
a clearly labeled partial answer, while codegen returns `503`.

Only bounded findings are sent. No repository or binary contents are uploaded.

## 6. TigerGraph

See [tigergraph/README.md](../tigergraph/README.md). Set `TIGERGRAPH_URL`,
`TIGERGRAPH_GRAPH`, and `TIGERGRAPH_TOKEN`. When unset:

- `POST /projects/:id/graph/query` returns `503`;
- job finalization still succeeds and `graph_sync.status` becomes `skipped`.

Graph upsert/query payloads were written from the documented REST shape but
were not executed against a live instance.

## 7. Companion rollout

```bash
npm run companion:install
npm run companion:build
node companion/dist/cli.js pair --server https://<your-origin> --code <code>
AMETHYST_AUTO_APPROVE=0 node companion/dist/cli.js run
```

Recommended:

- Run as an unprivileged user with access only to intended analysis targets.
- Keep `AMETHYST_AUTO_APPROVE` unset unless the machine is dedicated and you
  understand that queued paths will be approved automatically.
- Pin `REA_PACKAGE` and set `REA_VERSION` in the environment for auditability.
- Use Node.js 24.15+ in the 24.x line or 26+ if you need the SQLite workflow.
  Other workflows run on the server's Node 22 baseline.
- Install a process supervisor (systemd, launchd, etc.) for long-running use.
- Revoke the companion with `node companion/dist/cli.js revoke` if the machine
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
| `AMETHYST_AUTO_APPROVE` | unset | `1` auto-approves targets |
| `AMETHYST_ALLOW_INSECURE_HTTP` | unset | `1` allows non-local HTTP |

## 8. End-to-end smoke test

1. Sign in through Supabase and obtain an access token.
2. `GET /api/v1/health` and confirm Supabase is `true`.
3. `POST /api/v1/projects`, then create a target with an absolute path on the
   companion machine.
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
- Live AI completion and provider-specific JSON mode behavior.
- Live Dodo checkout creation and a real signed webhook.
- Managed-artifact, Go, and Rust workflows (no sample artifacts available).

The JavaScript and SQLite workflows were exercised successfully with
`rea-agents@6.7.0` through the companion's `runRea` on local samples (JavaScript
on Node 22, SQLite on Node 24.15).

Do not treat this repository as production-verified for those paths until the
smoke test above passes in staging.
