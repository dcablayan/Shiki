# Chrome Web Store Prep

Last reviewed: June 24, 2026.

Launch note: Shiki v1.2 is the public Chrome Web Store release. Chrome Web Store
is the only currently available public distribution path; Safari is coming soon.

## Official requirements checked

- Chrome Web Store Program Policies: https://developer.chrome.com/docs/webstore/program-policies/policies
- Manifest V3 additional requirements: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- Privacy fields: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- User Data FAQ: https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- Publishing flow: https://developer.chrome.com/docs/webstore/publish
- Test instructions: https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions
- Listing images: https://developer.chrome.com/docs/webstore/images
- Branding guidelines: https://developer.chrome.com/docs/webstore/branding
- Tabs API permissions: https://developer.chrome.com/docs/extensions/reference/api/tabs
- Keyword spam guidance: https://developer.chrome.com/docs/webstore/troubleshooting/#keyword-stuffing
- Spam policy FAQ: https://developer.chrome.com/docs/webstore/program-policies/spam-faq#keyword-spam

## Rejection follow-up: Yellow Argon

The June 20, 2026 Chrome Web Store rejection identified keyword spam in the item
description and flagged the brand/company list in the affiliation disclaimer.
For resubmission, keep the public description focused on Shiki's functionality,
avoid lists of company or service names, and put exact supported hosts only in
permission justifications and reviewer test instructions where they add direct
context.

Applied compliance changes:

- Removed the flagged affiliation sentence from the Store Listing description.
- Replaced public summary/description wording with "supported AI chat pages"
  instead of listing service names.
- Bumped the Chrome package to `1.2` for the public Chrome Web Store release.
- Updated promo copy so promotional images do not list supported services as
  standalone keywords.

## Current infra comparison

| Area | Current Shiki state | Web Store implication | Action |
| --- | --- | --- | --- |
| Manifest version | `manifest_version: 3` | Required for new Chrome Web Store extension submissions. | Good. |
| Background | MV3 service worker in `background.js`. | Reviewable and self-contained. | Good. |
| Remote code | No remote JS, no `eval`, no `Function`, no `importScripts`. `index.html` loads packaged `skin.js`. | MV3 prohibits remotely hosted executable logic; image resources are allowed when not executable logic. | Good. Declare "No remote code" in dashboard. |
| Permissions | Now only `"storage"` plus scoped host permissions for the supported AI chat hosts. | Minimum-permission policy favors narrow permissions. Removed unneeded `activeTab` and `tabs`; `chrome.tabs.query()` and `tabs.sendMessage()` can be used without the `tabs` permission when not querying sensitive tab fields. | Done. |
| Host permissions | Scoped to `chatgpt.com`, `chat.openai.com`, `claude.ai`, `gemini.google.com`. | Narrower than broad host patterns. Still sensitive because the extension reads page content on those sites. | Keep and justify clearly. |
| User data | Reads conversation/page content locally; stores settings/profile image/pins/aliases locally; sends prompts/images to the AI site's own composer only on user action. | Because the extension handles website content/user-generated content locally, a privacy policy is still required. | Added `PRIVACY.md`; use `https://github.com/dcablayan/Shiki/blob/main/PRIVACY.md` once pushed. |
| Network | No Shiki backend, telemetry, ads, or analytics. May render HTTPS images already present on the AI page. | Privacy policy and dashboard disclosures must not say "no network" absolutely. | Covered in `PRIVACY.md`. |
| Listing assets | Existing 16/32/48/128 icons, screenshots, and promo tiles are in `store-assets/`. | Store listing needs at least one screenshot and a 128x128 icon; dashboard may request promo assets. | Ready. |
| Review testing | Functionality requires opening a supported AI provider page. No Shiki account required. | Test instructions are optional but useful if reviewer needs a paid or restricted account. | Drafted in `docs/chrome-webstore-listing.md`. |
| Packaging | README had a manual `zip` command. | Easy to accidentally include `.git`, local files, or wrong root. | Added `scripts/package-webstore.sh`. |

## Data inventory for dashboard

Recommended conservative disclosures:

- Website content: conversation text, rendered message content, conversation titles, model labels, image resources from supported AI pages.
- User-generated content: prompts typed into Shiki, images attached through Shiki, local aliases/pins/profile image.
- Personal communications: use this if the dashboard treats AI chats as personal communications or if launch messaging says users may draft personal content.
- Web browsing activity: Shiki is limited to supported host pages and does not collect browsing history. If the dashboard asks whether host-page URLs/domains are handled, disclose the supported-site URLs/domains and explain they are used only to provide the extension's page-specific UI.

Certifications to select only if still true at submission:

- Shiki does not sell or transfer user data for unrelated purposes.
- Shiki does not use user data for advertising.
- Shiki does not use user data for creditworthiness or lending.
- Shiki does not allow humans to read user data.
- Shiki uses data only for its single purpose.

## Frontend or branding status

Approved text-only copy pass completed:

- Third-party document-product references were replaced with Docs-style/document workspace language.
- "Disguise" UI copy was replaced with "style" copy.
- ChatGPT Pro popup copy now says options are shown/hidden rather than access-grant language.
- Publisher/developer name is Lapetus Software.

Remaining visual review item: `icons/` should still be reviewed against the branding guidelines before upload.

## Current release

- Public version: `1.2`.
- Public distribution: Chrome Web Store now; Safari coming soon.
- Upload package: `dist/shiki-chrome-webstore-v1.2.zip`.
