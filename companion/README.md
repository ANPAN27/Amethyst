# Amethyst companion

The companion is a long-running CLI that claims jobs from an Amethyst server,
runs one of five allowlisted REA workflows against a locally approved path, and
submits normalized findings plus a private JSON artifact.

It never executes arbitrary commands or shell strings supplied by the website.

## Build

```bash
npm install
npm run build
```

From the repository root you can also run `npm run companion:install` and
`npm run companion:build`.

## Pair

Create a one-time pairing code in the app (`POST /api/v1/companions/pairing`),
then:

```bash
node dist/cli.js pair --server https://amethyst.example --code ABCD-EFGH-JKLM
```

The token is stored at `~/.amethyst/companion.json` with mode `0600`. The
directory is created with mode `0700`. Override the path with
`AMETHYST_CONFIG`.

## Run

```bash
node dist/cli.js run
```

The first job that targets a local path prompts for approval. Approval is
remembered per real path for that companion. Use `--yes` or
`AMETHYST_AUTO_APPROVE=1` only on a dedicated machine.

Options:

```
--once                 claim and process at most one job
--interval SECONDS     poll interval (2-60, default 5)
--yes                  auto-approve target paths
```

The server gives each claimed job a 30-minute lease. The companion refreshes it
on each progress update and requeues expired leases for the same companion.
Jobs are processed sequentially by one process.

## Commands

```bash
node dist/cli.js status      # companion identity/status
node dist/cli.js revoke      # revoke server credentials and delete local config
```

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `REA_BIN` | unset | Existing REA executable, overrides npx |
| `REA_PACKAGE` | `rea-agents@6.7.0` | Pinned npx package |
| `REA_VERSION` | unset | Recorded in job summaries |
| `AMETHYST_CONFIG` | `~/.amethyst/companion.json` | Config path |
| `AMETHYST_JOB_TIMEOUT_MS` | `900000` | Per-job timeout |
| `AMETHYST_MAX_ARTIFACT_BYTES` | `26214400` | Local output cap |
| `AMETHYST_AUTO_APPROVE` | unset | `1` auto-approves targets |
| `AMETHYST_ALLOW_INSECURE_HTTP` | unset | `1` allows non-local HTTP |

The server URL must be HTTPS unless it is localhost or the insecure override is
explicitly set.

## Safety properties

- Executable + argv array, `shell: false`.
- Fixed command map for the five workflows.
- Workflow parameters are allowlisted and passed as separate arguments.
- Output size cap, process timeout, and JSON parsing.
- Targets must be absolute, exist, and be approved locally.
- Unknown REA output shapes produce an honest "not recognized" finding instead
  of fabricated results.
- Temporary output files live in an OS temp directory and are removed after the
  job.

## Node version

The JavaScript, managed-artifact, Go, and Rust workflows run on Node.js 22.19+.
REA's SQLite inspector requires Node.js 24.15+ in the 24.x line or Node.js 26+;
the companion fails SQLite jobs with `NODE_VERSION_UNSUPPORTED` on older
runtimes instead of invoking an unsupported tool.

## Status

The command builder and normalizer are unit tested, and
`rea-agents@6.7.0` was executed through `runRea` on local JavaScript (Node 22)
and SQLite (Node 24.15) samples. Both evidence envelopes normalized correctly.
The normalizer remains tolerant and will not invent modules, edges, or findings
from unknown shapes. A full companion-to-server job was not exercised.
