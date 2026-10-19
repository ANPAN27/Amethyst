# Amethyst

Amethyst is a backend for evidence-grounded reverse-engineering workflows. A
paired local **companion** runs allowlisted [REA](https://www.npmjs.com/package/rea-agents)
commands against a user-approved local path, then submits normalized findings and
a raw JSON artifact to this server. Supabase stores the authoritative data and
enforces row-level security; TigerGraph is an optional derived graph index; AI
answers cite stored findings only; Dodo Payments webhooks fund a credit ledger.

This repository contains the server (Next.js App Router) and the companion CLI.
It does **not** contain a browser UI beyond minimal status pages.

## Architecture

```
Browser / API client
        |  Supabase access token (Authorization: Bearer)
        v
Next.js route handlers  --->  Supabase Postgres + private Storage
        |                           ^
        |                           |  service role, explicit ownership checks
        |                           |
        +--> TigerGraph (optional)  |
        +--> OpenAI-compatible AI   |
        +--> Dodo Payments          |

Local companion  --claim/progress/upload/result-->  Next.js
        |
        +--> allowlisted REA CLI (no shell)  -->  private JSON artifact
```

- **Postgres is authoritative.** Graph data is rebuildable and never the only
  copy of a finding.
- **The client never writes business data.** Authenticated users have `SELECT`
  only, filtered by RLS. Mutations go through server routes using the service
  role after an ownership check.
- **Credits are a ledger.** `credit_accounts` holds available/reserved totals;
  `credit_transactions` is append-only; reservations are settled atomically in
  SQL functions.
- **Evidence is bounded.** The companion uploads private JSON artifacts, and the
  AI receives only selected stored findings, never whole repositories.
- **Webhooks are verified.** Dodo signatures are checked against the exact raw
  body before any credit is granted.

## Requirements

- Node.js 22.19+ and npm 10+ (the SQLite workflow requires Node.js 24.15+ in
  the 24.x line or Node.js 26+; other workflows run on 22)
- A Supabase project (Postgres 15+; this project was applied on Postgres 17)
- Optional: TigerGraph, an OpenAI-compatible AI provider, Dodo Payments
- A local machine for the companion that can run `npx rea-agents@6.7.0`

## Quick start (server)

```bash
npm install
cp .env.example .env.local
# fill in Supabase URL, anon key, service role key, and HMAC secrets
npm run dev
```

Apply migrations in order with the Supabase CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

The migrations create all tables, RLS policies, SQL functions, and the private
`analysis-artifacts` bucket. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for
production setup.

## Quick start (companion)

```bash
npm run companion:install
npm run companion:build

# In the app: POST /api/v1/companions/pairing to get a one-time code.
node companion/dist/cli.js pair --server https://your-amethyst.example --code XXXX-XXXX-XXXX
node companion/dist/cli.js run
```

The first time a job targets a local path, the companion asks for approval on
the terminal and remembers the real path. Use `--yes` only on a machine where
you intend to auto-approve queued targets.

## Verification performed in this repository

These commands pass locally:

```bash
npm run typecheck          # server and tests
npm run lint
npm test                   # 34 tests: schemas, requests, webhook signatures, normalizer, companion safety
npm run build              # Next.js production build
npm run companion:typecheck
npm run companion:build
```

Database functions were exercised against the live Supabase project inside
rolled-back transactions:

- grant + duplicate grant (idempotent), two reservations, both commits, final
  balance `available=5, reserved=0`, ledger `balance_after` values correct;
- pairing exchange created one companion and one credential digest, consumed
  the code, and rejected a second use;
- `finalize_job` set the job to `succeeded`/`100`, inserted one finding and one
  artifact, and stored the graph payload.

RLS was exercised with the `authenticated` role and a simulated JWT: a user
could see only their own project, target, job, and finding (one each), could not
see another owner's rows, and could not insert into `projects` or `findings`
(privilege denied). RLS is enabled on all 18 public tables. Security advisors
report only the four intentionally policy-less internal tables (privileges are
revoked).

**Verified with real tool runs:** `rea-agents@6.7.0` was executed through the
companion's `runRea` against a small local JavaScript sample (Node 22) and a
SQLite sample (Node 24.15). The JavaScript evidence envelope normalized to 8
entities, 9 relationships, 2 source modules, and 1 package; the SQLite schema
normalized to table entities and findings. A full paired companion-to-server
job was not exercised.

**Not verified end-to-end:** a live TigerGraph upsert/query, a live AI
completion, and a live Dodo checkout/webhook. Those require credentials and
external accounts. See the "Unverified integrations" section in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [API reference](docs/API.md)
- [Security model](docs/SECURITY.md)
- [Deployment and integration checklist](docs/DEPLOYMENT.md)
- [Companion](companion/README.md)
- [TigerGraph schema](tigergraph/README.md)

## License

MIT. See [LICENSE](LICENSE).
