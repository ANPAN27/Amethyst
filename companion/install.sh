#!/bin/sh
set -eu

VERSION="__AMETHYST_COMPANION_VERSION__"
PACKAGE="amethyst-companion"
INSTALL_SCRIPT="install-amethyst-companion.sh"

BASE_URL="${AMETHYST_COMPANION_BASE_URL:-}"
TARBALL=""
INSTALL_ROOT="${AMETHYST_COMPANION_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/amethyst-companion}"
BIN_DIR="${AMETHYST_COMPANION_BIN_DIR:-$HOME/.local/bin}"
CONFIG_DIR="${AMETHYST_CONFIG_DIR:-$HOME/.amethyst}"
MODE="install"
PURGE="0"

usage() {
  cat <<'USAGE'
Amethyst Companion installer

Usage:
  install-amethyst-companion.sh --base-url URL [options]
  install-amethyst-companion.sh --tarball FILE [options]

Options:
  --base-url URL      Amethyst origin used to download the versioned tarball.
  --tarball FILE      Install a local .tgz instead of downloading one.
  --version VERSION   Companion version to download (default: release version).
  --prefix DIR        Installation directory (default: ~/.local/share/amethyst-companion).
  --bin-dir DIR       Launcher directory (default: ~/.local/bin).
  --uninstall         Remove the installed program and launcher; keep config.
  --purge             With --uninstall, also remove ~/.amethyst companion config.
  -h, --help          Show this help.

Requirements:
  Node.js 22.19 or newer and npm. On Ubuntu, install zenity if you want the
  native folder picker: sudo apt install zenity. The installer never edits
  shell startup files or system packages.

The companion is a CLI that makes outbound requests to Amethyst. It does not
listen on a public port and does not need to be exposed to the internet.
USAGE
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

need_value() {
  [ "$#" -ge 2 ] || fail "$1 requires a value"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base-url)
      need_value "$@"
      BASE_URL="$2"
      shift 2
      ;;
    --tarball)
      need_value "$@"
      TARBALL="$2"
      shift 2
      ;;
    --version)
      need_value "$@"
      VERSION="$2"
      shift 2
      ;;
    --prefix)
      need_value "$@"
      INSTALL_ROOT="$2"
      shift 2
      ;;
    --bin-dir)
      need_value "$@"
      BIN_DIR="$2"
      shift 2
      ;;
    --uninstall)
      MODE="uninstall"
      shift
      ;;
    --purge)
      PURGE="1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1 (use --help)"
      ;;
  esac
done

validate_version() {
  [ -n "$VERSION" ] || fail "Companion version cannot be empty."
  case "$VERSION" in
    *[!0-9A-Za-z._-]*) fail "Invalid companion version: $VERSION" ;;
  esac
}

require_node() {
  command -v node >/dev/null 2>&1 || fail "Node.js 22.19 or newer is required. Install it from https://nodejs.org/ and rerun this installer."
  command -v npm >/dev/null 2>&1 || fail "npm is required. Install Node.js 22.19 or newer, which includes npm."
  node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22 || (a===22 && b>=19) ? 0 : 1)' \
    || fail "Node.js 22.19 or newer is required; found $(node --version)."
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    printf ''
  fi
}

download_file() {
  url="$1"
  destination="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$destination"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$destination"
  else
    fail "curl or wget is required to download the companion."
  fi
}

validate_base_url() {
  [ -n "$BASE_URL" ] || fail "Pass --base-url URL or --tarball FILE."
  node -e '
    const url = new URL(process.argv[1]);
    const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
    if (!["https:", "http:"].includes(url.protocol)) process.exit(1);
    if (url.username || url.password || url.search || url.hash) process.exit(1);
    if (url.pathname !== "/") process.exit(1);
    if (url.protocol === "http:" && !local) process.exit(1);
  ' "$BASE_URL" || fail "Amethyst base URL must be a plain http(s) origin; use HTTPS for non-local servers."
}

install_companion() {
  validate_version
  require_node
  temporary="$(mktemp -d "${TMPDIR:-/tmp}/amethyst-companion.XXXXXX")"
  trap 'rm -rf "$temporary"' EXIT HUP INT TERM

  if [ -z "$TARBALL" ]; then
    validate_base_url
    base="${BASE_URL%/}"
    TARBALL="$temporary/$PACKAGE-$VERSION.tgz"
    url="$base/downloads/$PACKAGE-$VERSION.tgz"
    printf 'Downloading Amethyst companion v%s...\n' "$VERSION"
    download_file "$url" "$TARBALL"
    if download_file "$url.sha256" "$temporary/checksum" 2>/dev/null; then
      expected="$(awk '{print $1}' "$temporary/checksum")"
      actual="$(sha256_file "$TARBALL")"
      if [ -z "$actual" ] || [ "$expected" != "$actual" ]; then
        fail "Companion tarball checksum verification failed."
      fi
      printf 'Checksum verified.\n'
    else
      fail "Companion checksum file is unavailable; refusing to install an unverified artifact."
    fi
  else
    [ -f "$TARBALL" ] || fail "Tarball not found: $TARBALL"
    printf 'Installing local companion tarball: %s\n' "$TARBALL"
  fi

  mkdir -p "$INSTALL_ROOT" "$BIN_DIR"
  rm -rf "$INSTALL_ROOT/node_modules/$PACKAGE"

  printf 'Installing into %s...\n' "$INSTALL_ROOT"
  npm install \
    --prefix "$INSTALL_ROOT" \
    --omit=dev \
    --no-audit \
    --no-fund \
    "$TARBALL" >/dev/null

  cli="$INSTALL_ROOT/node_modules/$PACKAGE/dist/cli.js"
  [ -f "$cli" ] || fail "Installation did not produce $cli"

  launcher="$BIN_DIR/amethyst-companion"
  {
    printf '#!/bin/sh\n'
    printf 'exec node %s "$@"\n' "$(printf '%s' "$cli" | sed "s/'/'\\\\''/g" | sed "s/^/'/;s/$/'/")"
  } > "$launcher"
  chmod 755 "$launcher"

  "$launcher" --help >/dev/null || fail "The installed companion failed its startup check."

  printf '\nAmethyst companion v%s installed.\n' "$VERSION"
  printf '  Program:  %s\n' "$INSTALL_ROOT"
  printf '  Launcher: %s\n' "$launcher"
  printf '  Config:   %s/companion.json\n' "$CONFIG_DIR"
  printf '\nNext steps:\n'
  printf '  amethyst-companion pair --server <your-amethyst-origin> --code <code>\n'
  printf '  amethyst-companion select --project <project-id> --kind javascript_application\n'
  printf '  amethyst-companion run\n'
  printf '\nThe pairing code is created in Amethyst Settings. It expires after 10 minutes.\n'

  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
      printf '\n%s is not on PATH. Add it for bash:\n' "$BIN_DIR"
      printf '  echo '\''export PATH="$HOME/.local/bin:$PATH"'\'' >> ~/.bashrc\n'
      printf '  source ~/.bashrc\n'
      printf 'For zsh, use ~/.zshrc instead. You can also run %s directly.\n' "$launcher"
      ;;
  esac
}

uninstall_companion() {
  rm -rf "$INSTALL_ROOT"
  rm -f "$BIN_DIR/amethyst-companion"
  printf 'Amethyst companion program and launcher removed.\n'
  if [ "$PURGE" = "1" ]; then
    rm -rf "$CONFIG_DIR"
    printf 'Companion configuration removed from %s.\n' "$CONFIG_DIR"
  else
    printf 'Pairing credentials and approved paths remain in %s.\n' "$CONFIG_DIR"
    printf 'Use --purge to remove them. Analysis target projects are never deleted.\n'
  fi
}

case "$MODE" in
  install) install_companion ;;
  uninstall) uninstall_companion ;;
  *) fail "Unknown mode: $MODE" ;;
esac
