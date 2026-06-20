# Shiki for Safari

A Safari Web Extension wrapper around the same extension code that ships to
Chrome. Safari extensions must be embedded in a native app and built with Xcode,
so this directory holds an Xcode project (`Shiki/Shiki.xcodeproj`) whose
extension target bundles the repo's extension sources.

This is the supported no-fee Safari install path. You do not need a paid Apple
Developer Program account to clone the repo, build locally in Xcode, and enable
Shiki as an unsigned Safari extension.

The official Chrome Web Store download is coming soon, estimated late June 2026.

The extension behaves identically to the Chrome build — the JavaScript, HTML,
and `manifest.json` are byte-for-byte the same files. Safari aliases the
`chrome.*` extension APIs, so no code changes were needed.

- **Host app bundle id:** `com.shiki.docsstyle`
- **Extension bundle id:** `com.shiki.docsstyle.Extension`
- **Platform:** macOS only
- **Min requirement:** macOS with Safari 16.4+ and Xcode 15+

## Single source of truth

The canonical extension files live in the **repo root** (`manifest.json`,
`content.js`, `skin.js`, `index.html`, `popup.html`, `popup.js`,
`background.js`, `icons/`). The copies under
`Shiki/Shiki Extension/Resources/` are generated.

After editing any root file, re-sync before building:

```sh
./scripts/sync-safari-resources.sh
```

This keeps the Safari build in lockstep with Chrome.

## Build & run locally

1. Open `safari/Shiki/Shiki.xcodeproj` in Xcode.
2. Select the **Shiki** scheme, then a signing team:
   - Select the **Shiki** target → Signing & Capabilities → **Team**.
   - A free personal Apple ID team is enough for local runs. Do the same for
     the **Shiki Extension** target.
3. Build & Run (`⌘R`). The host app launches with a "turn on in Safari" page.
4. Enable the extension in Safari:
   - Safari → Settings → **Extensions** → enable **Shiki**.
   - For an unsigned/dev build you must first enable Safari's Develop menu
     (Safari → Settings → Advanced → "Show features for web developers"), then
     **Develop → Allow Unsigned Extensions** (resets on each Safari restart).
5. Open ChatGPT, Claude, or Gemini. On first use Safari will ask to grant the
   extension permission for that site — choose **Always Allow on This Website**.

The toolbar popup and the `⌘⇧D` toggle work the same as in Chrome. (Custom
keyboard shortcuts in Safari may need to be confirmed under Safari → Settings →
Extensions.)

## Distribution note

Shiki is not currently distributed as a signed Safari download or Mac App Store
app. Unlike Chrome, Safari Web Extensions ship inside macOS apps, and a normal
public download requires paid Apple signing and notarization. That is not the
plan for this no-fee Safari path.

For Safari, users should clone the repo, build the checked-in Xcode project
locally, enable unsigned extensions, and grant per-site access on first use.

## Regenerating the project

The project was generated with Apple's converter against a clean copy of the
root extension files:

```sh
xcrun safari-web-extension-converter <clean-extension-dir> \
  --project-location safari \
  --app-name "Shiki" \
  --bundle-identifier com.shiki.docsstyle \
  --macos-only --swift --copy-resources --no-open --no-prompt --force
```

If you regenerate, re-apply the host app's bundle id (`com.shiki.docsstyle`) so
it stays the prefix of the extension's id, then run the sync script.
