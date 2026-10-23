# Security model

## Trust boundaries

| Component | Trust |
| --- | --- |
| Supabase Auth | Identity source; access tokens are verified server-side |
| Next.js server | Trusted; holds the service role and HMAC secrets |
| Postgres | Authoritative; RLS and SQL functions enforce invariants |
| Companion | Semi-trusted; holds a scoped bearer token and local filesystem access |
| REA output | Untrusted data; parsed defensively and never executed |
| Findings / evidence | Untrusted data; treated as data by the AI layer |
| Dodo webhook body | Untrusted until the signature is verified |
| Browser | Untrusted for authorization decisions |

## Authentication and authorization

- User identity comes only from a Supabase access token or session cookie. No
  route accepts `user_id` from a request body.
- Every project-scoped route calls `requireProject`, which filters by both
  `id` and `owner_id`. Another owner's resource returns `404`.
- Companion requests use a separate `amc_` bearer token. The token is checked
  against an HMAC-SHA256 digest in `companion_credentials`, joined to the
  companion owner and status. Revoked companions fail immediately.
- Pairing codes are 12 symbols from a 32-character alphabet, normalized,
  HMAC-hashed, single-use, and expire after 10 minutes. Exchange happens in one
  `SECURITY DEFINER` transaction, so two concurrent exchanges cannot both win.
- Authenticated users receive `SELECT` only. `INSERT`, `UPDATE`, `DELETE`,
  `TRUNCATE`, `REFERENCES`, and `TRIGGER` are revoked on every public table;
  all mutations go through server routes with explicit ownership checks.
- `webhook_events`, `pairing_codes`, `companion_credentials`, and `rate_limits`
  have no client grants at all.

## Row-level security

RLS is enabled on all 18 public tables. Owner-read policies cover profiles,
projects, targets, companions, jobs, artifacts, findings, graph sync, AI runs,
credit accounts/transactions/reservations, checkout sessions, and payments.
RLS is defense in depth: server queries also filter by owner because they use
the service role.

## Credits

- `credit_accounts.available` and `reserved` are checked non-negative at the
  database level.
- All credit operations run in `SECURITY DEFINER` SQL functions executable only
  by `service_role`, with `search_path = ''` and fully qualified names.
- `reserve_credits`, `commit_reservation`, `release_reservation`, and
  `grant_credits` lock the account/reservation rows and re-check idempotency
  under the lock.
- `credit_transactions` is append-only from the application's perspective; the
  ledger is the audit trail.
- AI routes reserve before the provider call and commit only on success.
  Provider failures release the reservation.
- The browser never chooses a credit amount, product price, or grant. The
  product → credits map is server-side.

## Payments and webhooks

- Dodo signatures are verified with `standardwebhooks` against the **raw**
  request body. A JSON re-serialization is never used.
- Timestamps older/newer than 5 minutes are rejected to limit replay.
- Webhook ids are stored as unique primary keys; duplicate deliveries are
  acknowledged without re-granting.
- The payment id is the ledger idempotency key, so a duplicate event for the
  same payment cannot double-credit.
- The handler re-resolves the checkout and the server-side product mapping. It
  never trusts a credit amount from the webhook.
- The checkout stores the Dodo product price/currency server-side. Successful
  payments must match the product, currency, and at least the expected amount.
- Payment receipts (`invoice_url`) and payment method metadata are stored only
  from the verified webhook payload and are rendered as external links with
  `rel="noreferrer"`.
- The return URL / success page is cosmetic. Credits are never granted from a
  redirect.

## Local companion

- The companion only runs the five allowlisted REA workflows. Commands are
  passed as an executable plus an argument array with `shell: false`; no URL,
  body field, or finding can become an arbitrary command or shell fragment.
- Workflow parameters are allowlisted in the server schema and again in the
  companion command builder.
- A target path must be absolute, must exist, be readable, and is resolved with
  `realpath`. Native selection rejects filesystem roots and the Amethyst
  repository, and checks SQLite/PE/ELF/Mach-O headers before registration.
  Approval is remembered per real path. `--yes` is an explicit opt-in for
  unattended operation.
- REA output is size-capped, has a timeout, and is parsed as JSON. Invalid or
  unknown output produces an honest "no recognized inventory" finding rather
  than fabricated data.
- The companion config is written atomically with mode `0600`; the directory is
  `0700`. The token is stored in plaintext locally, protected by filesystem
  permissions, because it must be presented on each request. Revoking a
  companion deletes the server-side digest.
- The companion refuses plaintext HTTP for non-local servers unless
  `AMETHYST_ALLOW_INSECURE_HTTP=1` is explicitly set.

## Artifacts and AI

- The storage bucket is private, JSON-only, and size-capped. Clients never
  receive storage credentials; the companion gets a short-lived signed upload
  URL and users get short-lived signed download URLs for their own artifacts.
- The server verifies the uploaded artifact's size and SHA-256 before recording
  it. A path must stay under the job's `project/job/` prefix.
- Only bounded stored findings (not repositories or binaries) are sent to the
  AI provider. The context is truncated and control tokens are stripped.
- The server refuses to send finding evidence unless the request includes
  explicit consent (`consent_to_send_evidence: true`); the UI requires a
  checkbox and resets it when the project or selection changes.
- The system prompt tells the model that evidence is untrusted and must never be
  followed as instructions. This mitigates, but cannot eliminate, prompt
  injection; answers are labeled with `grounding` and citations.
- Model-supplied citation ids are filtered to evidence ids actually supplied in
  that request.
- Generated code is returned with `applied: false`; the server never writes it
  to the user's machine.

## Secrets and logging

- `SUPABASE_SERVICE_ROLE_KEY`, `PAIRING_CODE_SECRET`,
  `COMPANION_TOKEN_SECRET`, `AI_API_KEY`, `DODO_PAYMENTS_API_KEY`,
  `DODO_PAYMENTS_WEBHOOK_KEY`, and `TIGERGRAPH_TOKEN` are server-only and are
  never prefixed with `NEXT_PUBLIC_`.
- `.env*` is gitignored except `.env.example`, which contains placeholders only.
- API errors log only status, code, and a safe message. Request bodies, pairing
  codes, bearer tokens, and provider secrets are not logged.
- The Dodo webhook logs only a fixed message and a sanitized permanent-error
  reason.

## Known limitations

- Session-cookie mutations rely on the Supabase cookie's `SameSite` behavior;
  there is no separate CSRF token. Clients using bearer tokens are not
  CSRF-prone. If you enable cross-site cookie use, add an explicit CSRF check.
- The unauthenticated pairing endpoint rate-limits by `x-forwarded-for` /
  `x-real-ip`. Deploy behind a proxy that overwrites these headers, or the
  limiter can be evaded. The high-entropy pairing code remains the primary
  control; the limiter is secondary.
- Artifact contents are not malware-scanned. Treat downloaded JSON as
  untrusted.
- AI and TigerGraph availability are external dependencies. Graph sync failure
  does not lose findings; it is recorded and can be retried.
- External integrations (real REA output shape, live TigerGraph, live AI, live
  Dodo webhook) were not exercised in this environment. Validate them in a
  staging deployment before relying on them.
