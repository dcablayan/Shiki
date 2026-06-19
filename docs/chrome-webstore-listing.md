# Chrome Web Store Listing Worksheet

This is reviewer-facing copy and dashboard content. It has not been applied to the frontend or manifest.

## Store metadata

Recommended title:

Shiki - AI Chat Document View

Short description:

Turn ChatGPT, Claude, and Gemini conversations into a focused document workspace in your browser.

Category:

Productivity

Language:

English

Support email:

dylancablayan07@gmail.com

Publisher/developer display:

Lapetus Software

Homepage/support URL:

https://github.com/dcablayan/Shiki/issues

Privacy policy URL:

https://github.com/dcablayan/Shiki/blob/main/PRIVACY.md

## Detailed description

Shiki turns supported AI chat pages into a focused document workspace directly in Chrome. It overlays ChatGPT, Claude, and Gemini with a clean writing surface, conversation sidebar, rich message formatting, image support, and local-only chat organization.

Core features:

- Render the active AI conversation as a document.
- Switch between conversations from a local sidebar.
- Send prompts from the document composer through the AI site's real composer.
- Preserve rich formatting for headings, lists, code blocks, links, quotes, tables, and images.
- Attach images to supported AI chats from the document workspace.
- Pin, rename, or hide chats locally without modifying or deleting anything on the AI provider.
- Store preferences locally in Chrome.

Shiki has no account system, backend, analytics, ads, or telemetry. It runs in the browser and uses supported AI websites only when the user opens those websites.

Shiki is published by Lapetus Software. It is not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, Google, ChatGPT, Claude, or Gemini. ChatGPT is a trademark of OpenAI. Claude is a trademark of Anthropic. Gemini is a trademark of Google LLC. Use of these marks is for compatibility description only.

## Privacy tab

Single purpose:

Shiki reformats supported AI chat pages into a focused document workspace in the user's browser, with local settings and local-only conversation organization.

Remote code:

No. Shiki does not execute remotely hosted code. All executable JavaScript is included in the extension package. Shiki may display image resources already present on the supported AI page, but those resources are not executable logic.

Data handling summary:

Shiki handles website content and user-provided content from supported AI chat pages so it can render conversations, submit user-requested prompts, attach user-selected images, switch conversations, and persist local display preferences. Shiki does not send data to developer-controlled servers and does not sell, transfer, or use data for advertising.

Permission justification:

`storage`: Used to save the enabled state, formatting preferences, image-button preference, local chat pins/aliases/hidden-chat settings, and optional custom profile picture in Chrome local extension storage.

Host permissions:

`https://chatgpt.com/*` and `https://chat.openai.com/*`: Required to run Shiki on ChatGPT pages, read the visible conversation UI, render the document workspace, switch conversations, and submit user-requested prompts or image attachments through the page's own composer.

`https://claude.ai/*`: Required to run Shiki on Claude pages, read the visible conversation UI, render the document workspace, switch conversations, and submit user-requested prompts or image attachments through the page's own composer.

`https://gemini.google.com/*`: Required to run Shiki on Gemini pages, read the visible conversation UI, render the document workspace, switch conversations, and submit user-requested prompts or image attachments through the page's own composer.

## Test instructions

Shiki does not require a Shiki account. To test:

1. Install the extension.
2. Open `https://chatgpt.com`, `https://claude.ai`, or `https://gemini.google.com`.
3. Sign in with a reviewer-owned account for that AI provider.
4. Open any existing or new conversation.
5. Confirm Shiki displays the conversation as a document workspace.
6. Use the extension popup to toggle the workspace, sync the conversation, and toggle rich formatting.
7. Type a short test prompt in the Shiki composer and press Enter. Confirm the prompt is submitted through the AI site's normal composer.
8. Use the sidebar to switch conversations if the account has multiple chats.

If testing paid-provider-only model options, use an account that already has access to those provider features. Shiki does not bypass provider account restrictions.

## Asset checklist

- 128x128 store icon: `store-assets/store-icon-128.png`.
- Screenshots: `store-assets/screenshot-workspace-1280x800.png` and `store-assets/screenshot-compose-1280x800.png`.
- Small promo tile: `store-assets/small-promo-440x280.png`.
- Marquee promo tile: `store-assets/marquee-promo-1400x560.png`.
- Promotional video: optional unless the dashboard requests one.
