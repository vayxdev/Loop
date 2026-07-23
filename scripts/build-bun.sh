#!/usr/bin/env bash
set -euo pipefail

# Build Loop as a single binary using Bun + bun:sqlite.
# This temporarily swaps the SQLite implementation, compiles, then restores.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STORE_DIR="$ROOT_DIR/src/glossary"

cd "$ROOT_DIR"

if ! command -v bun &> /dev/null; then
  echo "Error: bun is not installed. Install from https://bun.sh"
  exit 1
fi

# Determine platform suffix
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
  ARCH="x64"
elif [ "$ARCH" = "arm64" ]; then
  ARCH="arm64"
fi
SUFFIX="${OS}-${ARCH}"
OUT="loop-${SUFFIX}"

# Backup current store.ts and swap in Bun implementation
cp "$STORE_DIR/store.ts" "$STORE_DIR/store.ts.bak"
cp "$STORE_DIR/store-bun.ts" "$STORE_DIR/store.ts"

cleanup() {
  mv "$STORE_DIR/store.ts.bak" "$STORE_DIR/store.ts"
}
trap cleanup EXIT

echo "Building binary: $OUT"
bun build --compile --minify "src/cli.ts" --outfile "$OUT"

echo "Built: $ROOT_DIR/$OUT"
