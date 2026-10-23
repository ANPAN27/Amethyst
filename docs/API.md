# Amethyst API

Base path: `/api/v1`. All JSON responses are `{ "data": ... }` on success and
`{ "error": { "code", "message", "details?" } }` on failure. Responses use
`Cache-Control: no-store`.

## Authentication

Authenticated routes accept either:

- `Authorization: Bearer <supabase-access-token>`, or
- the Supabase session cookie set by `@supabase/ssr`.

Identity always comes from Supabase. A request body can never select a user.
Missing or invalid credentials return `401 unauthorized`.

Companion routes use a separate bearer token (`amc_...`) issued once by the
pairing exchange. It is not a Supabase token.

## Errors

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | Validation or malformed input |
| 401 | `unauthorized` | Missing/invalid user or companion credentials |
| 402 | `insufficient_credits` | Balance cannot cover the operation |
| 404 | `not_found` | Resource does not exist or is not owned by the caller |
| 409 | `conflict` | State changed (job closed, duplicate artifact, etc.) |
| 413 | `invalid_request` | Body or artifact too large |
| 415 | `invalid_request` | Body is not `application/json` |
| 429 | `rate_limited` | Durable Postgres rate limit exceeded |
| 500 | `internal_error` | Unexpected server error |
| 503 | `upstream_unavailable` | AI, TigerGraph, Dodo or storage unavailable |

A different owner's resource is reported as `404`, not `403`.

## Health

### `GET /api/v1/health`

No authentication. Reports which integrations are configured and lists missing
environment variable names. It never reveals secret values. `status` is
`degraded` when a required Supabase or companion secret is missing.

```json
{
  "data": {
    "status": "ok",
    "time": "...",
    "services": {
      "supabase": true,
      "companion": true,
      "ai": false,
      "tigerGraph": false,
      "dodo": false
    },
    "warnings": ["AI_API_KEY is not set (optional)"]
  }
}
```

## Account and credits

### `GET /api/v1/me`

Returns the caller's profile and credit balance.

```json
{ "data": { "user": { "id": "...", "email": "...", "display_name": null }, "credits": { "available": 10, "reserved": 0, "total": 10 } } }
```

### `GET /api/v1/credits/balance`

Returns `{ "data": { "balance": { "available", "reserved", "total" } } }`.

### `GET /api/v1/credits/transactions?limit=&offset=`

Paginated append-only ledger. `limit` 1–200 (default 50).

### `POST /api/v1/credits/checkout`

```json
{ "product_id": "pdt_..." }
```

Creates a Dodo checkout session. The product → credit amount mapping is
server-side (`DODO_PRODUCT_CREDITS`); the client cannot choose credits.
Returns `201 { data: { checkout: { checkout_url, provider_session_id, product_id, credits } } }`.
Credits are granted only after a verified `payment.succeeded` webhook. The
`/usage` page shows the resulting `payments` rows in purchase history and the
ledger entries in recent transactions.

## Projects

All project routes require a user and enforce `owner_id`.

- `POST /api/v1/projects` — `{ name, description? }` → `201 { project }`
- `GET /api/v1/projects` — up to 200 projects → `{ projects }`
- `GET /api/v1/projects/:id` — project plus 20 recent jobs
- `PATCH /api/v1/projects/:id` — `{ name?, description? }`, at least one field
- `DELETE /api/v1/projects/:id` — cascades jobs, findings, and artifact
  metadata, then best-effort deletes the stored artifact objects

## Targets

Target paths are local absolute paths on the paired machine. They are stored in
Postgres and returned only to their owner and to the paired companion that
claims the job.

- `GET /api/v1/projects/:id/targets`
- `POST /api/v1/projects/:id/targets`

```json
{
  "kind": "javascript_application",
  "label": "web client",
  "target_path": "/home/me/src/client",
  "target_digest": "optional sha256",
  "metadata": { "optional": true }
}
```

`kind` must match the workflow used later. See `TARGET_KINDS` in
`lib/services/jobs.ts`.

The dashboard normally registers targets through the paired companion, which
validates the path on that machine before calling
`POST /api/v1/companion/targets` with `{ project_id, kind, label, target_path,
metadata? }`. The companion exposes this as
`amethyst-companion select --project <id> --path <absolute-path>` or a
native folder picker when `--path` is omitted.

## Jobs

### `POST /api/v1/projects/:id/jobs`

```json
{
  "workflow": "analyze_javascript_application",
  "target_id": "uuid",
  "companion_id": "uuid",
  "params": { "table": "optional-sqlite-table" },
  "idempotency_key": "optional-client-key"
}
```

Allowed workflows:

- `analyze_javascript_application` → `javascript_application`
- `inspect_managed_artifact` → `managed_artifact`
- `inspect_sqlite_database` → `sqlite_database`
- `inspect_go_binary` → `go_binary`
- `inspect_rust_binary` → `rust_binary`

The only allowed param is `table`, and only for `inspect_sqlite_database`;
unknown keys are rejected. The pinned REA release does not accept `--detail` or
`--type`, so the server never emits them. Reusing an `idempotency_key` returns the original job with
`idempotent: true`.

- `GET /api/v1/projects/:id/jobs?limit=&offset=`
- `GET /api/v1/jobs/:id` — job, target, graph sync status, artifact metadata
- `GET /api/v1/jobs/:id/artifact` — 5-minute signed download URL plus sha256
- `POST /api/v1/jobs/:id/graph-sync` — retries a failed graph sync using the
  stored graph payload
- `GET /api/v1/projects/:id/findings?job_id=&class=&limit=&offset=`

## AI

Both routes reserve credits before the provider call and commit only after a
successful response. Provider failures release the reservation.

### `POST /api/v1/projects/:id/ai/chat`

```json
{
  "question": "What calls parseConfig?",
  "finding_ids": ["uuid"],
  "consent_to_send_evidence": true
}
```

Returns an answer, `grounding` (`evidence`, `partial`, `insufficient`), cited
evidence ids, assumptions, and the evidence records that were supplied.
`finding_ids` is optional and capped at 20; when omitted the 30 most recent
project findings are used. Only these bounded findings are sent to the model.
When any finding evidence exists, `consent_to_send_evidence` must be `true`;
otherwise the route returns `400 invalid_request` with
`details.reason = "evidence_consent_required"` before reserving credits or
calling the provider. Raw source files, target paths, and artifacts are never
sent.

### `POST /api/v1/projects/:id/ai/codegen`

```json
{
  "instructions": "Add a null check",
  "language": "typescript",
  "finding_ids": [],
  "consent_to_send_evidence": true
}
```

Returns reviewable code plus `applied: false`. Generated code is never applied
or executed.

## Companions

### User routes

- `POST /api/v1/companions/pairing` — `{ companion_name? }` → one-time pairing
  code, 10-minute TTL. Rate limited 5 per 10 minutes.
- `GET /api/v1/companions` — owner's companions (never token hashes)
- `DELETE /api/v1/companions/:id` — revoke and delete credentials

### Companion pairing

`POST /api/v1/companion/pair`

```json
{
  "code": "ABCD-EFGH-JKLM",
  "name": "workstation",
  "platform": "linux-x64",
  "version": "0.1.0",
  "capabilities": ["analyze_javascript_application"]
}
```

Returns `201 { data: { token, companion } }`. The token is shown once; the
database stores only an HMAC digest. Send it as `Authorization: Bearer amc_...`
on all companion routes. The pairing code is consumed atomically and cannot be
reused.

### Companion job routes

- `POST /api/v1/companion/targets` — registers a locally validated target for
  a project owned by the companion's owner
- `POST /api/v1/companion/jobs/next` — atomically claims the oldest queued job
  for this companion (`FOR UPDATE SKIP LOCKED`), or `{ job: null }`
- `POST /api/v1/companion/jobs/:id/progress` — `{ progress: 0..99, message? }`
- `POST /api/v1/companion/jobs/:id/artifact` — returns a signed upload URL for
  a private JSON artifact (25 MB default); rejects if one already exists
- `POST /api/v1/companion/jobs/:id/result` — finalizes the job

JavaScript results may include `summary.analysis_scope`:
`"target"` for in-place analysis or `"source_only_staged"` when dependency
and build directories were excluded into a temporary source-only snapshot.

Result payload:

```json
{
  "status": "succeeded",
  "summary": { "modules": 12, "imports": 8 },
  "findings": [
    {
      "class": "observed",
      "category": "module",
      "title": "Module: src/index.ts",
      "detail": "optional",
      "confidence": 0.9,
      "evidence": [{ "source": "rea", "path": "src/index.ts" }]
    }
  ],
  "graph": {
    "entities": [{ "id": "src/index.ts", "type": "module", "label": "src/index.ts" }],
    "edges": [{ "from": "src/index.ts", "to": "src/util.ts", "type": "IMPORTS" }]
  },
  "artifact": { "path": "project/job/nonce.json", "sha256": "64-hex", "size_bytes": 1234 },
  "rea": { "workflow": "analyze_javascript_application", "duration_ms": 1200, "version": "6.7.0" }
}
```

A succeeded result **must** include an artifact. The server verifies the
artifact exists, its size, and its SHA-256 before finalizing. A failed result
uses `{ "status": "failed", "error": { "code", "message" } }` and needs no
artifact. Finalization is a single SQL transaction: job state, findings,
artifact metadata, and graph-sync queue. Graph synchronization is best-effort.

- `GET /api/v1/companion/me` — companion status
- `DELETE /api/v1/companion/me` — self-revoke and delete credentials

## Webhook

### `POST /api/v1/webhooks/dodo`

Requires Standard Webhooks headers: `webhook-id`, `webhook-timestamp`,
`webhook-signature`. The signature is verified against the exact raw body and
the timestamp must be within 5 minutes. Verified `payment.succeeded` events:

1. deduplicate by webhook id (`webhook_events`),
2. resolve the checkout by metadata or provider session id,
3. re-check the server-side product → credit mapping,
4. validate the payment product, currency, and amount against the checkout,
5. upsert the payment,
6. grant credits with idempotency key `dodo:payment:<payment_id>`,
7. mark the checkout completed and the event processed.

Duplicate webhook ids and duplicate payments return success without a second
grant. Permanent data errors are acknowledged so Dodo stops retrying; transient
errors return `500` so Dodo retries.

## Rate limits

Durable Postgres buckets, keyed by user (or IP for unauthenticated pairing):

| Action | Limit |
| --- | --- |
| `companions:pairing` | 5 / 10 min |
| `companion:pair` | 10 / min |
| `projects:create` | 30 / min |
| `projects:delete` | 10 / min |
| `targets:create` | 60 / min |
| `jobs:create` | 30 / min |
| `ai:chat` | 20 / hour |
| `ai:codegen` | 10 / hour |
| `graph:query` | 60 / min |
| `graph:sync` | 10 / min |
| `credits:checkout` | 10 / hour |
| `companion:targets` | 30 / hour |
| `companion:claim` | 3600 / hour |
| `companion:progress` | 600 / hour |
| `companion:artifact` | 120 / hour |
| `companion:result` | 120 / hour |

## Pagination

`limit` defaults to 50 and is capped at 200 (findings: 500). `offset` is capped
at 1,000,000. Invalid values return `400`.
