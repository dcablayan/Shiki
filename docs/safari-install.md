# Safari Installation

Shiki can run in Safari through the checked-in Xcode Web Extension wrapper in
`safari/`. This is the current Safari path for local, unsigned installation and
testing on macOS.

You do not need a paid Apple Developer Program account for this flow. The $99
program is only needed for App Store distribution, which Shiki is not using for
Safari right now.

The official Chrome Web Store download is coming soon, estimated late June 2026.

## Requirements

- macOS with Safari.
- Xcode installed and opened at least once.
- This repository cloned or downloaded locally.

A free Apple ID may help if Xcode asks for a personal signing team, but paid
developer enrollment is not required for a local macOS build.

## Build the Safari wrapper

From the repo root, sync the shared extension files into the Safari wrapper:

```sh
./scripts/sync-safari-resources.sh
```

Then open the Safari Xcode project:

```sh
open safari/Shiki/Shiki.xcodeproj
```

## Enable Shiki in Safari

1. In Xcode, select the Shiki macOS app scheme and click Run.
2. If Xcode asks about signing, keep it local:
   - For a macOS-only local build, use Sign to Run Locally when available.
   - If Xcode asks for a team, choose your free Personal Team. Do not enroll in
     the paid Apple Developer Program for this local install path.
3. Open Safari.
4. Go to Safari > Settings > Advanced and enable Show features for web
   developers. On older Safari versions, enable Show Develop menu in menu bar.
5. From Safari's Develop menu, choose Allow Unsigned Extensions.
6. Go to Safari > Settings > Extensions and enable Shiki.
7. Grant Shiki access to the supported sites you want to use:
   `chatgpt.com`, `chat.openai.com`, `claude.ai`, and `gemini.google.com`.
8. Open ChatGPT, Claude, or Gemini. Shiki should appear over the page
   automatically.

Safari may require Allow Unsigned Extensions again after Safari restarts. That is
normal for local development builds.

There is no paid-account Safari distribution planned for this path. A normal
signed direct-download Safari app would require Apple Developer Program
membership, so Shiki's no-fee Safari install is the local Xcode build above.

## Troubleshooting

- If Shiki does not appear, confirm the Shiki macOS app is running and the
  extension is enabled in Safari > Settings > Extensions.
- If Xcode shows signing errors, check the macOS app target first and choose
  local signing or a free Personal Team. Avoid App Store distribution settings.
- If Safari prompts for website permissions, allow Shiki on the supported AI
  sites.
- If a provider page updates and the document view looks stale, use the extension
  popup's Conversation sync action or reload the tab.
