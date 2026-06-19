#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
STAGE_DIR="$DIST_DIR/chrome-webstore"

VERSION="$(cd "$ROOT_DIR" && node -e 'const fs = require("fs"); console.log(JSON.parse(fs.readFileSync("manifest.json", "utf8")).version);')"
ZIP_PATH="$DIST_DIR/shiki-chrome-webstore-v${VERSION}.zip"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/icons" "$DIST_DIR"

cp "$ROOT_DIR/manifest.json" "$STAGE_DIR/"
cp "$ROOT_DIR/background.js" "$STAGE_DIR/"
cp "$ROOT_DIR/content.js" "$STAGE_DIR/"
cp "$ROOT_DIR/index.html" "$STAGE_DIR/"
cp "$ROOT_DIR/skin.js" "$STAGE_DIR/"
cp "$ROOT_DIR/popup.html" "$STAGE_DIR/"
cp "$ROOT_DIR/popup.js" "$STAGE_DIR/"
cp "$ROOT_DIR/icons/"*.png "$STAGE_DIR/icons/"

find "$STAGE_DIR" -name ".DS_Store" -delete

cd "$STAGE_DIR"
node -e 'const fs = require("fs"); JSON.parse(fs.readFileSync("manifest.json", "utf8"));'
rm -f "$ZIP_PATH"
zip -qr "$ZIP_PATH" .

cd "$ROOT_DIR"
echo "Created $ZIP_PATH"
du -h "$ZIP_PATH"
shasum -a 256 "$ZIP_PATH"
