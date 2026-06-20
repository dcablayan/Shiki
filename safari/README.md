# Shiki for Safari

A Safari Web Extension wrapper around the same extension code that ships to
Chrome. Safari extensions must be embedded in a native app and built with Xcode,
so this directory holds an Xcode project (`Shiki/Shiki.xcodeproj`) whose
extension target bundles the repo's extension sources.

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

## Distribution

> **There is no zero-cost "download and double-click" path for Safari.** Unlike
> Chrome, every Safari extension ships inside a macOS app, and Safari will only
> load an extension from an app that is **signed with a Developer ID certificate
> and notarized by Apple** — both of which require the
> [Apple Developer Program](https://developer.apple.com/programs/) ($99/yr).
>
> Without that membership, an app downloaded from a website or GitHub is blocked
> by Gatekeeper, and Safari refuses to load its extension unless the user enables
> *Develop → Allow Unsigned Extensions* (which resets on every Safari restart).
> That is a development aid, not a distribution method.

### Realistic options today (no paid account)

- **Build it yourself / for technical users:** anyone with Xcode can clone the
  repo and follow "Build & run locally" above. This is the only no-cost way for
  someone else to run Shiki in Safari.

### When you enroll in the Apple Developer Program

Two real distribution paths open up:

- **Direct download (GitHub / your website):** archive the **Shiki** scheme
  (Product → Archive), export with a **Developer ID Application** certificate,
  **notarize** with `xcrun notarytool submit --wait`, **staple** with
  `xcrun stapler staple`, then wrap the `.app` in a `.dmg` or `.zip`. Users
  download it, drag it to Applications, open it once, and enable Shiki in
  Safari → Settings → Extensions. This is the "download and run" experience.
- **Mac App Store:** archive and submit through App Store Connect. Easiest trust
  (no Gatekeeper prompt) but goes through review and isn't hosted on your site.

In every case the extension ships **off** — each user enables it once in
Safari → Settings → Extensions and grants per-site access on first use.

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
