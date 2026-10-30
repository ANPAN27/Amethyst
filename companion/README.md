# Amethyst companion

The companion is a long-running CLI that claims jobs from an Amethyst server,
runs one of five allowlisted REA workflows against a locally approved path, and
submits normalized findings plus a private JSON artifact.

It never executes arbitrary commands or shell strings supplied by the website.

## Install or upgrade

The recommended installation is the versioned installer served by your
Amethyst deployment. It does not require an Amethyst source checkout and can be
run from any directory on the machine that holds the analysis target.

```bash
curl -fsSLO "https://<your-origin>/downloads/install-amethyst-companion.sh"
sh install-amethyst-companion.sh --base-url "https://<your-origin>"
```

The installer verifies Node.js 22.19+ and npm, downloads
`amethyst-companion-<version>.tgz` and its SHA-256 checksum, installs the
package under `~/.local/share/amethyst-companion`, and writes the
`~/.local/bin/amethyst-companion` launcher. It never edits shell startup files,
installs system packages, or exposes a listening port.

Use `--prefix`, `--bin-dir`, or `--tarball` for custom or offline installs:

```bash
sh install-amethyst-companion.sh --version 0.1.0 --base-url "https://<your-origin>"
sh install-amethyst-companion.sh --tarball ./amethyst-companion-0.1.0.tgz
```

Upgrade by running the current installer again. It replaces the program and
launcher while preserving pairing credentials and approved paths.

If `amethyst-companion` is not found, add `~/.local/bin` to your shell:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

For zsh, use `~/.zshrc`. You can also run the launcher directly:

```bash
~/.local/bin/amethyst-companion --help
```

### Uninstall

```bash
sh install-amethyst-companion.sh --uninstall
# Also delete the local token and approved-path list:
sh install-amethyst-companion.sh --uninstall --purge
```

Uninstalling never deletes analysis target projects.

### Development from this repository

```bash
cd companion
npm install
npm run build
node dist/cli.js --help
```

Maintainers create hosted artifacts with `npm run companion:release`. That
builds and packs the companion into `public/downloads`, writes its SHA-256
checksum, and renders the installer with the current version.

The examples below use the installed command from any directory.

## Pair

Create a one-time pairing code in the app (`POST /api/v1/companions/pairing`),
then:

```bash
amethyst-companion pair --server https://amethyst.example --code ABCD-EFGH-JKLM
```

The token is stored at `~/.amethyst/companion.json` with mode `0600`. The
directory is created with mode `0700`. Override the path with
`AMETHYST_CONFIG`.

## Select a target

```bash
amethyst-companion select --project <project-id> --kind javascript_application
```

The command opens a native folder/file picker on macOS or Linux (`zenity`,
`kdialog`, or `yad`), resolves symlinks, checks readability and target magic
bytes, refuses filesystem roots and the home directory, records explicit local
approval, and registers the target with the server. Install `zenity` on Ubuntu
if no picker is available. For non-interactive runs, pass
`--path /absolute/path`; that flag is itself treated as explicit selection.

Kinds: `javascript_application`, `managed_artifact`, `sqlite_database`,
`go_binary`, `rust_binary`. If `--kind` is omitted for a folder, JavaScript
application is used. Binary kinds accept ELF, Mach-O, or PE executables; SQLite
files require the SQLite header, and managed artifacts require a PE header.

## Approve a target registered from the web

```bash
amethyst-companion approve --path /absolute/path
```

Use this when a target was added through the API or an older dashboard instead
of `select`. It validates the path and stores local approval without registering
a duplicate target. The running worker reloads approvals before each job, so no
restart is needed.

## Run

```bash
amethyst-companion run
```

The first job that targets a local path prompts for approval. Approval is
remembered per real path for that companion. Use `--yes` or
`AMETHYST_AUTO_APPROVE=1` only on a dedicated machine.

For `analyze_javascript_application`, a directory containing `node_modules`,
`.next`, `.git`, or similar dependency/build directories is copied to a
temporary source-only snapshot before REA runs. This prevents dependency and
build trees from overwhelming the analysis or the 25 MB artifact cap. The job
summary records `analysis_scope: "source_only_staged"` and the excluded
directories. ASAR files and directories without those folders are analyzed in
place.

The home directory is refused as a target. Before staging, the companion
inventories the retained source tree and rejects a job that exceeds 25,000
files or 2 GiB; this prevents an accidental parent/home selection from copying
the whole filesystem and sitting at 5% progress. Both limits can be raised for
an intentionally large application.

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
amethyst-companion select ...  # pick and register a local target
amethyst-companion status      # companion identity/status
amethyst-companion doctor      # check Node, config, server, and approved paths
amethyst-companion revoke      # revoke server credentials and delete local config
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
| `AMETHYST_MAX_STAGE_FILES` | `25000` | Maximum retained files before staging |
| `AMETHYST_MAX_STAGE_BYTES` | `2147483648` | Maximum retained bytes before staging |
| `AMETHYST_AUTO_APPROVE` | unset | `1` auto-approves targets |
| `AMETHYST_ALLOW_INSECURE_HTTP` | unset | `1` allows non-local HTTP |

The server URL must be HTTPS unless it is localhost or the insecure override is
explicitly set.

## Safety properties

- Executable + argv array, `shell: false`.
- Fixed command map for the five workflows.
- Workflow parameters are allowlisted and passed as separate arguments.
- Output size cap, process timeout, and JSON parsing.
- Targets must be absolute, exist, be readable, and be approved locally.
- Native selection resolves symlinks and rejects filesystem roots and the home
  directory.
- Staging inventories the retained source tree first, rejects symlinks that
  resolve outside the approved target, and fails broad targets before copying
  any files.
- Unknown REA output shapes produce an honest "not recognized" finding instead
  of fabricated results.
- Temporary output files live in an OS temp directory and are removed after the
  job.

## Node version

The JavaScript, managed-artifact, Go, and Rust workflows run on Node.js 22.19+.
Process supervisors must launch the companion with that runtime, not a distro
Node 18 binary; otherwise REA fails with
`ERR_IMPORT_ASSERTION_TYPE_MISSING`. REA's SQLite inspector requires Node.js
24.15+ in the 24.x line or Node.js 26+;
the companion fails SQLite jobs with `NODE_VERSION_UNSUPPORTED` on older
runtimes instead of invoking an unsupported tool.

## Status

The command builder, selection validation, and normalizer are unit tested, and
`rea-agents@6.7.0` was executed through `runRea` on local JavaScript (Node 22)
and SQLite (Node 24.15) samples. A full paired companion-to-server JavaScript
job was also verified end-to-end: native/path selection, target registration,
job claim, real REA execution, result upload, 5 findings, 10 entities, 12 edges,
and a signed artifact download. The normalizer remains tolerant and will not
invent modules, edges, or findings from unknown shapes.
