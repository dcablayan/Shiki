#!/usr/bin/env bash
set -euo pipefail

# Syncs the canonical extension sources (repo root) into the Safari Web
# Extension's Resources folder. The root files are the single source of truth;
# run this after changing any of them so the Safari build stays in lockstep with
# Chrome. (The Chrome and Safari builds ship the exact same extension code.)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RES_DIR="$ROOT_DIR/safari/Shiki/Shiki Extension/Resources"

if [ ! -d "$RES_DIR" ]; then
  echo "error: Safari Resources dir not found at:" >&2
  echo "  $RES_DIR" >&2
  echo "Generate the project first (see safari/README.md)." >&2
  exit 1
fi

FILES=(manifest.json background.js content.js index.html skin.js popup.html popup.js)

for f in "${FILES[@]}"; do
  cp "$ROOT_DIR/$f" "$RES_DIR/$f"
done

mkdir -p "$RES_DIR/icons"
cp "$ROOT_DIR/icons/"*.png "$RES_DIR/icons/"

find "$RES_DIR" -name ".DS_Store" -delete

# Validate the manifest copied cleanly.
cd "$RES_DIR"
node -e 'const fs = require("fs"); JSON.parse(fs.readFileSync("manifest.json", "utf8"));'

echo "Synced extension sources -> safari/Shiki/Shiki Extension/Resources"
for f in "${FILES[@]}"; do echo "  $f"; done
echo "  icons/*.png"
