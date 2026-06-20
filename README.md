# Shiki - Docs Style for AI Chat

Shiki is a browser extension that reskins AI chat pages to look and feel like a
Docs-style document. Your conversation becomes the document body, the chat list
becomes a document sidebar, and replies are rendered as clean, formatted prose.

It works as a full-page overlay on top of the supported AI sites and mirrors
their state (conversation list, active chat, model name) into the Docs-style
surface. Everything runs locally in your browser -- no accounts, no servers, no
telemetry.

## Why I built it

I saw a project with a similar idea, but simple features were locked behind a
subscription and, beyond sending a chat, it did not feel useful enough for the
way I wanted to work. So I built Shiki myself and made it free.

AI is part of the daily workflow now, but AI chat tabs still do not always look
or feel like focused work. Shiki turns those conversations into a familiar
Docs-style workspace: calmer, more organized, and easier to keep open while you
think, write, research, or draft.

If you are going to spend all day working with AI anyway, why not make it feel
like working in a document editor?

## Supported sites

- ChatGPT — `chatgpt.com`, `chat.openai.com`
- Claude — `claude.ai`
- Gemini — `gemini.google.com`

Provider page structures change often, so the adapters are intentionally
defensive and fall back gracefully when something can't be found.

## Current scope

Shiki v1 is packaged for **Google Chrome** and **Safari on macOS** from the same
WebExtension source tree:

- **Safari on macOS** is available now through Apple's local, unsigned Safari
  Web Extension flow. No paid Apple Developer Program account is required for
  the supported local install path. See
  [Safari installation](docs/safari-install.md) and
  [`safari/`](safari/README.md).
- **Google Chrome** support is prepped for Chrome Web Store launch. The official
  Chrome Web Store download is coming soon, estimated late June 2026.

The Chrome and Safari builds ship the exact same extension code -- the JS, HTML,
and `manifest.json` are identical files, and Safari aliases the `chrome.*` APIs.
It may also work in other Chromium-based browsers, but Chrome and Safari are the
supported paths for this launch.

## Features

- **Docs-style surface** -- your active conversation rendered as a document, with
  a Docs-style header, toolbar, ruler, and sidebar.
- **Conversation switcher** -- the host's chats appear in the left sidebar; click
  to switch, and scroll to the bottom to load older chats.
- **Rich formatting** -- assistant replies are rebuilt from the page's rendered
  markdown into headings, lists, code blocks, tables, quotes, and links. Toggle
  it off for plain text.
- **Images** -- generated and uploaded images appear inline in the document, and
  you can attach photos to a message (click the photo button, paste, or drag and
  drop) to send them to the underlying chat.
- **Send from the document** -- type in the page and press Enter; Shiki relays the
  message to the site's real composer. Shift+Enter inserts a newline.
- **Pin, rename, hide chats** -- lightweight, local-only organization of the
  sidebar (these never modify or delete anything on the provider).
- **Custom profile picture** -- click the avatar in the header (or use the popup)
  to set your own image.
- **Load older messages** -- scroll to the top of a conversation to pull in
  earlier turns.

## Install

### Safari on macOS

Safari installation currently uses the checked-in Xcode wrapper in `safari/`.
You need macOS, Safari, and Xcode, but you do not need a paid Apple Developer
Program account.

1. Clone or download this repo.
2. From the repo root, sync the shared extension files into the Safari wrapper:

   ```sh
   ./scripts/sync-safari-resources.sh
   ```

3. Open the Safari project:

   ```sh
   open safari/Shiki/Shiki.xcodeproj
   ```

4. In Xcode, run the Shiki macOS app. If Xcode asks about signing, use local
   signing for your Mac; App Store distribution and the $99 Apple Developer
   Program are not needed for this install path.
5. In Safari, enable unsigned extensions for local testing, then enable Shiki in
   Safari's Extensions settings and grant access to the supported AI sites.

For the full Safari walkthrough, see
[docs/safari-install.md](docs/safari-install.md).

### Chrome

The official Chrome Web Store download is coming soon, estimated late June 2026.
After the listing is live, install Shiki from the Chrome Web Store, then open
ChatGPT, Claude, or Gemini. Shiki should appear automatically.

The style is enabled by default. Toggle it from the extension popup or with
`Command+Shift+D`.

## Onboarding: first run

After installing Shiki, pin it or keep it visible in your browser toolbar so the
toggle and settings stay easy to reach. Then open ChatGPT, Claude, or Gemini and
start from any existing or new conversation. Shiki will turn the chat into a
document view automatically.

1. Open a supported AI site and sign in normally.
2. Wait for the Docs-style surface to appear over the page.
3. Use the left sidebar to switch conversations, pin important chats, or rename
   them locally.
4. Type in the document composer and press Enter to send. Use Shift+Enter for a
   new line.
5. Open the extension popup to toggle the style, refresh conversation sync, adjust
   rich formatting, or set a custom profile picture.

If a provider updates its page and something looks off, click **Conversation
sync** in the popup or reload the tab. Your chats remain on the original AI site;
Shiki only changes the interface in your browser.

## Report a bug

If Shiki breaks, looks weird, or stops syncing on one of the supported sites,
send a bug report to
[dylancablayan07@gmail.com](mailto:dylancablayan07@gmail.com?subject=Shiki%20bug%20report).

Please include which site you were using, what happened, and the steps that made
it happen if you can reproduce it. Screenshots are helpful too.

## Settings (popup)

- **Docs style** -- show/hide the style.
- **Conversation sync** -- re-scan the current page.
- **Rich formatting** -- switch between formatted document rendering and plain
  text. Persists across tabs.
- **Profile picture** -- set a custom avatar (image <= 1 MB) or reset to default.

## How it works

A content script reads the current AI page -- its conversation links, active
chat, model label, and the rendered message DOM -- and posts that state into an
extension page rendered as a full-screen overlay (`index.html` + `skin.js`). The
overlay rebuilds the conversation as a document. Actions in the overlay (send a
message, switch chats, attach a photo, load more) are relayed back to the page
and driven through the site's own controls, so navigation stays client-side.

Assistant markdown is parsed into a small, structured block model and re-rendered
via text nodes only -- raw page HTML is never injected into the overlay.

## Privacy

Everything stays in your browser. Shiki has no backend and sends no data
anywhere. Your settings (enabled state, profile picture, pins, renames) are
stored with your browser's local extension storage. The only network requests
are the ones the AI site itself makes.

## Limitations

- Provider DOMs change frequently; if a site updates its layout, conversation
  detection, sending, or image handling may need selector updates (the relevant
  spots are commented in `content.js`).
- Attaching photos is best-effort: Shiki injects images into the site's real
  composer (file input first, then a synthetic drop). Some sites may handle this
  differently, in which case the attachment can fail with a notice.
- Some host-generated images use short-lived `blob:` URLs; Shiki converts these
  to inline images when it can, but conversion isn't always possible.

## Project layout

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (MV3) |
| `background.js` | Service worker -- install defaults and the toggle command |
| `content.js` | Reads the AI page and bridges actions to it |
| `index.html` | The Docs-style overlay markup and styles |
| `skin.js` | Overlay logic (rendering, sending, attachments, settings) |
| `popup.html` / `popup.js` | Toolbar popup settings |
| `icons/` | Extension icons |
| `safari/` | Safari Web Extension Xcode project (macOS) — see [`safari/README.md`](safari/README.md) |

The root files above are the single source of truth. The Safari project bundles
copies of them under `safari/Shiki/Shiki Extension/Resources/`; run
`./scripts/sync-safari-resources.sh` after editing any root file to keep the
Safari build in sync.

## Packaging a release

To produce a distributable zip of the Chrome extension from the current sources:

```sh
./scripts/package-webstore.sh
```

For Safari, use the local Xcode wrapper in `safari/`. The supported no-fee path
is building and running it locally with unsigned extensions enabled; a paid Apple
Developer Program account is not required for that path.
