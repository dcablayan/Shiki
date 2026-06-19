import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, "store-assets");
const sourceDir = join(outDir, "source");
mkdirSync(sourceDir, { recursive: true });

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shikiIndex = readFileSync(join(root, "index.html"), "utf8");

function hatMark(size = 128) {
  return `
<svg viewBox="0 0 128 128" width="${size}" height="${size}" aria-hidden="true">
  <defs>
    <linearGradient id="bg" x1="18" y1="8" x2="114" y2="126" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0c3540"/>
      <stop offset="1" stop-color="#102328"/>
    </linearGradient>
    <linearGradient id="paper" x1="42" y1="30" x2="86" y2="104" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff9ed"/>
      <stop offset="1" stop-color="#ece3cc"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="128" height="128" rx="28" fill="url(#bg)"/>
  <circle cx="100" cy="24" r="18" fill="#2f6e72" opacity=".42"/>
  <rect x="36" y="34" width="58" height="72" rx="9" fill="url(#paper)" stroke="#d2c6a6" stroke-width="2"/>
  <path d="M76 34h18v18z" fill="#d8ccb0"/>
  <path d="M49 65h31" stroke="#31515a" stroke-width="5" stroke-linecap="round"/>
  <path d="M49 79h25" stroke="#31515a" stroke-width="5" stroke-linecap="round"/>
  <path d="M49 93h17" stroke="#31515a" stroke-width="5" stroke-linecap="round"/>
  <path d="M28 47c12 9 60 10 78 0 5-3 5 8 1 11-16 11-67 11-82 0-4-3-3-14 3-11z" fill="#14191e"/>
  <path d="M43 44c2-18 13-26 31-24 13 1 22 8 25 24-15 5-40 7-56 0z" fill="#202730"/>
  <path d="M45 39c15 5 37 5 52 0l3 8c-18 7-41 7-59 0z" fill="#c6a554"/>
  <circle cx="87" cy="82" r="12" fill="none" stroke="#75d5bd" stroke-width="6"/>
  <path d="M96 92l13 13" stroke="#75d5bd" stroke-width="7" stroke-linecap="round"/>
</svg>`;
}

function htmlDocument(title, width, height, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${width}, initial-scale=1">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { width: ${width}px; height: ${height}px; margin: 0; overflow: hidden; }
    body {
      background: #eef2f4;
      color: #162124;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      letter-spacing: 0;
    }
    .mark { display: inline-flex; align-items: center; justify-content: center; }
    .shell { width: 100%; height: 100%; background: #f6f8fa; }
    .top {
      height: 74px; display: flex; align-items: center; gap: 18px;
      padding: 0 34px; background: #f9fbfb; border-bottom: 1px solid #d9e0e2;
    }
    .brand h1 { margin: 0; font-size: 26px; line-height: 1.1; font-weight: 760; }
    .brand p { margin: 5px 0 0; color: #526166; font-size: 14px; }
    .chips { margin-left: auto; display: flex; gap: 8px; }
    .chip { border: 1px solid #cbd7d8; border-radius: 999px; padding: 8px 12px; color: #334549; background: white; font-size: 13px; }
    .workspace { display: grid; grid-template-columns: 286px 1fr; height: calc(100% - 74px); }
    .side { background: #f7faf9; border-right: 1px solid #dce4e4; padding: 24px 18px; }
    .search { height: 38px; border: 1px solid #d4dddd; border-radius: 19px; background: #fff; color: #789; display: flex; align-items: center; padding: 0 14px; font-size: 13px; margin-bottom: 20px; }
    .side h2 { margin: 0 0 12px; font-size: 12px; color: #607074; text-transform: uppercase; letter-spacing: .08em; }
    .thread { padding: 13px 12px; border-radius: 9px; margin-bottom: 8px; background: transparent; }
    .thread.active { background: #ddeeed; border: 1px solid #c6dddd; }
    .thread strong { display: block; font-size: 14px; margin-bottom: 4px; }
    .thread span { display: block; font-size: 12px; color: #647579; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .main { padding: 26px 42px 34px; background: linear-gradient(180deg, #edf2f3 0, #e6ecee 100%); }
    .toolbar { height: 44px; display: flex; align-items: center; gap: 10px; padding: 0 12px; border: 1px solid #d1dcdd; border-radius: 22px; background: #fff; color: #4e5e62; box-shadow: 0 2px 10px rgba(18, 42, 46, .05); }
    .tool { width: 24px; height: 24px; border-radius: 6px; background: #edf3f2; }
    .tool.wide { width: 82px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #51666a; }
    .page { margin: 22px auto 0; width: 760px; min-height: 600px; background: #fffdf7; border: 1px solid #d7cfbb; border-radius: 3px; box-shadow: 0 22px 48px rgba(22, 40, 43, .16); padding: 54px 64px 38px; }
    .page h2 { margin: 0 0 10px; font-size: 30px; line-height: 1.15; color: #18272b; }
    .meta { color: #617277; font-size: 14px; margin-bottom: 24px; }
    .msg { margin: 18px 0; padding-left: 18px; border-left: 4px solid #caa95b; }
    .msg.user { border-left-color: #62b6a9; }
    .msg b { font-size: 13px; color: #506267; text-transform: uppercase; letter-spacing: .08em; }
    .msg p { margin: 8px 0 0; font-size: 16px; line-height: 1.55; color: #243337; }
    .code { margin-top: 12px; padding: 12px 14px; border-radius: 8px; background: #142529; color: #ccefe7; font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .composer { margin-top: 26px; border: 1px solid #d8e2e0; border-radius: 14px; padding: 13px 15px; color: #6a777b; font-size: 15px; background: #fbfdfc; display: flex; gap: 12px; align-items: center; }
    .plus { width: 28px; height: 28px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: #e5f3ef; color: #1a7768; font-weight: 700; }
    .promo { width: 100%; height: 100%; background: linear-gradient(135deg, #0c3540 0%, #142529 52%, #27413e 100%); color: #fff7e9; position: relative; overflow: hidden; }
    .promo:after { content: ""; position: absolute; inset: auto -10% -35% auto; width: 58%; height: 86%; border-radius: 50%; background: rgba(117, 213, 189, .18); }
    .promo .content { position: relative; z-index: 1; height: 100%; display: flex; align-items: center; gap: 26px; padding: 34px 42px; }
    .promo h1 { margin: 0; font-size: 46px; line-height: 1.02; }
    .promo p { margin: 13px 0 0; font-size: 21px; line-height: 1.32; color: #dceee9; max-width: 660px; }
    .promo.small h1 { font-size: 30px; }
    .promo.small p { font-size: 15px; max-width: 250px; }
    .promo.small .content { padding: 26px; gap: 18px; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

const iconHtml = htmlDocument("Shiki store icon", 128, 128, `<div class="mark">${hatMark(128)}</div>`);

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function shikiPreviewDocument(title, state, options = {}) {
  const scrollTop = Number.isFinite(options.scrollTop) ? options.scrollTop : 0;
  const previewScript = `<script>
    const previewState = ${safeJson(state)};

    function setPreviewScroll() {
      const scroller = document.querySelector(".editor-body");
      if (scroller) scroller.scrollTop = ${scrollTop};
    }

    function renderPreview() {
      if (typeof window.applyHostState === "function") {
        window.applyHostState(previewState);
        setTimeout(setPreviewScroll, 30);
      }
    }

    window.addEventListener("load", () => {
      setTimeout(renderPreview, 60);
      setTimeout(renderPreview, 220);
      setTimeout(setPreviewScroll, 420);
    });
  </script>`;

  return shikiIndex
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(/<script src="skin\.js[^"]*"><\/script>/, `<script src="../../skin.js?v=22"></script>\n  ${previewScript}`);
}

const conversations = [
  { id: "current", href: "https://chatgpt.com/c/launch-checklist", title: "Launch checklist", label: "Launch checklist" },
  { id: "research-outline", href: "https://chatgpt.com/c/research-outline", title: "Research outline", label: "Research outline" },
  { id: "image-prompts", href: "https://chatgpt.com/c/image-prompts", title: "Image prompts", label: "Image prompts" },
  { id: "meeting-prep", href: "https://chatgpt.com/c/meeting-prep", title: "Meeting prep", label: "Meeting prep" },
  { id: "code-review-notes", href: "https://chatgpt.com/c/code-review-notes", title: "Code review notes", label: "Code review notes" }
];

const screenshotOne = shikiPreviewDocument("Shiki screenshot workspace", {
  provider: "ChatGPT",
  conversation: conversations[0],
  conversations,
  activeConversationId: "current",
  model: { id: "gpt-5.5", label: "GPT-5.5" },
  richFormatting: true,
  imageControl: "composer",
  historyHasMore: false,
  conversationsHasMore: true,
  messages: [
    {
      author: "user",
      text: "Turn this launch chat into a clean checklist I can keep open while I work."
    },
    {
      author: "assistant",
      text: "Launch checklist\nHere is the structured version with the highest priority items first.",
      blocks: [
        { type: "h", level: 2, runs: [{ text: "Launch checklist" }] },
        { type: "p", runs: [{ text: "Here is the structured version with the highest priority items first. Shiki keeps the reply readable as a document while the original chat stays underneath." }] },
        {
          type: "list",
          ordered: false,
          items: [
            { runs: [{ bold: true, text: "Store listing: " }, { text: "confirm the title, summary, category, and support URL." }] },
            { runs: [{ bold: true, text: "Privacy review: " }, { text: "keep the disclosure aligned with local-only storage and no telemetry." }] },
            { runs: [{ bold: true, text: "Assets: " }, { text: "attach screenshots, promo tiles, and the detective-hat icon." }] }
          ]
        },
        { type: "code", lang: "text", text: "permissions: storage\nhosts: chatgpt.com, claude.ai, gemini.google.com" }
      ]
    },
    {
      author: "user",
      text: "Great. Make the risks easier to scan and keep the next prompt ready."
    }
  ]
}, { scrollTop: 0 });

const referenceImage = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 420">
  <rect width="720" height="420" rx="28" fill="#eef3f9"/>
  <rect x="52" y="56" width="616" height="308" rx="18" fill="#ffffff" stroke="#c7cbd1" stroke-width="3"/>
  <rect x="90" y="96" width="214" height="28" rx="8" fill="#c2e7ff"/>
  <rect x="90" y="148" width="540" height="18" rx="9" fill="#dfe5ec"/>
  <rect x="90" y="186" width="486" height="18" rx="9" fill="#dfe5ec"/>
  <rect x="90" y="224" width="516" height="18" rx="9" fill="#dfe5ec"/>
  <circle cx="574" cy="112" r="42" fill="#75d5bd"/>
  <path d="M525 284h98" stroke="#c6a554" stroke-width="18" stroke-linecap="round"/>
</svg>`)}`;

const screenshotTwo = shikiPreviewDocument("Shiki screenshot compose", {
  provider: "Claude",
  conversation: conversations[2],
  conversations,
  activeConversationId: "image-prompts",
  model: { id: "sonnet-4.6", label: "Sonnet 4.6" },
  richFormatting: true,
  imageControl: "composer",
  historyHasMore: false,
  conversationsHasMore: true,
  messages: [
    {
      author: "user",
      text: "Summarize this design reference and turn it into a prompt I can reuse.",
      images: [{ src: referenceImage, alt: "Sample design reference" }]
    },
    {
      author: "assistant",
      text: "Reusable image prompt\nUse this when you want the same calm workspace mood.",
      blocks: [
        { type: "h", level: 2, runs: [{ text: "Reusable image prompt" }] },
        { type: "p", runs: [{ text: "A quiet document workspace with a clear sidebar, spacious writing canvas, subtle blue controls, and a polished productivity feel." }] },
        {
          type: "table",
          header: [[{ text: "Element" }], [{ text: "Direction" }]],
          rows: [
            [[{ text: "Mood" }], [{ text: "Focused, clean, practical" }]],
            [[{ text: "UI" }], [{ text: "Docs-style page, toolbar, conversation list" }]]
          ]
        },
        { type: "quote", blocks: [{ type: "p", runs: [{ text: "Keep the interface useful first; the polish should support the work." }] }] }
      ]
    }
  ]
}, { scrollTop: 0 });

const smallPromo = htmlDocument("Shiki small promo", 440, 280, `
<div class="promo small">
  <div class="content">
    <span class="mark">${hatMark(92)}</span>
    <div><h1>Shiki</h1><p>AI chats in a focused Docs-style workspace.</p></div>
  </div>
</div>`);

const marqueePromo = htmlDocument("Shiki marquee promo", 1400, 560, `
<div class="promo">
  <div class="content">
    <span class="mark">${hatMark(176)}</span>
    <div><h1>Shiki Docs Style</h1><p>Turn ChatGPT, Claude, and Gemini conversations into a calm document workspace with rich formatting, image support, and local organization.</p></div>
  </div>
</div>`);

const pages = [
  ["extension-icon-16", 16, 16, htmlDocument("Shiki extension icon 16", 16, 16, `<div class="mark">${hatMark(16)}</div>`)],
  ["extension-icon-32", 32, 32, htmlDocument("Shiki extension icon 32", 32, 32, `<div class="mark">${hatMark(32)}</div>`)],
  ["extension-icon-48", 48, 48, htmlDocument("Shiki extension icon 48", 48, 48, `<div class="mark">${hatMark(48)}</div>`)],
  ["extension-icon-128", 128, 128, htmlDocument("Shiki extension icon 128", 128, 128, `<div class="mark">${hatMark(128)}</div>`)],
  ["store-icon-128", 128, 128, iconHtml],
  ["screenshot-workspace-1280x800", 1280, 800, screenshotOne],
  ["screenshot-compose-1280x800", 1280, 800, screenshotTwo],
  ["small-promo-440x280", 440, 280, smallPromo],
  ["marquee-promo-1400x560", 1400, 560, marqueePromo]
];

for (const [name, width, height, html] of pages) {
  const htmlPath = join(sourceDir, `${name}.html`);
  const pngPath = join(outDir, `${name}.png`);
  writeFileSync(htmlPath, html);
  execFileSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${width},${height}`,
    `--screenshot=${pngPath}`,
    pathToFileURL(htmlPath).href
  ], { stdio: "ignore" });
}

writeFileSync(join(sourceDir, "shiki-detective-hat-mark.svg"), hatMark(128));

console.log(`Generated ${pages.length} assets in ${outDir}`);
