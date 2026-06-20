(function () {
  const FRAME_ID = "shiki-docs-skin-frame";
  const STYLE_ID = "shiki-docs-skin-style";
  const HOST_SOURCE = "shiki-host";
  const SKIN_SOURCE = "shiki-docs-skin";
  const STORAGE_KEY = "shikiDocsSkinEnabled";
  const PROFILE_KEY = "shikiProfileImage";
  const RICH_KEY = "shikiRichFormatting";
  const IMAGE_CONTROL_KEY = "shikiImageControl";
  const SYNC_INTERVAL_MS = 1500;
  const SKIN_ORIGIN = new URL(chrome.runtime.getURL("index.html")).origin;

  const PROVIDERS = {
    "chatgpt.com": {
      name: "ChatGPT",
      defaultModel: { id: "gpt-5.5", label: "GPT-5.5" },
      conversationPatterns: ["/c/"],
      conversationSelectors: ['a[href*="/c/"]']
    },
    "chat.openai.com": {
      name: "ChatGPT",
      defaultModel: { id: "gpt-5.5", label: "GPT-5.5" },
      conversationPatterns: ["/c/"],
      conversationSelectors: ['a[href*="/c/"]']
    },
    "claude.ai": {
      name: "Claude",
      defaultModel: { id: "sonnet-4.6", label: "Sonnet 4.6" },
      conversationPatterns: ["/chat/"],
      conversationSelectors: ['a[href*="/chat/"]']
    },
    "gemini.google.com": {
      name: "Gemini",
      defaultModel: { id: "3.1-flash-lite", label: "3.1 Flash-Lite" },
      conversationPatterns: ["/app/"],
      conversationSelectors: ['a[href*="/app/"]']
    }
  };

  let frame = null;
  let enabled = true;
  let syncTimer = 0;
  let profileImage = "";
  // When on, assistant turns are reverse-engineered from the host's rendered
  // markdown into a structured AST (see extractBlocks) so the skin can show
  // headings/lists/code/etc. Toggled from the popup; persisted in storage.
  let richFormatting = true;
  let imageControl = "composer";
  let historyLoading = false;
  let historyHasMore = true;
  // Sidebar (conversation list) lazy loading, mirrored to the skin.
  let conversationsLoading = false;
  let conversationsHasMore = true;

  // Cache of converted image sources (blob:/tainted → data: URL). `imageCacheVersion`
  // bumps when a conversion lands so memoized message blocks re-walk and pick it up.
  const imageDataCache = new Map();
  const imageConverting = new Set();
  let imageCacheVersion = 0;

  function provider() {
    return PROVIDERS[location.hostname] || {
      name: "AI",
      defaultModel: { id: "gpt-5.5", label: "GPT-5.5" },
      conversationPatterns: [],
      conversationSelectors: ["a[href]"]
    };
  }

  function cleanText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/\b(new chat|delete|archive|share|more|options)\b/gi, "")
      .trim();
  }

  function absoluteHref(href) {
    try {
      return new URL(href, location.origin).href;
    } catch {
      return "";
    }
  }

  function normalizeId(href, index) {
    const url = absoluteHref(href);
    const path = url ? new URL(url).pathname : "";
    return path || `conversation-${index + 1}`;
  }

  function titleFromDocument() {
    const rawTitle = document.title
      .replace(/\s*[-|]\s*(ChatGPT|Claude|Gemini).*$/i, "")
      .replace(/^ChatGPT\s*[-|]\s*/i, "");

    return cleanText(rawTitle) || "Conversation Name";
  }

  function isConversationHref(href, config) {
    const normalized = absoluteHref(href);
    if (!normalized) return false;
    return config.conversationPatterns.some((pattern) => normalized.includes(pattern));
  }

  function extractConversations() {
    const config = provider();
    const seen = new Set();
    const anchors = config.conversationSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const conversations = [];

    anchors.forEach((anchor, index) => {
      const href = absoluteHref(anchor.getAttribute("href"));
      if (!href || seen.has(href) || !isConversationHref(href, config)) return;

      const title = cleanText(anchor.textContent) || titleFromDocument();
      if (!title || title.length < 2) return;

      seen.add(href);
      conversations.push({
        id: normalizeId(href, index),
        href,
        title,
        label: title
      });
    });

    if (!conversations.length) {
      conversations.push({
        id: "current",
        href: location.href,
        title: titleFromDocument(),
        label: "Tab 1"
      });
    }

    // Surface everything the host currently has in its DOM (it lazy-loads its own
    // sidebar, so this is however many it has rendered). The skin's list scrolls,
    // so we don't need to keep them all on screen at once.
    return conversations.slice(0, 200);
  }

  function extractActiveConversation(conversations) {
    const exact = conversations.find((conversation) => conversation.href === location.href);
    if (exact) return exact;

    const currentPath = location.pathname;
    const pathMatch = conversations.find((conversation) => {
      try {
        return new URL(conversation.href).pathname === currentPath;
      } catch {
        return false;
      }
    });

    return pathMatch || conversations[0];
  }

  function modelSelectors() {
    const host = location.hostname;
    if (host.includes("chatgpt") || host.includes("openai")) {
      return ['[data-testid="model-switcher-dropdown-button"]', '[data-testid*="model-switcher" i]', 'button[aria-label*="model" i]'];
    }
    if (host.includes("claude")) {
      return ['[data-testid="model-selector-dropdown"]', 'button[aria-haspopup="listbox"]', 'button[aria-label*="model" i]'];
    }
    if (host.includes("gemini")) {
      return ['.logo-pill-label-container', 'button[aria-label*="model" i]', '[class*="model" i] button'];
    }
    return [];
  }

  // Triggers for the host's reasoning/effort control. Intentionally EMPTY: broad
  // guesses (e.g. button[aria-label*="thinking"]) matched and clicked the wrong
  // control — on ChatGPT that toggled Pro/extended thinking ON even when the user
  // picked Instant. Until a tester confirms an exact selector from DevTools, we do
  // NOT touch the host reasoning control; the effort choice is reflected in the
  // skin only. Paste ONLY verified selectors per host here (first = highest priority).
  function effortSelectors() {
    const host = location.hostname;
    if (host.includes("chatgpt") || host.includes("openai")) {
      return [];
    }
    if (host.includes("claude")) {
      return [];
    }
    if (host.includes("gemini")) {
      return [];
    }
    return [];
  }

  function extractModel() {
    const config = provider();
    // Recognise current provider model names: GPT-x / o-series (ChatGPT),
    // Opus/Sonnet/Haiku x.x (Claude), and "x.x Flash-Lite/Flash/Pro" (Gemini).
    const modelPattern = /\b(GPT[-\s]?[\w.]+|o\d(?:[-\s]?\w+)?|Opus\s+[\w.]+|Sonnet\s+[\w.]+|Haiku\s+[\w.]+|\d(?:\.\d)?\s+Flash(?:[-\s]Lite)?|\d(?:\.\d)?\s+Pro)\b/i;

    // Read only from the host's model-switcher control, not arbitrary page text.
    for (const selector of modelSelectors()) {
      const el = document.querySelector(selector);
      const text = el && cleanText(el.innerText || el.textContent || "").slice(0, 80);
      const match = text && text.match(modelPattern);
      if (match) {
        const label = cleanText(match[1]).replace(/\s+/g, " ");
        if (label) return { id: label.toLowerCase().replace(/[^a-z0-9.]+/g, "-"), label };
      }
    }

    return config.defaultModel;
  }

  function extractEffort() {
    const bodyText = cleanText(document.body?.innerText || "").slice(0, 6000);
    const match = bodyText.match(/\b(high|medium|low|auto)\b/i);
    const label = match ? match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() : "High";

    return { level: label.toLowerCase(), label };
  }

  function messageNodes() {
    const host = location.hostname;
    let nodes = [];

    if (host.includes("chatgpt") || host.includes("openai")) {
      nodes = Array.from(document.querySelectorAll("[data-message-author-role]"));
    } else if (host.includes("claude")) {
      nodes = Array.from(document.querySelectorAll(
        '[data-testid="user-message"], [data-testid="assistant-message"], .font-claude-message'
      ));
    } else if (host.includes("gemini")) {
      nodes = Array.from(document.querySelectorAll("user-query, model-response"));
    }

    if (!nodes.length) {
      nodes = Array.from(document.querySelectorAll(
        '[data-message-author-role], [data-testid="user-message"], [data-testid="assistant-message"], user-query, model-response'
      ));
    }

    return nodes;
  }

  function detectAuthor(node, index) {
    const role = (node.getAttribute && node.getAttribute("data-message-author-role")) || "";
    if (/user|human/i.test(role)) return "user";
    if (/assistant|bot|model|ai/i.test(role)) return "assistant";

    const tag = (node.tagName || "").toLowerCase();
    if (tag === "user-query") return "user";
    if (tag === "model-response") return "assistant";

    const hint = (node.getAttribute && (node.getAttribute("data-testid") || node.getAttribute("class"))) || "";
    if (/(^|[^a-z])(user|human)([^a-z]|$)/i.test(hint)) return "user";
    if (/assistant|model|response|claude|gemini|bot/i.test(hint)) return "assistant";

    // Fallback: turns alternate, conventionally starting with the user.
    return index % 2 === 0 ? "user" : "assistant";
  }

  // ---- Reverse-engineer the host's rendered markdown -------------------------
  // ChatGPT/Claude/Gemini render the model's markdown into semantic HTML
  // (h1-6, p, ul/ol/li, pre/code, strong/em, a, blockquote, table, hr). We walk
  // that DOM back into a tiny, safe block/inline AST so the skin can re-render it
  // as a formatted document. The skin only ever receives this structured data and
  // builds DOM from it via textContent — raw host HTML is never forwarded.
  const BLOCK_CAP = 600; // max blocks per message (defensive)
  const RUN_CAP = 6000; // max inline runs per block (defensive)
  const blockCache = new WeakMap(); // node -> { len, blocks }; skips re-walking unchanged turns

  // Search inside shadow roots (Gemini and other web components often hide the
  // rendered markdown there; a flat querySelector misses it).
  function queryInTree(root, selector) {
    if (!root || !root.querySelector) return null;
    try {
      const direct = root.querySelector(selector);
      if (direct) return direct;
    } catch {
      return null;
    }
    const elements = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (const el of elements) {
      if (el.shadowRoot) {
        const found = queryInTree(el.shadowRoot, selector);
        if (found) return found;
      }
    }
    return null;
  }

  // The element holding the rendered answer, skipping surrounding host chrome.
  // Ordered most-specific → generic; matches ChatGPT's .markdown.prose, Claude's
  // message body, and Gemini's model-response content.
  const CONTENT_ROOT_SELECTORS = [
    "[data-message-content]",
    ".markdown.prose",
    ".markdown",
    ".prose",
    "[class*='markdown']",
    ".font-claude-message",
    "message-content",
    ".model-response-text",
    ".response-content",
    "article"
  ];

  function contentRoot(node) {
    for (const selector of CONTENT_ROOT_SELECTORS) {
      const found = queryInTree(node, selector);
      if (found) return found;
    }
    return node;
  }

  // Cheap structural signature so we re-parse when the host adds headings/lists/
  // code blocks during streaming even if total text length is unchanged.
  function structureFingerprint(node) {
    const root = contentRoot(node);
    const tags = ["H1", "H2", "H3", "H4", "H5", "H6", "P", "UL", "OL", "PRE", "BLOCKQUOTE", "TABLE", "HR", "CODE", "IMG"];
    let sig = "";
    tags.forEach((tag) => {
      try {
        sig += `${tag[0]}${root.querySelectorAll(tag).length},`;
      } catch {
        sig += "0,";
      }
    });
    // Bump when an out-of-band image conversion lands so memoized blocks re-walk.
    return `${sig}v${imageCacheVersion}`;
  }

  function isSkippable(el) {
    const tag = el.tagName;
    if (tag === "SVG" || tag === "BUTTON" || tag === "STYLE" || tag === "SCRIPT" || tag === "NOSCRIPT") return true;
    if (el.getAttribute("aria-hidden") === "true") return true;
    const testId = el.getAttribute("data-testid") || "";
    if (/copy|feedback|regenerate|thumb|message-actions|conversation-actions|toolbar|edit-message|branch/i.test(testId)) return true;
    const aria = el.getAttribute("aria-label") || "";
    if (/copy|regenerate|good response|bad response|edit message|read aloud/i.test(aria)) return true;
    const role = el.getAttribute("role") || "";
    if (role === "toolbar" || role === "menu") return true;
    return false;
  }

  // ---- Images ---------------------------------------------------------------
  const MIN_CONTENT_IMAGE = 48; // px; below this an <img> is treated as an icon/avatar

  // Is this <img> worth surfacing — a real content/generated image, not an icon,
  // avatar, or tiny inline glyph?
  function isContentImage(img) {
    if (!img || img.tagName !== "IMG") return false;
    const src = img.getAttribute("src") || img.currentSrc || "";
    if (!src) return false;
    if (/^data:image\/svg/i.test(src)) return false; // inline SVGs are almost always icons
    // Citation/source logos are wrapped in an <a href> to the source. They're never
    // real content (and the host renders them as tiny favicons), so drop them.
    if (img.closest("a[href]")) return false;
    const w = img.naturalWidth || img.width || parseInt(img.getAttribute("width") || "0", 10) || 0;
    const h = img.naturalHeight || img.height || parseInt(img.getAttribute("height") || "0", 10) || 0;
    if (w && h && w < MIN_CONTENT_IMAGE && h < MIN_CONTENT_IMAGE) return false;
    // Some source logos have a large natural size but the host displays them tiny
    // (e.g. a 128px publisher logo shown at 12px beside a citation). Trust the
    // on-page render size so they aren't surfaced as full-width content images.
    const rect = img.getBoundingClientRect();
    if (rect.width && rect.height && rect.width < MIN_CONTENT_IMAGE && rect.height < MIN_CONTENT_IMAGE) return false;
    if (img.closest('button, [data-testid*="avatar" i], [class*="avatar" i]')) return false;
    return true;
  }

  // Resolve an <img> to a source the skin's CSP can render (data:/https:). blob:
  // and CORS-tainted images are converted to a data: URL out of band (see
  // convertImageToDataUrl); until that lands we return "" so they're skipped.
  function resolveImageSrc(img, raw) {
    const src = String(raw || "").trim();
    if (!src) return "";
    if (/^data:image\//i.test(src)) return src;
    if (imageDataCache.has(src)) return imageDataCache.get(src);
    if (/^https:\/\//i.test(src)) return src; // CSP allows https images directly
    if (/^blob:/i.test(src)) {
      convertImageToDataUrl(img, src);
      return "";
    }
    return ""; // http:, relative, etc. — not rendered
  }

  // Best-effort: turn a blob:/tainted image into a data: URL. Tries a same-origin
  // canvas first, then fetch(); caches the result and re-syncs so the skin shows it.
  function convertImageToDataUrl(img, src) {
    if (imageConverting.has(src) || imageDataCache.has(src)) return;
    imageConverting.add(src);
    const done = (dataUrl) => {
      imageConverting.delete(src);
      if (dataUrl && /^data:image\//i.test(dataUrl)) {
        imageDataCache.set(src, dataUrl);
        imageCacheVersion += 1;
        postState();
      }
    };
    try {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (w && h) {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0);
        const url = canvas.toDataURL("image/png");
        if (url && url.length > 64) { done(url); return; }
      }
    } catch {
      /* tainted canvas — fall through to fetch */
    }
    try {
      fetch(src)
        .then((response) => response.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onload = () => done(String(reader.result || ""));
          reader.onerror = () => done("");
          reader.readAsDataURL(blob);
        })
        .catch(() => done(""));
    } catch {
      done("");
    }
  }

  // Content images within a message (generated images, user-uploaded photos),
  // de-duplicated and resolved to renderable sources.
  function collectMessageImages(node, author) {
    const root = author === "assistant" ? contentRoot(node) : node;
    let imgs = [];
    try {
      imgs = Array.from(root.querySelectorAll("img"));
    } catch {
      imgs = [];
    }
    const seen = new Set();
    const out = [];
    imgs.forEach((img) => {
      if (!isContentImage(img)) return;
      const raw = img.getAttribute("src") || img.currentSrc || "";
      const src = resolveImageSrc(img, raw);
      if (!src || seen.has(src)) return;
      seen.add(src);
      out.push({ src, alt: cleanText(img.getAttribute("alt") || "").slice(0, 200) });
    });
    return out.slice(0, 12);
  }

  // Preserve line breaks for transcript text; unlike cleanText() which collapses
  // whitespace (fine for titles, wrong for message bodies).
  function messageBodyText(node, author) {
    let root = node;
    if (author === "assistant") {
      root = contentRoot(node);
    } else {
      root = queryInTree(node, "[data-message-content], .whitespace-pre-wrap, .user-message") || node;
    }
    return String(root.innerText || root.textContent || "")
      .replace(/\u200B/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // Block-level tags we don't descend into while gathering a block's inline text.
  const INLINE_STOP = new Set(["UL", "OL", "PRE", "BLOCKQUOTE", "TABLE", "P", "H1", "H2", "H3", "H4", "H5", "H6", "LI"]);

  function pushInline(el, runs, marks) {
    el.childNodes.forEach((child) => {
      if (runs.length >= RUN_CAP) return;
      if (child.nodeType === 3) {
        if (child.textContent) runs.push({ ...marks, text: child.textContent });
        return;
      }
      if (child.nodeType !== 1) return;
      const tag = child.tagName;
      if (tag === "BR") { runs.push({ ...marks, text: "\n" }); return; }
      if (isSkippable(child)) return;
      // DIV/SPAN are transparent wrappers on ChatGPT/Claude (not hard stops).
      if (tag === "DIV" || tag === "SPAN") {
        pushInline(child, runs, marks);
        return;
      }
      if (INLINE_STOP.has(tag)) return;
      const next = { ...marks };
      if (tag === "STRONG" || tag === "B") next.bold = true;
      if (tag === "EM" || tag === "I") next.italic = true;
      if (tag === "CODE" || tag === "KBD" || tag === "SAMP") next.code = true;
      if (tag === "DEL" || tag === "S" || tag === "STRIKE") next.strike = true;
      if (tag === "A") {
        const href = child.getAttribute("href") || "";
        if (href) next.href = href;
      }
      pushInline(child, runs, next);
    });
  }

  // Merge adjacent runs that share the same marks.
  function mergeRuns(raw) {
    const merged = [];
    raw.forEach((run) => {
      const last = merged[merged.length - 1];
      if (last
        && !!last.bold === !!run.bold && !!last.italic === !!run.italic
        && !!last.code === !!run.code && !!last.strike === !!run.strike
        && (last.href || "") === (run.href || "")) {
        last.text += run.text;
      } else {
        merged.push({ ...run });
      }
    });
    return merged.filter((run) => run.text !== "");
  }

  // Inline runs for an element, with adjacent same-mark runs merged to stay small.
  function inlineRuns(el) {
    const raw = [];
    pushInline(el, raw, {});
    return mergeRuns(raw);
  }

  // List-item text: hosts wrap each line in <p>/<div>. Collect those as segments
  // (title line, body line) joined with a single newline; skip whitespace-only
  // text nodes that would orphan the list marker on its own line.
  function listItemRuns(li) {
    const segments = [];

    function inlineFrom(el) {
      const raw = [];
      function walkInline(node, marks) {
        node.childNodes.forEach((child) => {
          if (raw.length >= RUN_CAP) return;
          if (child.nodeType === 3) {
            const text = child.textContent.replace(/\s+/g, " ");
            if (text.trim()) raw.push({ ...marks, text });
            return;
          }
          if (child.nodeType !== 1) return;
          const tag = child.tagName;
          if (tag === "UL" || tag === "OL") return;
          if (isSkippable(child)) return;
          if (tag === "P" || tag === "DIV" || tag === "SPAN") {
            walkInline(child, marks);
            return;
          }
          const next = { ...marks };
          if (tag === "STRONG" || tag === "B") next.bold = true;
          if (tag === "EM" || tag === "I") next.italic = true;
          if (tag === "CODE" || tag === "KBD" || tag === "SAMP") next.code = true;
          if (tag === "DEL" || tag === "S" || tag === "STRIKE") next.strike = true;
          if (tag === "BR") { raw.push({ ...marks, text: "\n" }); return; }
          if (tag === "A") {
            const href = child.getAttribute("href") || "";
            if (href) next.href = href;
          }
          walkInline(child, next);
        });
      }
      walkInline(el, {});
      return mergeRuns(raw);
    }

    Array.from(li.childNodes).forEach((child) => {
      if (child.nodeType === 3) {
        const text = child.textContent.replace(/\s+/g, " ").trim();
        if (text) segments.push(mergeRuns([{ text }]));
        return;
      }
      if (child.nodeType !== 1) return;
      const tag = child.tagName;
      if (tag === "UL" || tag === "OL") return;
      if (isSkippable(child)) return;
      const runs = inlineFrom(child);
      if (runs.length) segments.push(runs);
    });

    if (!segments.length) return [];

    const raw = [];
    segments.forEach((runs, index) => {
      if (index > 0) raw.push({ text: "\n" });
      raw.push(...runs);
    });
    return mergeRuns(raw);
  }

  function listItems(listEl, depth) {
    const items = [];
    Array.from(listEl.children).forEach((li) => {
      if (li.tagName !== "LI") return;
      const runs = listItemRuns(li);
      const sublists = [];
      if (depth < 4) {
        Array.from(li.children).forEach((child) => {
          if (child.tagName === "UL" || child.tagName === "OL") {
            sublists.push({ ordered: child.tagName === "OL", items: listItems(child, depth + 1) });
          }
        });
      }
      if (runs.length || sublists.length) {
        items.push(sublists.length ? { runs, sublists } : { runs });
      }
    });
    return items;
  }

  function extractTable(tableEl) {
    const trs = Array.from(tableEl.querySelectorAll("tr")).slice(0, 80);
    if (!trs.length) return null;
    let header = null;
    const rows = [];
    trs.forEach((tr) => {
      const cells = Array.from(tr.children)
        .filter((cell) => cell.tagName === "TD" || cell.tagName === "TH")
        .slice(0, 24)
        .map((cell) => inlineRuns(cell));
      if (!cells.length) return;
      if (!header && tr.querySelector("th")) header = cells;
      else rows.push(cells);
    });
    if (!header && !rows.length) return null;
    return { type: "table", header, rows };
  }

  function collectBlocks(container, blocks, depth) {
    Array.from(container.childNodes).forEach((node) => {
      if (blocks.length >= BLOCK_CAP) return;
      if (node.nodeType === 3) {
        const text = node.textContent.replace(/\s+/g, " ").trim();
        if (text) blocks.push({ type: "p", runs: [{ text }] });
        return;
      }
      if (node.nodeType !== 1 || isSkippable(node)) return;
      const tag = node.tagName;
      if (/^H[1-6]$/.test(tag)) {
        const runs = inlineRuns(node);
        if (runs.length) blocks.push({ type: "h", level: Number(tag[1]), runs });
      } else if (tag === "P") {
        const runs = inlineRuns(node);
        if (runs.length) blocks.push({ type: "p", runs });
        // Images embedded in a paragraph (markdown ![]() output, etc.).
        Array.from(node.querySelectorAll("img")).forEach((img) => {
          if (!isContentImage(img)) return;
          const src = resolveImageSrc(img, img.getAttribute("src") || img.currentSrc || "");
          if (src) blocks.push({ type: "image", src, alt: cleanText(img.getAttribute("alt") || "").slice(0, 200) });
        });
      } else if (tag === "UL" || tag === "OL") {
        const items = listItems(node, 0);
        if (items.length) blocks.push({ type: "list", ordered: tag === "OL", items });
      } else if (tag === "PRE" || (tag === "DIV" && /code-block|codeblock/i.test(String(node.className)))) {
        const codeEl = node.querySelector("code") || node;
        const lang = (String(codeEl.className).match(/language-([\w+#.-]+)/) || [])[1] || "";
        const text = (codeEl.innerText || codeEl.textContent || "").replace(/\n$/, "");
        if (text) blocks.push({ type: "code", lang, text });
      } else if (tag === "BLOCKQUOTE") {
        const inner = [];
        collectBlocks(node, inner, depth + 1);
        if (inner.length) blocks.push({ type: "quote", blocks: inner });
      } else if (tag === "TABLE") {
        const table = extractTable(node);
        if (table) blocks.push(table);
      } else if (tag === "HR") {
        blocks.push({ type: "hr" });
      } else if (tag === "IMG") {
        if (isContentImage(node)) {
          const src = resolveImageSrc(node, node.getAttribute("src") || node.currentSrc || "");
          if (src) blocks.push({ type: "image", src, alt: cleanText(node.getAttribute("alt") || "").slice(0, 200) });
        }
      } else if (tag === "DIV" && !/code-block|codeblock/i.test(String(node.className))) {
        // Leaf paragraph divs (common on ChatGPT) — render as a single <p> instead
        // of recursing into duplicate text + wrapper blocks.
        const hasBlockChild = Array.from(node.children).some((child) =>
          child.nodeType === 1 && !isSkippable(child)
          && /^(P|UL|OL|PRE|BLOCKQUOTE|TABLE|H[1-6]|DIV|HR|IMG|FIGURE|PICTURE)$/i.test(child.tagName));
        if (!hasBlockChild) {
          const runs = inlineRuns(node);
          if (runs.length) blocks.push({ type: "p", runs });
        } else if (depth < 8) {
          collectBlocks(node, blocks, depth + 1);
        }
      } else if (depth < 8) {
        // Wrapper element (div/span/article/custom tag) — recurse for real blocks.
        collectBlocks(node, blocks, depth + 1);
      }
    });
  }

  function extractBlocks(messageNode) {
    const blocks = [];
    const root = contentRoot(messageNode);
    collectBlocks(root, blocks, 0);
    if (!blocks.length) {
      // No semantic structure (a plain reply): split on blank lines into
      // paragraphs, keeping single newlines as soft breaks.
      String(root.innerText || root.textContent || "")
        .split(/\n{2,}/)
        .forEach((para) => {
          const text = para.replace(/^\n+|\n+$/g, "");
          if (text.trim()) blocks.push({ type: "p", runs: [{ text }] });
        });
    }
    return blocks;
  }

  // Memoized per-node: only re-walk a turn when its text length or structure
  // changed (the streaming last message), so long transcripts aren't re-parsed
  // every sync.
  function blocksForNode(node) {
    const len = (node.textContent || "").length;
    const sig = structureFingerprint(node);
    const cached = blockCache.get(node);
    if (cached && cached.len === len && cached.sig === sig) return cached.blocks;
    const blocks = extractBlocks(node);
    blockCache.set(node, { len, sig, blocks });
    return blocks;
  }

  function extractMessages() {
    const messages = [];

    messageNodes().forEach((node, index) => {
      const author = detectAuthor(node, index);
      const text = messageBodyText(node, author);
      const images = collectMessageImages(node, author);
      if ((!text || text.length < 2) && !images.length) return;
      const message = { author, text };
      if (images.length) message.images = images;
      // Only reverse-engineer assistant turns: the hosts show user text verbatim,
      // so plain rendering preserves it (and its line breaks) best.
      if (richFormatting && author === "assistant") {
        const blocks = blocksForNode(node);
        if (blocks.length) message.blocks = blocks;
      }
      messages.push(message);
    });

    return messages.slice(-200);
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor?.set && "value" in element) {
      descriptor.set.call(element, value);
    } else if (element.isContentEditable) {
      element.textContent = value;
    }

    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      cancelable: true,
      data: value,
      inputType: "insertText"
    }));
  }

  // Provider-specific selectors for the composer (input) and the send button,
  // ordered most-specific → most-generic. When testers report a provider where
  // injection misses, paste the exact selector(s) from DevTools into the matching
  // host block below — putting the new one first gives it priority. The generic
  // fallbacks in findComposer()/findSendButton() still run if none of these match.
  // Last reviewed 2026-06; provider DOMs change often, so order matters more than
  // any single entry.
  function composerSelectors() {
    const host = location.hostname;
    if (host.includes("chatgpt") || host.includes("openai")) {
      return [
        "#prompt-textarea",
        '[data-testid="prompt-textarea"]',
        'div.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]'
      ];
    }
    if (host.includes("claude")) {
      return [
        'div.ProseMirror[contenteditable="true"]',
        '[contenteditable="true"][aria-label*="Claude" i]',
        'div[role="textbox"][contenteditable="true"]'
      ];
    }
    if (host.includes("gemini")) {
      return [
        'rich-textarea .ql-editor[contenteditable="true"]',
        'div.ql-editor[contenteditable="true"]',
        ".ql-editor"
      ];
    }
    return [];
  }

  function sendButtonSelectors() {
    const host = location.hostname;
    if (host.includes("chatgpt") || host.includes("openai")) {
      return [
        'button[data-testid="send-button"]',
        'button[aria-label="Send prompt"]',
        'button[aria-label*="send" i]:not([disabled])',
        'form button[type="submit"]:not([disabled])'
      ];
    }
    if (host.includes("claude")) {
      return [
        'button[aria-label="Send message" i]',
        'button[data-testid="send-button"]',
        'button[aria-label*="send" i]:not([disabled])',
        'button[type="submit"]:not([disabled])'
      ];
    }
    if (host.includes("gemini")) {
      return [
        'button.send-button',
        'button[aria-label="Send message" i]',
        'button[aria-label*="send" i]:not([disabled])',
        'button[mattooltip*="Send" i]'
      ];
    }
    return [];
  }

  // Tolerant querySelector: a malformed tester-pasted selector returns null
  // instead of throwing and aborting the whole lookup.
  function safeQuery(selector) {
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }

  function findComposer() {
    // Provider-specific first, then generic fallbacks that work across hosts.
    for (const selector of composerSelectors()) {
      const el = safeQuery(selector);
      if (el) return el;
    }
    return safeQuery("textarea")
      || safeQuery('[contenteditable="true"]')
      || safeQuery('[role="textbox"]');
  }

  // A button is clickable only if it's neither natively disabled nor marked
  // aria-disabled (some hosts gray out send with aria-disabled rather than the
  // disabled property). Returning only clickable buttons lets submitPrompt poll
  // cleanly until the host actually enables send.
  function isClickable(el) {
    return !!el && !el.disabled && el.getAttribute("aria-disabled") !== "true";
  }

  function findSendButton() {
    // Provider-specific first; only return an *enabled* button so submitPrompt
    // keeps polling (rather than clicking a dead button) until send is ready.
    for (const selector of sendButtonSelectors()) {
      const el = safeQuery(selector);
      if (isClickable(el)) return el;
    }
    const generic = safeQuery('[data-testid="send-button"]');
    if (isClickable(generic)) return generic;
    const labelled = safeQuery('button[aria-label*="send" i]');
    if (isClickable(labelled)) return labelled;
    return Array.from(document.querySelectorAll("button")).find((button) =>
      /send|submit/i.test(button.getAttribute("aria-label") || button.textContent || "") && isClickable(button)) || null;
  }

  // Current text held by a composer, normalized for comparison. Works for both
  // <textarea>/<input> (value) and contenteditable editors (textContent).
  function composerText(input) {
    if (!input) return "";
    const raw = input.value != null ? input.value : (input.textContent || "");
    return String(raw).replace(/\u200B/g, "").trim();
  }

  function pressEnter(input) {
    // A full keydown→keypress→keyup sequence is more likely to be honored by
    // editors that submit on Enter than a lone keydown.
    ["keydown", "keypress", "keyup"].forEach((type) => {
      input.dispatchEvent(new KeyboardEvent(type, {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      }));
    });
  }

  function insertComposerText(input, text) {
    input.focus();

    if (input.isContentEditable) {
      // ProseMirror/Lexical/Quill editors (ChatGPT, Claude, Gemini) track their
      // own document model, so plain textContent assignment is ignored.
      // execCommand dispatches real beforeinput/input events the editor listens
      // for, which is also what flips the send button from disabled → enabled.
      const selection = window.getSelection();
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(input);
      selection.addRange(range);
      if (range.toString()) document.execCommand("delete", false);
      const inserted = document.execCommand("insertText", false, text);
      // Some editors reject execCommand; fall back to a manual input event.
      if (!inserted || !composerText(input)) {
        input.textContent = text;
        input.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          data: text,
          inputType: "insertText"
        }));
      }
    } else {
      setNativeValue(input, text);
    }
  }

  // Cheap count of rendered conversation turns. Used as a positive "it sent"
  // signal: if it grows after we dispatch, the message definitely landed — even
  // when the composer is unreadable because the host swapped it out.
  function messageTurnCount() {
    try {
      return messageNodes().length;
    } catch {
      return 0;
    }
  }

  // ---- Outbound photo attachments -------------------------------------------
  // Rebuild a File from the data: URL the skin sent so we can hand it to the host.
  function dataUrlToFile(dataUrl, name, type) {
    try {
      const comma = String(dataUrl).indexOf(",");
      if (comma < 0) return null;
      const meta = dataUrl.slice(0, comma);
      const b64 = dataUrl.slice(comma + 1);
      const mime = type || (meta.match(/data:([^;]+)/) || [])[1] || "image/png";
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new File([bytes], name || "image.png", { type: mime });
    } catch {
      return null;
    }
  }

  // Host file-input selectors, most-specific → generic. Paste verified ones here.
  function hostFileInputSelectors() {
    const host = location.hostname;
    if (host.includes("chatgpt") || host.includes("openai")) {
      return ['input[type="file"][accept*="image" i]', 'input[type="file"][multiple]', 'input[type="file"]'];
    }
    if (host.includes("claude")) {
      return ['input[data-testid="file-upload-input"]', 'input[type="file"][accept*="image" i]', 'input[type="file"]'];
    }
    if (host.includes("gemini")) {
      return ['input[type="file"][accept*="image" i]', 'input[type="file"]'];
    }
    return ['input[type="file"]'];
  }

  function attachViaFileInput(files) {
    for (const selector of hostFileInputSelectors()) {
      let input = null;
      try {
        input = document.querySelector(selector);
      } catch {
        input = null;
      }
      if (!input) continue;
      try {
        const data = new DataTransfer();
        files.forEach((file) => data.items.add(file));
        input.files = data.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      } catch {
        /* malformed selector / read-only files — try the next one */
      }
    }
    return false;
  }

  function attachViaDrop(files) {
    const target = findComposer();
    if (!target) return false;
    try {
      const data = new DataTransfer();
      files.forEach((file) => data.items.add(file));
      ["dragenter", "dragover", "drop"].forEach((type) => {
        target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }));
      });
      return true;
    } catch {
      return false;
    }
  }

  // Inject staged photos into the host composer: try the host's file input first
  // (most reliable), then fall back to a synthetic drag-and-drop onto the editor.
  function attachImagesToComposer(images) {
    const files = (images || [])
      .map((image) => dataUrlToFile(image.dataUrl, image.name, image.type))
      .filter(Boolean);
    if (!files.length) return false;
    if (attachViaFileInput(files)) return true;
    return attachViaDrop(files);
  }

  function submitPrompt(text, images) {
    const hasImages = Array.isArray(images) && images.length > 0;
    if (hasImages) attachImagesToComposer(images);

    const input = findComposer();
    if (!input) return false;

    const target = String(text || "").trim();
    if (!target && !hasImages) return false;

    if (target) insertComposerText(input, text);

    const needle = target.slice(0, 24);
    const baselineTurns = messageTurnCount();
    // The single biggest reason a message "doesn't go through": we click send (or
    // press Enter) before the host framework has registered the injected text and
    // enabled its send button. So poll for an *enabled* send button, clicking the
    // moment one appears, and only fall back to a synthetic Enter if none shows.
    const start = Date.now();
    // Photo uploads keep the host's send button disabled until processing finishes,
    // so give attachments a much longer window to become sendable.
    const SEND_DEADLINE_MS = hasImages ? 15000 : 3000;
    let dispatched = false;

    // Treat the message as sent if ANY reliable signal says so. Reading only the
    // originally-captured composer node was the main source of false "may not
    // have sent" warnings: after a send the host often re-renders or navigates
    // (e.g. the first message in a new chat goes / -> /c/<id>), detaching that
    // node while it still holds the old text. So we also check that it's still in
    // the DOM, re-query the *live* composer, and watch the turn count grow.
    function sent() {
      if (input && !input.isConnected) return true;
      if (messageTurnCount() > baselineTurns) return true;
      const live = findComposer() || input;
      return !composerText(live).includes(needle);
    }

    function confirmSend() {
      const deadline = Date.now() + (hasImages ? 16000 : 3500);
      let retried = false;
      (function poll() {
        if (sent()) {
          notifySkin("submit-result", { ok: true });
          postState();
          return;
        }
        if (Date.now() < deadline) {
          // One self-guarding re-dispatch if the live composer still holds our
          // text well after the first attempt. Clicking an *enabled* send button
          // is safe against duplicates: once the message goes out the button
          // disables, so a late click is a no-op. Enter is only a last resort.
          if (!retried && Date.now() - start > 1100) {
            retried = true;
            const button = findSendButton();
            if (isClickable(button)) {
              button.click();
            } else {
              const live = findComposer();
              if (live && live.isConnected) pressEnter(live);
            }
          }
          window.setTimeout(poll, 200);
          return;
        }
        notifySkin("submit-result", { ok: false, reason: "send-failed" });
      })();
    }

    function tryClickOrRetry() {
      if (dispatched) return;
      const sendButton = findSendButton();
      if (isClickable(sendButton)) {
        sendButton.click();
        dispatched = true;
        confirmSend();
        return;
      }
      if (Date.now() - start < SEND_DEADLINE_MS) {
        // If the editor dropped our draft (focus churn resets some editors),
        // re-assert it into the live composer before the next attempt.
        const live = findComposer() || input;
        if (target && live && live.isConnected && !composerText(live)) insertComposerText(live, text);
        window.setTimeout(tryClickOrRetry, 120);
        return;
      }
      // No enabled send button ever appeared — last resort is Enter.
      pressEnter(input);
      dispatched = true;
      confirmSend();
    }

    window.setTimeout(tryClickOrRetry, 50);
    return true;
  }

  function stateFromPage() {
    const conversations = extractConversations();
    const activeConversation = extractActiveConversation(conversations);

    return {
      provider: provider().name,
      conversation: activeConversation,
      conversations,
      activeConversationId: activeConversation.id,
      model: extractModel(),
      effort: extractEffort(),
      messages: extractMessages(),
      profileImage,
      richFormatting,
      imageControl,
      historyLoading,
      historyHasMore,
      conversationsLoading,
      conversationsHasMore
    };
  }

  function postState() {
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({
      source: HOST_SOURCE,
      type: "host-state",
      state: stateFromPage()
    }, SKIN_ORIGIN);
  }

  function notifySkin(type, payload = {}) {
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({ source: HOST_SOURCE, type, ...payload }, SKIN_ORIGIN);
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${FRAME_ID} {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100dvh;
        border: 0;
        z-index: 2147483647;
        background: #f8fafd;
      }

      html.shiki-docs-skin-active,
      html.shiki-docs-skin-active body {
        overflow: hidden !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function ensureFrame() {
    injectStyle();

    if (frame) {
      frame.hidden = false;
      document.documentElement.classList.add("shiki-docs-skin-active");
      postState();
      return;
    }

    frame = document.createElement("iframe");
    frame.id = FRAME_ID;
    frame.title = "Docs style";
    frame.src = chrome.runtime.getURL("index.html");
    frame.addEventListener("load", postState);
    document.documentElement.appendChild(frame);
    document.documentElement.classList.add("shiki-docs-skin-active");
  }

  function hideFrame() {
    if (frame) frame.hidden = true;
    document.documentElement.classList.remove("shiki-docs-skin-active");
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    chrome.storage.local.set({ [STORAGE_KEY]: enabled });

    if (enabled) {
      ensureFrame();
      startSync();
    } else {
      hideFrame();
      stopSync();
    }
  }

  function toggle() {
    setEnabled(!enabled);
  }

  function startSync() {
    stopSync();
    syncTimer = window.setInterval(postState, SYNC_INTERVAL_MS);
  }

  function stopSync() {
    if (syncTimer) {
      window.clearInterval(syncTimer);
      syncTimer = 0;
    }
  }

  // The actual in-page sidebar anchor for a conversation, matched by href or by
  // pathname (our conversation id). Clicking it rides the host's own SPA router.
  function findConversationAnchor(conversationId, href) {
    const config = provider();
    const anchors = config.conversationSelectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    return anchors.find((anchor) => {
      const anchorHref = absoluteHref(anchor.getAttribute("href"));
      if (!anchorHref) return false;
      if (href && anchorHref === href) return true;
      try {
        return new URL(anchorHref).pathname === conversationId;
      } catch {
        return false;
      }
    });
  }

  // A plain, unmodified left click is what SPA routers (Next.js / React Router /
  // Angular) intercept for client-side navigation. Driving navigation this way
  // keeps the page — and therefore our overlay iframe — mounted, so switching
  // chats no longer triggers a full reload (which caused the flicker / the Docs
  // overlay vanishing for a split second).
  function spaClick(el) {
    const opts = { bubbles: true, cancelable: true, view: window, button: 0 };
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
  }

  // After a client-side navigation the host swaps content asynchronously; push a
  // few syncs so the skin's transcript catches up without us reloading anything.
  function pushSyncs(extra = []) {
    const delays = [80, 200, 450, 900, 1500, 2500, 4000, ...extra];
    delays.forEach((delay) => window.setTimeout(postState, delay));
  }

  // The host keeps our overlay mounted but virtualizes chat turns — only the most
  // recent batch lives in the DOM until its scroll container is scrolled up. Walk
  // that container to force older messages to load before we scrape the thread.
  function threadScrollSelectors() {
    const host = location.hostname;
    if (host.includes("chatgpt") || host.includes("openai")) {
      return [
        "main [class*='overflow-y-auto']",
        "[data-testid='conversation-turns']",
        "main .flex.flex-col",
        "main"
      ];
    }
    if (host.includes("claude")) {
      return [
        "[data-testid='messages-container']",
        "[data-testid='conversation-container']",
        "main .overflow-y-auto",
        "main"
      ];
    }
    if (host.includes("gemini")) {
      return [
        "infinite-scroller",
        "message-list",
        "chat-window",
        "main"
      ];
    }
    return ["main"];
  }

  function isScrollable(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      const style = getComputedStyle(el);
      if (!/(auto|scroll|overlay)/.test(style.overflowY)) return false;
      return el.scrollHeight > el.clientHeight + 8;
    } catch {
      return false;
    }
  }

  function fireScroll(el) {
    if (!el) return;
    try {
      el.dispatchEvent(new Event("scroll", { bubbles: true }));
    } catch {
      /* ignore */
    }
  }

  // Walk up from the first scraped turn to find the outermost scrollable ancestor.
  // This is more reliable than guessing selectors — especially while our overlay
  // has overflow:hidden on html/body.
  function scrollParentFromMessages() {
    const nodes = messageNodes();
    if (!nodes.length) return null;
    let el = nodes[0].parentElement;
    let outermost = null;
    while (el && el !== document.documentElement) {
      if (isScrollable(el)) outermost = el;
      el = el.parentElement;
    }
    return outermost;
  }

  function findThreadScroller() {
    const fromMessages = scrollParentFromMessages();
    if (fromMessages) return fromMessages;

    const nodes = messageNodes();
    if (nodes.length) {
      const scores = new Map();
      nodes.forEach((node) => {
        let el = node.parentElement;
        while (el && el !== document.body) {
          if (isScrollable(el)) scores.set(el, (scores.get(el) || 0) + 1);
          el = el.parentElement;
        }
      });
      let best = null;
      let bestScore = 0;
      scores.forEach((count, el) => {
        const score = count * 1000 + el.scrollHeight;
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      });
      if (best) return best;
    }

    const seen = new Set();
    for (const selector of threadScrollSelectors()) {
      let elements = [];
      try {
        elements = Array.from(document.querySelectorAll(selector));
      } catch {
        elements = [];
      }
      for (const el of elements) {
        if (!el || seen.has(el)) continue;
        seen.add(el);
        if (isScrollable(el)) return el;
      }
    }

    return document.scrollingElement || document.documentElement;
  }

  function nudgeScrollerUp(scroller) {
    if (!scroller) return false;
    const before = scroller.scrollTop;
    const step = Math.max(120, Math.floor(scroller.clientHeight * 0.82));
    scroller.scrollBy(0, -step);
    fireScroll(scroller);
    if (scroller.scrollTop >= before - 2) {
      scroller.scrollTop = 0;
      fireScroll(scroller);
    }
    const nodes = messageNodes();
    if (nodes[0]) {
      try {
        nodes[0].scrollIntoView({ block: "start", inline: "nearest" });
        fireScroll(scroller);
      } catch {
        /* ignore */
      }
    }
    return scroller.scrollTop <= 2;
  }

  function firstMessageKey() {
    const nodes = messageNodes();
    if (!nodes.length) return "";
    return messageBodyText(nodes[0], detectAuthor(nodes[0], 0)).slice(0, 64);
  }

  function resetHistoryState() {
    historyHasMore = true;
    historyLoading = false;
  }

  // Pull one older batch from the host thread — only called when the user hits the
  // top of the Shiki doc and scrolls up for more (not on conversation open).
  function loadOlderBatch(done) {
    if (historyLoading) {
      done?.({ loaded: false });
      return;
    }
    if (!historyHasMore) {
      done?.({ loaded: false });
      return;
    }

    historyLoading = true;
    postState();

    const scroller = findThreadScroller();
    const beforeCount = messageNodes().length;
    const beforeHead = firstMessageKey();
    let settled = false;

    const finish = (loaded) => {
      if (settled) return;
      settled = true;
      historyLoading = false;
      if (!loaded) historyHasMore = false;
      postState();
      done?.({ loaded });
    };

    if (!scroller) {
      finish(false);
      return;
    }

    let nudges = 0;
    const maxNudges = 10;
    const pinTimer = window.setInterval(() => nudgeScrollerUp(scroller), 90);

    function check() {
      const afterCount = messageNodes().length;
      const afterHead = firstMessageKey();
      const loaded = afterCount > beforeCount || (!!afterHead && afterHead !== beforeHead);
      if (loaded || nudges >= maxNudges) {
        window.clearInterval(pinTimer);
        finish(loaded);
        return;
      }
      nudges += 1;
      nudgeScrollerUp(scroller);
      window.setTimeout(check, 320);
    }

    window.setTimeout(check, 380);
  }

  // Conversation anchors currently in the host sidebar DOM.
  function sidebarAnchors() {
    const config = provider();
    const anchors = config.conversationSelectors.flatMap((selector) => {
      try {
        return Array.from(document.querySelectorAll(selector));
      } catch {
        return [];
      }
    });
    return anchors.filter((anchor) => isConversationHref(anchor.getAttribute("href"), config));
  }

  // The host's own scrollable sidebar container (innermost scrollable ancestor of
  // the conversation links). Scrolling it down makes the host lazy-load more chats.
  function findSidebarScroller() {
    const anchors = sidebarAnchors();
    if (!anchors.length) return null;
    let el = anchors[0].parentElement;
    while (el && el !== document.documentElement) {
      if (isScrollable(el)) return el;
      el = el.parentElement;
    }
    return null;
  }

  // Pull the next batch of chats into the host sidebar — only called when the user
  // scrolls to the bottom of the Shiki conversation list and wants more.
  function loadMoreConversations(done) {
    if (conversationsLoading || !conversationsHasMore) {
      done?.({ loaded: false });
      return;
    }

    conversationsLoading = true;
    postState();

    const scroller = findSidebarScroller();
    const before = extractConversations().length;
    let settled = false;

    const finish = (loaded) => {
      if (settled) return;
      settled = true;
      conversationsLoading = false;
      if (!loaded) conversationsHasMore = false;
      postState();
      done?.({ loaded });
    };

    if (!scroller) {
      finish(false);
      return;
    }

    let nudges = 0;
    const maxNudges = 8;
    const nudge = () => {
      scroller.scrollTop = scroller.scrollHeight;
      fireScroll(scroller);
    };
    nudge();

    function check() {
      const after = extractConversations().length;
      if (after > before) {
        finish(true);
        return;
      }
      if (nudges >= maxNudges) {
        finish(false);
        return;
      }
      nudges += 1;
      nudge();
      window.setTimeout(check, 280);
    }

    window.setTimeout(check, 320);
  }

  function beginConversationLoad() {
    resetHistoryState();
    pushSyncs();
  }

  function switchConversation(conversationId) {
    resetHistoryState();
    const match = extractConversations().find((conversation) => conversation.id === conversationId);
    if (!match?.href) return;

    if (match.href === location.href) {
      beginConversationLoad();
      return;
    }

    const anchor = findConversationAnchor(conversationId, match.href);
    if (anchor) {
      spaClick(anchor);
      beginConversationLoad();
      // Safety net: if the SPA didn't honor the synthetic click, fall back to a
      // real navigation so clicking a chat never silently does nothing.
      window.setTimeout(() => {
        if (location.pathname !== conversationId && location.href !== match.href) {
          location.assign(match.href);
        }
      }, 900);
      return;
    }

    // No in-page link to ride the SPA router with → fall back to a hard
    // navigation (this still works, it just reloads the page).
    location.assign(match.href);
  }

  // Host-specific controls that start a fresh conversation. Clicking these keeps
  // us on the SPA (no reload); order is most-specific → most-generic.
  function newChatSelectors() {
    const host = location.hostname;
    if (host.includes("chatgpt") || host.includes("openai")) {
      return [
        'a[data-testid="create-new-chat-button"]',
        'button[data-testid="create-new-chat-button"]',
        'nav a[aria-label="New chat"]',
        'a[aria-label="New chat"]',
        'button[aria-label="New chat"]'
      ];
    }
    if (host.includes("claude")) {
      return [
        'a[href="/new"]',
        'a[aria-label*="new chat" i]',
        'button[aria-label*="new chat" i]',
        'button[aria-label*="start new" i]'
      ];
    }
    if (host.includes("gemini")) {
      return [
        '[data-test-id="new-chat-button"]',
        'button[aria-label*="new chat" i]',
        'a[aria-label*="new chat" i]',
        'button[aria-label*="new conversation" i]'
      ];
    }
    return [];
  }

  function newChatUrl() {
    const host = location.hostname;
    if (host.includes("claude")) return "https://claude.ai/new";
    if (host.includes("gemini")) return "https://gemini.google.com/app";
    return location.origin + "/";
  }

  function newChat() {
    resetHistoryState();
    const control = newChatSelectors().map(safeQuery).find(Boolean);
    if (control) {
      const before = location.href;
      spaClick(control);
      pushSyncs();
      // Safety net: if clicking the host's control didn't start a new chat,
      // navigate to the provider's new-chat URL instead.
      window.setTimeout(() => {
        if (location.href === before) location.assign(newChatUrl());
      }, 900);
      return;
    }
    // No recognizable new-chat control on the page → navigate to the provider's
    // new-chat URL as a fallback.
    location.assign(newChatUrl());
  }

  function clickMatchingOption(labelText) {
    const norm = String(labelText || "").toLowerCase().replace(/\s+/g, "");
    if (!norm) return false;
    const options = document.querySelectorAll('[role="menuitem"], [role="option"], [role="menuitemradio"]');
    const match = Array.from(options).find((option) =>
      (option.textContent || "").toLowerCase().replace(/\s+/g, "").includes(norm));
    if (match) {
      match.click();
      return true;
    }
    return false;
  }

  function switchModel(label) {
    if (!label) {
      postState();
      return;
    }
    // Best-effort: open the host's model switcher, then click the matching option.
    // Provider DOMs change often, so this is forgiving and self-closes (Escape)
    // when no match is found.
    const trigger = modelSelectors().map((sel) => document.querySelector(sel)).find(Boolean);
    if (!trigger) {
      postState();
      return;
    }
    trigger.click();
    window.setTimeout(() => {
      if (!clickMatchingOption(label)) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }
      window.setTimeout(postState, 300);
    }, 220);
  }

  function switchEffort(label) {
    if (!label) {
      postState();
      return;
    }
    // Same forgiving open-then-click pattern as switchModel, against the host's
    // reasoning control. No-op (just reflects in the skin) when nothing matches.
    const trigger = effortSelectors().map((sel) => safeQuery(sel)).find(Boolean);
    if (!trigger) {
      postState();
      return;
    }
    trigger.click();
    window.setTimeout(() => {
      if (!clickMatchingOption(label)) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }
      window.setTimeout(postState, 300);
    }, 220);
  }

  window.addEventListener("message", (event) => {
    if (!frame || event.source !== frame.contentWindow) return;

    const message = event.data || {};
    if (message.source !== SKIN_SOURCE) return;

    if (message.type === "ready") beginConversationLoad();
    if (message.type === "switch-conversation") switchConversation(message.conversationId);
    if (message.type === "load-older-history") loadOlderBatch();
    if (message.type === "load-more-conversations") loadMoreConversations();
    if (message.type === "new-chat") newChat();
    if (message.type === "submit-prompt") {
      const reached = submitPrompt(message.text, message.images);
      if (!reached) notifySkin("submit-result", { ok: false, reason: "composer-not-found" });
      window.setTimeout(postState, 600);
    }
    if (message.type === "select-model") {
      switchModel(message.label || message.modelId);
    }
    if (message.type === "select-effort") {
      // Route the exact item the user picked (a reasoning level or the toggle) to
      // the host's reasoning control, best-effort.
      switchEffort(message.picked || message.label || message.effortLevel);
    }
    if (message.type === "toggle-docs-style") {
      toggle();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "SHIKI_TOGGLE") {
      toggle();
      sendResponse({ enabled });
    }

    if (message?.type === "SHIKI_SET_ENABLED") {
      setEnabled(Boolean(message.enabled));
      sendResponse({ enabled });
    }

    if (message?.type === "SHIKI_GET_STATE") {
      sendResponse({ enabled, page: stateFromPage() });
    }

    if (message?.type === "SHIKI_SYNC") {
      postState();
      sendResponse({ enabled, page: stateFromPage() });
    }
  });

  chrome.storage.local.get({ [STORAGE_KEY]: true, [PROFILE_KEY]: "", [RICH_KEY]: true, [IMAGE_CONTROL_KEY]: "composer" }, (result) => {
    enabled = Boolean(result[STORAGE_KEY]);
    profileImage = result[PROFILE_KEY] || "";
    richFormatting = result[RICH_KEY] !== false;
    imageControl = result[IMAGE_CONTROL_KEY] === "insert" || result[IMAGE_CONTROL_KEY] === "toolbar"
      ? "insert"
      : "composer";
    if (enabled) {
      ensureFrame();
      startSync();
    }
  });

  // Reconcile enabled-state and profile picture across tabs and popup changes.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes[STORAGE_KEY]) {
      const next = Boolean(changes[STORAGE_KEY].newValue);
      if (next !== enabled) setEnabled(next);
    }

    if (changes[PROFILE_KEY]) {
      profileImage = changes[PROFILE_KEY].newValue || "";
      postState();
    }

    if (changes[RICH_KEY]) {
      richFormatting = changes[RICH_KEY].newValue !== false;
      postState();
    }

    if (changes[IMAGE_CONTROL_KEY]) {
      imageControl = changes[IMAGE_CONTROL_KEY].newValue === "insert" || changes[IMAGE_CONTROL_KEY].newValue === "toolbar"
        ? "insert"
        : "composer";
      postState();
    }
  });
})();
