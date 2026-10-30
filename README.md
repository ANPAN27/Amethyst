# Amethyst

Amethyst is a backend for evidence-grounded reverse-engineering workflows. A
paired local **companion** runs allowlisted [REA](https://www.npmjs.com/package/rea-agents)
commands against a user-approved local path, then submits normalized findings and
a raw JSON artifact to this server. Supabase stores the authoritative data and
enforces row-level security; TigerGraph is an optional derived graph index; AI
answers cite stored findings only; Dodo Payments webhooks fund a credit ledger.

This repository contains the server (Next.js App Router), an authenticated web
dashboard, and the companion CLI. The dashboard manages projects, targets,
companion pairing, jobs, findings, artifact downloads, and evidence-grounded AI
chat/code generation. It calls the same versioned API that other clients use.

## Architecture

```
Browser dashboard / API client
        |  Supabase access token (Authorization: Bearer)
        v
Next.js route handlers  --->  Supabase Postgres + private Storage
        |                           ^
        |                           |  service role, explicit ownership checks
        |                           |
        +--> TigerGraph (optional)  |
        +--> AI (OpenAI or Gemini)  |
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
- Optional: TigerGraph, Gemini or an OpenAI-compatible AI provider, Dodo Payments
- A local machine for the companion that can run `npx rea-agents@6.7.0`

## Quick start (server)

```bash
npm ci
cp .env.example .env.local
# fill in Supabase URL, anon key, service role key, and HMAC secrets
npm run dev
# open http://localhost:3000, create an account, and sign in
```

The dashboard requires `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. If either is missing, the app renders a setup
page instead of crashing. Enable email/password auth in Supabase Auth if you
want to use the built-in sign-up form.

Apply migrations in order with the Supabase CLI:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

The migrations create all tables, RLS policies, SQL functions, and the private
`analysis-artifacts` bucket. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for
production setup.

## Quick start (companion)

Install the standalone companion on the machine that holds the target. It does
not require a clone of this repository.

```bash
curl -fsSLO "https://<your-origin>/downloads/install-amethyst-companion.sh"
sh install-amethyst-companion.sh --base-url "https://<your-origin>"
```

The installer verifies Node.js 22.19+ and npm, checks the versioned tarball
checksum, installs under `~/.local/share/amethyst-companion`, and writes the
`~/.local/bin/amethyst-companion` launcher. Upgrade by rerunning the current
installer; pairing credentials and approved paths are preserved.

```bash
# If the command is not found, add ~/.local/bin to your shell PATH:
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Or run it directly without changing PATH:
~/.local/bin/amethyst-companion --help
```

Then, from any directory:

```bash
# Create a one-time pairing code in Settings, then:
amethyst-companion pair --server https://your-amethyst.example --code XXXX-XXXX-XXXX

# Create a project, then select a local target on the companion machine:
amethyst-companion select --project <project-id> --kind javascript_application

# If the target was registered from the web instead of `select`, approve it:
amethyst-companion approve --path /absolute/path

# Keep the worker running:
amethyst-companion run

# Diagnose Node, configuration, server connectivity, and approved paths:
amethyst-companion doctor
```

`select` opens a native folder/file picker on macOS or Linux (`zenity`,
`kdialog`, or `yad`), validates the path locally, records explicit approval, and
registers the target with the project. Install `zenity` on Ubuntu if no picker
is available. For automation, `--path /absolute/path` skips the picker. The
dashboard's Targets tab shows the install, pair, select, and run commands for
the selected target kind and detects the new target automatically.

To uninstall, run the installer with `--uninstall`; add `--purge` to remove the
local token and approved-path list. Analysis target projects are never deleted.

For JavaScript applications, the companion analyzes a temporary source-only
snapshot when the selected folder contains `node_modules`, `.next`, `.git`, or
similar dependency/build directories. This keeps REA focused on application
code and keeps the raw artifact below the server cap; the job summary records
`analysis_scope` and the excluded directories. The home directory is refused,
and a bounded pre-copy inventory rejects targets above 25,000 retained files or
2 GiB so a parent-folder selection cannot copy an entire home directory.

The companion never reads browser-selected files or executes arbitrary
commands. Use `--yes` only on a dedicated machine where you intend to
auto-approve queued target paths.

## Verification performed in this repository

These commands pass locally:

```bash
npm run typecheck          # server and tests
npm run lint
npm test                   # 144 tests: schemas, requests, webhook signatures, normalizer, AI providers, UI helpers, payments, auth flow, standalone install, companion safety, selection and staging
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

**Verified with safe live test accounts:** the responsive dashboard was exercised
at desktop and mobile widths through the production build. Supabase password
login/logout, project creation through the UI, cross-owner authorization (404),
target registration, companion pairing-code issuance, and signed-out redirects
were all confirmed. Test accounts and all owned rows were removed afterward.

**Verified with real Gemini calls:** live chat and code-generation requests were
sent through the application's server routes against a confirmed test account.
Chat returned `grounding=insufficient` with no evidence and charged 1 credit;
codegen returned review-only TypeScript with `applied=false` and charged 5
credits. Both `ai_runs` audit records and the resulting ledger balance were
verified, then removed with the test account.

**Verified with real tool runs:** `rea-agents@6.7.0` was executed through the
companion's `runRea` against a small local JavaScript sample (Node 22) and a
SQLite sample (Node 24.15). The JavaScript evidence envelope normalized to 8
entities, 9 relationships, 2 source modules, and 1 package; the SQLite schema
normalized to table entities and findings.

**Verified with a full paired companion job:** a temporary account and project
were paired to a companion, a harmless JavaScript project outside this
repository was selected through the new companion path, and the queued
`analyze_javascript_application` job ran through `rea-agents@6.7.0`. The job
reached `succeeded`/`100` with 5 findings, 10 graph entities, 12 edges, and a
140,503-byte artifact whose signed download parsed successfully. The AI evidence
gate rejected an unapproved chat request with
`400 evidence_consent_required` before any provider call or credit charge. The
companion was revoked and all test rows were removed.

**Not verified end-to-end:** a live TigerGraph upsert/query and a live Dodo
checkout/webhook. Those require external services. Managed-artifact, Go, and
Rust workflows also remain unverified without sample artifacts. See the
"Unverified integrations" section in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

Supabase's sign-up email endpoint returned `429 over_email_send_rate_limit`
during verification. The signup form and expected confirmation states were
checked, but a new confirmation email could not be delivered in this session.

## Documentation

- [API reference](docs/API.md)
- [Security model](docs/SECURITY.md)
- [Deployment and integration checklist](docs/DEPLOYMENT.md)
- [Companion](companion/README.md)
- [TigerGraph schema](tigergraph/README.md)

## License

MIT. See [LICENSE](LICENSE).
