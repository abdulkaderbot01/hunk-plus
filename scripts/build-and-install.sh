#!/usr/bin/env bash
# Build the hunk binary and install it on PATH.
#
# Usage:
#   scripts/build-and-install.sh            # install to ~/.local/bin
#   HUNK_INSTALL_DIR=~/bin scripts/build-and-install.sh
#
# This is a thin wrapper around `bun run install:bin` (which already does the
# build and copy) plus a small amount of post-install sanity checking so the
# user gets a clear "what to do next" message instead of a silent failure when
# the install directory is missing from PATH.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: 'bun' is not on PATH. Install Bun 1.3.10+ from https://bun.sh" >&2
  exit 1
fi

# Build + copy the binary to HUNK_INSTALL_DIR (defaults to ~/.local/bin).
bun run install:bin

INSTALL_DIR="${HUNK_INSTALL_DIR:-$HOME/.local/bin}"
INSTALL_BIN="$INSTALL_DIR/hunk"

if [ ! -x "$INSTALL_BIN" ]; then
  echo "error: $INSTALL_BIN is missing or not executable after install" >&2
  exit 1
fi

# Verify the binary actually runs and reports a version.
if ! VERSION_OUTPUT="$("$INSTALL_BIN" --version 2>&1)"; then
  echo "error: $INSTALL_BIN --version failed:" >&2
  echo "$VERSION_OUTPUT" >&2
  exit 1
fi

echo "Installed: $INSTALL_BIN ($VERSION_OUTPUT)"

# Tell the user how to put the install dir on PATH if it isn't already.
PATH_HIT=0
IFS=':' read -r -a PATH_ENTRIES <<<"${PATH:-}"
for entry in "${PATH_ENTRIES[@]}"; do
  if [ -n "$entry" ] && [ "$(cd "$entry" 2>/dev/null && pwd)" = "$(cd "$INSTALL_DIR" 2>/dev/null && pwd)" ]; then
    PATH_HIT=1
    break
  fi
done

if [ "$PATH_HIT" -eq 0 ]; then
  SHELL_NAME="$(basename "${SHELL:-sh}")"
  case "$SHELL_NAME" in
    zsh) RC="$HOME/.zshrc" ;;
    bash) RC="$HOME/.bashrc" ;;
    fish) RC="$HOME/.config/fish/config.fish" ;;
    *) RC="$HOME/.profile" ;;
  esac
  echo
  echo "Next: add $INSTALL_DIR to your PATH by appending this to $RC:"
  echo "    export PATH=\"$INSTALL_DIR:\$PATH\""
  echo "Then open a new shell (or 'source $RC') and run 'hunk --version'."
fi
