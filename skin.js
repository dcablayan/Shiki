(function () {
  const SOURCE = "shiki-docs-skin";
  const HOST_SOURCE = "shiki-host";

  const promptLine = document.querySelector(".prompt-line");
  const modelButton = document.querySelector('[data-action="select-model"]');
  const effortButton = document.querySelector('[data-action="select-effort"]');
  const conversationTitleTargets = document.querySelectorAll("[data-conversation-title]");
  const conversationList = document.querySelector("[data-conversation-list]");
  const chatSearch = document.querySelector("[data-chat-search]");
  const documentContent = document.querySelector("[data-document-content]");
  const documentPage = document.querySelector(".document-page");
  const accountAvatar = document.querySelector("[data-account-avatar]");
  const composerAttachments = document.querySelector("[data-attachments]");
  const attachInput = document.querySelector("[data-attach-input]");
  const avatarInput = document.querySelector("[data-avatar-input]");
  const composerAttach = document.querySelector(".composer-attach");
  const insertMenuItem = document.querySelector("[data-menu-insert]");

  // Photo limits: avatars are tiny (header circle); attached photos can be larger.
  const MAX_AVATAR_BYTES = 1024 * 1024; // 1 MB
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB per attached photo
  const PROFILE_STORAGE_KEY = "shikiProfileImage";
  const IMAGE_CONTROL_KEY = "shikiImageControl";
  // ChatGPT's Pro reasoning tiers (Pro · Standard / Extended) are locked behind the
  // paid Pro plan, so they stay hidden until the user confirms access in the popup.
  const CHATGPT_PRO_KEY = "shikiChatgptPro";

  // Photos staged in the composer; sent with (and cleared on) the next message.
  // Each entry: { id, name, type, dataUrl }.
  let pendingAttachments = [];
  let attachSeq = 0;

  // Conversation-list lazy loading: when the user scrolls to the bottom of the
  // sidebar we ask the host to load older chats (mirrors the thread-history loader).
  let conversationsLoading = false;
  let conversationsHasMore = true;
  let loadingMoreConversations = false;

  let conversations = [
    {
      id: "current",
      title: "Conversation Name",
      label: "Tab 1"
    }
  ];
  let activeConversationId = "current";
  // Current text in the sidebar search box; chats are filtered against it.
  let searchQuery = "";
  // Pinned chats are a skin-only concept (the host pages don't expose pinning),
  // so we track the set of pinned conversation ids here and persist it.
  const PINNED_KEY = "shikiPinnedChats";
  let pinnedIds = new Set();
  // Custom chat names (aliases) and removed-from-list chats are likewise
  // skin-only and persisted. `editingId` holds the chat being renamed inline and
  // suspends list re-rendering so the input isn't destroyed mid-edit.
  const ALIAS_KEY = "shikiChatAliases";
  const HIDDEN_KEY = "shikiHiddenChats";
  let aliases = {};
  let hiddenIds = new Set();
  let editingId = "";
  // First chars of the most recent prompt we asked the host to send. If a later
  // host sync shows it actually landed in the transcript, we retract any "may not
  // have sent" warning — an authoritative safety net on top of content.js checks.
  let pendingSendNeedle = "";
  // Tracks the host's current rich-formatting mode. When it flips we rebuild the
  // transcript so messages switch between plain text and formatted blocks.
  let lastRichMode = null;
  let lastImageControl = null;
  // When the active thread changes we rebuild the transcript from scratch.
  let lastSyncedConversationId = "";
  // After opening a thread, land at the bottom (most recent turns). Older
  // history loads only when the user scrolls to the top and pulls for more.
  let scrollToBottomOnLoad = false;
  // Set when the user picks a chat until the host navigation catches up.
  let pendingSwitchId = "";
  let historyLoading = false;
  let historyHasMore = true;
  let loadingOlderRequest = false;
  const SCROLL_TOP_EPS = 16;
  // Origin of the embedding host frame, captured from the first validated
  // inbound message. Used to pin outbound postMessage targets (never "*").
  let hostOrigin = "";
  let appliedProfileImage = null;
  // Mirror of the transcript currently in the DOM, so host syncs can be
  // reconciled (diffed) instead of wiping and rebuilding the whole document.
  let renderedMessages = [];
  // Default to ChatGPT so the model/effort menus match the static HTML default
  // (GPT-5.5) before the first host sync arrives.
  let currentProvider = "ChatGPT";
  let openMenuEl = null;
  let toastTimer = 0;
  const titleRow = document.querySelector(".tabs-title-row");

  // Per-provider models and their reasoning options, per the V2 spec. `efforts`
  // are the selectable reasoning levels; `proEfforts` are extra levels gated behind
  // a paid plan that only appear once the user confirms access (see CHATGPT_PRO_KEY);
  // `toggle` is an independent on/off modifier the provider exposes alongside them
  // (e.g. extended thinking), and `toggleDefault: true` makes that modifier start ON
  // for the model. The host page stays the source of truth: the active
  // model is mirrored from it when available and selections are routed back to the
  // host's real controls.
  const PROVIDER_MODELS = {
    ChatGPT: [
      { label: "GPT-5.5", efforts: ["Instant", "Medium", "High", "Extra High"], proEfforts: ["Pro · Standard", "Pro · Extended"], default: "Instant" },
      { label: "GPT-5.4", efforts: ["Instant", "Medium", "High", "Extra High"], proEfforts: ["Pro · Standard", "Pro · Extended"], default: "Instant" },
      { label: "GPT-5.3", efforts: ["Instant"] },
      { label: "GPT-4.5", efforts: ["Instant"] },
      { label: "o3", efforts: ["Medium"] }
    ],
    Claude: [
      // Fable 5 is intentionally omitted until it's publicly available again.
      // Primary models (host's top-level model menu). `toggle` is the host's
      // reasoning switch — "Thinking" (optional, "can think for complex tasks") or
      // "Extended" ("always uses deep reasoning") — and `default` is the level the
      // host tags as Default in its effort submenu.
      { label: "Opus 4.8", efforts: ["Low", "Medium", "High", "Extra", "Max"], toggle: "Thinking", toggleDefault: true, default: "High" },
      { label: "Sonnet 4.6", efforts: ["Low", "Medium", "High", "Max"], toggle: "Thinking", default: "Low" },
      { label: "Haiku 4.5", efforts: [], toggle: "Extended" },
      // Secondary models (host's "More models" submenu). All verified via screenshots:
      // 4.7 uses the same levels as 4.8 but defaults to Extra; 4.6 defaults to Medium
      // with the Extended toggle; Opus 3 has no reasoning controls at all.
      { label: "Opus 4.7", efforts: ["Low", "Medium", "High", "Extra", "Max"], toggle: "Thinking", toggleDefault: true, default: "Extra" },
      { label: "Opus 4.6", efforts: ["Low", "Medium", "High", "Max"], toggle: "Extended", toggleDefault: true, default: "Medium" },
      { label: "Opus 3", efforts: [] }
    ],
    Gemini: [
      // Menu order matches the host. "Thinking level" is the reasoning control —
      // Standard ("best for most questions") / Extended ("complex problem solving"),
      // default Standard — and all three models expose the same two levels.
      { label: "3.1 Flash-Lite", efforts: ["Standard", "Extended"], default: "Standard" },
      { label: "3.5 Flash", efforts: ["Standard", "Extended"], default: "Standard" },
      { label: "3.1 Pro", efforts: ["Standard", "Extended"], default: "Standard" }
    ],
    AI: [
      { label: "Default", efforts: [] }
    ]
  };

  // Reasoning selection is skin-owned (the host's effort controls vary and aren't
  // reliably scrapeable). It resets to the model's default when the model changes,
  // and is routed to the host best-effort on selection.
  let currentEffortLabel = "";
  let toggleOn = false;
  let hasProAccess = false;
  let lastModelLabel = "";

  function normLabel(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, "");
  }

  function modelsForProvider(prov) {
    return PROVIDER_MODELS[prov] || PROVIDER_MODELS.AI;
  }

  function findModelEntry(prov, label) {
    const list = modelsForProvider(prov);
    const n = normLabel(label);
    return list.find((m) => normLabel(m.label) === n)
      || (n && list.find((m) => normLabel(m.label).includes(n) || n.includes(normLabel(m.label))))
      || list[0];
  }

  function currentModelLabel() {
    return (modelButton && modelButton.querySelector(".control-label")?.textContent) || "";
  }

  function currentModelEntry() {
    return findModelEntry(currentProvider, currentModelLabel());
  }

  // A model's effective reasoning levels: its base efforts plus any Pro-tier levels,
  // which only unlock once the user confirms paid access (Pro is $200/mo on ChatGPT).
  function effortsFor(entry) {
    if (!entry) return [];
    const base = (entry.efforts || []).slice();
    if (hasProAccess && entry.proEfforts && entry.proEfforts.length) {
      return base.concat(entry.proEfforts);
    }
    return base;
  }

  // Menu items for a model's reasoning control: its levels plus the toggle (if any).
  function effortItemsFor(entry) {
    if (!entry) return [];
    const items = effortsFor(entry);
    if (entry.toggle) items.push(entry.toggle);
    return items;
  }

  function defaultEffortFor(entry) {
    const efforts = effortsFor(entry);
    if (!efforts.length) return "";
    if (entry.default && efforts.includes(entry.default)) return entry.default;
    return efforts.includes("High") ? "High" : efforts[0];
  }

  // The model's default on/off state for its `toggle` modifier (e.g. some models
  // ship with extended thinking on). False when the model has no toggle.
  function defaultToggleFor(entry) {
    return !!(entry && entry.toggle && entry.toggleDefault);
  }

  // Reflect current reasoning state onto the effort control, and disable it for
  // models that expose no reasoning options (e.g. Opus 3).
  function syncEffortControl() {
    if (!effortButton) return;
    const entry = currentModelEntry();
    const items = effortItemsFor(entry);
    const efforts = effortsFor(entry);
    const hasEfforts = efforts.length > 0;
    const hasToggle = !!(entry && entry.toggle);
    const labelSpan = effortButton.querySelector(".control-label");

    if (!items.length) {
      effortButton.disabled = true;
      effortButton.setAttribute("aria-label", "No reasoning options");
      effortButton.removeAttribute("title");
      if (labelSpan) labelSpan.textContent = "";
      return;
    }
    effortButton.disabled = false;

    if (hasEfforts && !efforts.includes(currentEffortLabel)) {
      currentEffortLabel = defaultEffortFor(entry);
    }
    if (!hasEfforts) currentEffortLabel = "";

    const parts = [];
    if (hasEfforts && currentEffortLabel) parts.push(currentEffortLabel);
    if (hasToggle) parts.push(`${entry.toggle} ${toggleOn ? "on" : "off"}`);
    const desc = parts.join(" · ") || "Reasoning";

    if (labelSpan) labelSpan.textContent = currentEffortLabel || (hasToggle ? entry.toggle : "");
    effortButton.setAttribute("aria-label", `Reasoning: ${desc}`);
    effortButton.title = `Reasoning: ${desc}`;
    effortButton.dataset.effortLevel = normLabel(currentEffortLabel);
  }

  // Pro tiers are skin-gated behind an explicit opt-in (Shiki can't reliably read
  // the host's plan), so toggling access re-validates the current reasoning level —
  // a Pro level falls back to the model default when access is turned off.
  function applyProAccess(value) {
    const next = !!value;
    if (next === hasProAccess) return;
    hasProAccess = next;
    syncEffortControl();
  }

  function loadProAccessPreference() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get({ [CHATGPT_PRO_KEY]: false }, (result) => {
          applyProAccess(result[CHATGPT_PRO_KEY] === true);
        });
        return;
      }
    } catch {
      /* fall through to localStorage */
    }
    try {
      applyProAccess(localStorage.getItem(CHATGPT_PRO_KEY) === "true");
    } catch {
      applyProAccess(false);
    }
  }

  function normalizeImageControl(mode) {
    return mode === "insert" || mode === "toolbar" ? "insert" : "composer";
  }

  function applyImageControl(mode) {
    const useInsert = normalizeImageControl(mode) === "insert";
    if (composerAttach) composerAttach.hidden = useInsert;
    if (insertMenuItem) {
      if (useInsert) {
        insertMenuItem.dataset.action = "attach-image";
        insertMenuItem.classList.add("is-active");
        insertMenuItem.setAttribute("role", "button");
        insertMenuItem.setAttribute("tabindex", "0");
        insertMenuItem.title = "Insert image";
      } else {
        delete insertMenuItem.dataset.action;
        insertMenuItem.classList.remove("is-active");
        insertMenuItem.removeAttribute("role");
        insertMenuItem.removeAttribute("tabindex");
        insertMenuItem.removeAttribute("title");
      }
    }
  }

  function loadImageControlPreference() {
    const apply = (mode) => {
      const normalized = normalizeImageControl(mode);
      applyImageControl(normalized);
      lastImageControl = normalized;
    };
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get({ [IMAGE_CONTROL_KEY]: "composer" }, (result) => {
          apply(result[IMAGE_CONTROL_KEY]);
        });
        return;
      }
    } catch {
      /* fall through to localStorage */
    }
    try {
      apply(localStorage.getItem(IMAGE_CONTROL_KEY));
    } catch {
      apply("composer");
    }
  }

  function applyProfileImage(url) {
    if (!accountAvatar) return;
    const value = typeof url === "string" ? url : "";
    // Only accept inline data-image URLs (matches CSP img-src 'self' data:) and
    // reject anything that could break out of the url("...") wrapper.
    const safe = /^data:image\//i.test(value) && !/["\n\r]/.test(value) ? value : "";
    if (safe === appliedProfileImage) return;
    appliedProfileImage = safe;
    if (safe) {
      accountAvatar.style.backgroundImage = `url("${safe}")`;
      accountAvatar.style.backgroundSize = "cover";
      accountAvatar.style.backgroundPosition = "center";
    } else {
      accountAvatar.style.backgroundImage = "";
    }
  }

  // Read an image File into a data: URL. Resolves to { dataUrl, name, type },
  // { error: "too-large" }, or null (not an image / unreadable).
  function readImageFile(file, maxBytes) {
    return new Promise((resolve) => {
      if (!file || !file.type || !file.type.startsWith("image/")) {
        resolve(null);
        return;
      }
      if (maxBytes && file.size > maxBytes) {
        resolve({ error: "too-large" });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result || "");
        resolve(/^data:image\//i.test(url) ? { dataUrl: url, name: file.name || "image", type: file.type } : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  // Only render image sources the extension CSP permits (data:/https:/blob:).
  function isRenderableImageSrc(src) {
    return /^(data:image\/|https:\/\/|blob:)/i.test(String(src || "").trim());
  }

  // Persist the avatar to extension storage so it survives reloads and other tabs
  // pick it up via storage.onChanged. Falls back silently when chrome isn't present.
  function persistProfileImage(dataUrl) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: dataUrl });
      }
    } catch {
      /* preview mode (no chrome) — applied in-memory for the session only */
    }
  }

  // Set the profile picture from a chosen file. Applied immediately for instant
  // feedback; persisted so the content script mirrors it on the next sync.
  async function handleAvatarFile(fileList) {
    const file = fileList && fileList[0];
    if (!file) return;
    const result = await readImageFile(file, MAX_AVATAR_BYTES);
    if (!result) {
      showToast("Couldn't read that image.");
      return;
    }
    if (result.error === "too-large") {
      showToast("Image too large (max 1 MB).");
      return;
    }
    persistProfileImage(result.dataUrl);
    applyProfileImage(result.dataUrl);
    showToast("Profile picture updated.");
  }

  // ---- Composer photo attachments -------------------------------------------
  function renderAttachments() {
    if (!composerAttachments) return;
    composerAttachments.textContent = "";
    if (!pendingAttachments.length) {
      composerAttachments.hidden = true;
      return;
    }
    composerAttachments.hidden = false;
    pendingAttachments.forEach((att) => {
      const chip = document.createElement("div");
      chip.className = "composer-chip";
      // dataUrl is base64 (no quotes/newlines) so the url("…") wrapper is safe.
      chip.style.backgroundImage = `url("${att.dataUrl}")`;
      chip.title = att.name;

      const remove = document.createElement("span");
      remove.className = "composer-chip-remove";
      remove.dataset.action = "remove-attachment";
      remove.dataset.attachmentId = att.id;
      remove.setAttribute("role", "button");
      remove.setAttribute("tabindex", "0");
      remove.setAttribute("aria-label", `Remove ${att.name}`);
      remove.textContent = "×";
      chip.appendChild(remove);
      composerAttachments.appendChild(chip);
    });
  }

  async function addAttachmentFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => file && file.type && file.type.startsWith("image/"));
    if (!files.length) return;
    let rejected = 0;
    for (const file of files) {
      const result = await readImageFile(file, MAX_IMAGE_BYTES);
      if (!result || result.error) {
        rejected += 1;
        continue;
      }
      attachSeq += 1;
      pendingAttachments.push({ id: `att-${attachSeq}`, name: result.name, type: result.type, dataUrl: result.dataUrl });
    }
    renderAttachments();
    if (rejected) showToast("Some photos couldn't be added (max 8 MB each).");
    if (promptLine) promptLine.focus();
  }

  function removeAttachment(id) {
    pendingAttachments = pendingAttachments.filter((att) => att.id !== id);
    renderAttachments();
  }

  function clearAttachments() {
    pendingAttachments = [];
    renderAttachments();
  }

  function showToast(message) {
    let toast = document.querySelector(".skin-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "skin-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    // force reflow so the transition replays on repeat failures
    void toast.offsetWidth;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 4200);
  }

  function flash(element) {
    element.classList.remove("state-flash");
    void element.offsetWidth;
    element.classList.add("state-flash");
    setTimeout(() => element.classList.remove("state-flash"), 450);
  }

  function notifyHost(type, payload = {}) {
    if (!window.parent || window.parent === window) return;

    let targetOrigin = hostOrigin;
    if (!targetOrigin) {
      try {
        targetOrigin = new URL(document.referrer).origin;
      } catch {
        targetOrigin = "";
      }
    }

    // Never broadcast user data to "*"; drop until we know the host origin.
    if (!targetOrigin || targetOrigin === "null") return;
    window.parent.postMessage({ source: SOURCE, type, ...payload }, targetOrigin);
  }

  function updateSelector(button, label, dataKey, value) {
    if (!button) return;
    const target = button.querySelector(".control-label");
    if (target) target.textContent = label;
    if (dataKey) button.dataset[dataKey] = value;
  }

  // Persist one skin-only collection (pins / aliases / hidden) to extension
  // storage, falling back to localStorage when the chrome API isn't available
  // (e.g. when previewing the skin outside the extension).
  function persist(key, value) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ [key]: value });
        return;
      }
    } catch {
      /* fall through to localStorage */
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* persistence unavailable — state stays in-memory for the session */
    }
  }

  function loadStored() {
    const apply = (data) => {
      pinnedIds = new Set(Array.isArray(data[PINNED_KEY]) ? data[PINNED_KEY] : []);
      hiddenIds = new Set(Array.isArray(data[HIDDEN_KEY]) ? data[HIDDEN_KEY] : []);
      aliases = data[ALIAS_KEY] && typeof data[ALIAS_KEY] === "object" ? data[ALIAS_KEY] : {};
      renderConversations();
    };
    const defaults = { [PINNED_KEY]: [], [HIDDEN_KEY]: [], [ALIAS_KEY]: {} };
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get(defaults, (result) => apply(result || defaults));
        return;
      }
    } catch {
      /* fall through to localStorage */
    }
    const readLS = (key, fallback) => {
      try {
        const value = JSON.parse(localStorage.getItem(key));
        return value == null ? fallback : value;
      } catch {
        return fallback;
      }
    };
    apply({
      [PINNED_KEY]: readLS(PINNED_KEY, []),
      [HIDDEN_KEY]: readLS(HIDDEN_KEY, []),
      [ALIAS_KEY]: readLS(ALIAS_KEY, {})
    });
  }

  function togglePin(id) {
    if (!id) return;
    if (pinnedIds.has(id)) pinnedIds.delete(id);
    else pinnedIds.add(id);
    persist(PINNED_KEY, Array.from(pinnedIds));
    renderConversations();
  }

  // The label to show for a chat: a user-set alias wins over the host title.
  function displayLabel(conversation) {
    const id = conversation.id;
    return (id && aliases[id]) || conversation.label || conversation.title || "Conversation";
  }

  function setAlias(id, value) {
    if (!id) return;
    const name = String(value || "").trim();
    if (name) aliases[id] = name;
    else delete aliases[id]; // empty name clears the alias (revert to host title)
    persist(ALIAS_KEY, aliases);
  }

  // "Remove from list" hides a chat from the Shiki sidebar only — it does NOT
  // delete the conversation on the underlying provider, so it's non-destructive
  // and reversible (by clearing the stored hidden set).
  function removeConversation(id) {
    if (!id) return;
    hiddenIds.add(id);
    persist(HIDDEN_KEY, Array.from(hiddenIds));
    renderConversations();
  }

  // Inline rename: overlay a text field on top of the row. The overlay lives on
  // the (positioned) sidebar, not inside the row <button>, so we don't nest an
  // interactive field inside a button.
  function startRename(conversation, rowEl) {
    if (!conversationList || !rowEl) return;
    closeMenu();
    editingId = conversation.id;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "tab-rename-input";
    input.value = displayLabel(conversation);
    input.setAttribute("aria-label", "Rename chat");
    input.style.top = `${rowEl.offsetTop}px`;
    input.style.height = `${rowEl.offsetHeight}px`;

    let settled = false;
    const finish = (commit) => {
      if (settled) return;
      settled = true;
      const value = input.value;
      input.remove();
      editingId = "";
      if (commit) setAlias(conversation.id, value);
      renderConversations();
    };

    input.addEventListener("mousedown", (event) => event.stopPropagation());
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(true));

    conversationList.appendChild(input);
    input.focus();
    input.select();
  }

  function openRowMenu(rowEl, conversation) {
    closeMenu();
    if (!conversationList || !rowEl) return;

    const pinned = pinnedIds.has(conversation.id);
    const menu = document.createElement("div");
    menu.className = "skin-menu row-menu";
    menu.setAttribute("role", "menu");
    menu.style.top = `${rowEl.offsetTop + rowEl.offsetHeight - 6}px`;

    const addItem = (label, onSelect, danger) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = `skin-menu-item${danger ? " is-danger" : ""}`;
      option.setAttribute("role", "menuitem");
      option.textContent = label;
      option.addEventListener("click", (event) => {
        event.stopPropagation();
        closeMenu();
        onSelect();
      });
      menu.appendChild(option);
    };

    addItem("Rename", () => startRename(conversation, rowEl));
    addItem(pinned ? "Unpin" : "Pin", () => togglePin(conversation.id));
    addItem("Remove from list", () => removeConversation(conversation.id), true);

    conversationList.appendChild(menu);
    openMenuEl = menu;
  }

  // Build one conversation row. Host-scraped ids/labels are inserted as
  // text/attributes only (never HTML), so there's no injection surface.
  function buildConversationRow(conversation, index) {
    const id = conversation.id || `conversation-${index + 1}`;
    const label = displayLabel(conversation) || `Tab ${index + 1}`;
    const active = id === activeConversationId;
    const pinned = pinnedIds.has(id);

    const button = document.createElement("button");
    button.className = `tab-row${active ? " is-active" : ""}${pinned ? " is-pinned" : ""}`;
    button.dataset.action = "switch-conversation";
    button.dataset.conversationId = id;
    button.setAttribute("aria-current", active ? "page" : "false");
    button.setAttribute("aria-label", `Switch to ${label}`);
    // Static, trusted markup only (no interpolated data).
    button.insertAdjacentHTML("afterbegin", '<svg class="icon tab-doc"><use href="#i-tab-doc"></use></svg>');

    const labelSpan = document.createElement("span");
    labelSpan.className = "tab-label";
    labelSpan.setAttribute("data-conversation-label", "");
    labelSpan.textContent = label;
    button.appendChild(labelSpan);

    // The pin toggle is a span (role=button) rather than a real <button> so it
    // can live inside the row button without nesting interactive form controls.
    const pin = document.createElement("span");
    pin.className = "tab-pin";
    pin.dataset.action = "toggle-pin";
    pin.dataset.conversationId = id;
    pin.setAttribute("role", "button");
    pin.setAttribute("tabindex", "0");
    pin.setAttribute("aria-pressed", String(pinned));
    pin.setAttribute("aria-label", pinned ? `Unpin ${label}` : `Pin ${label}`);
    pin.title = pinned ? "Unpin" : "Pin";
    pin.insertAdjacentHTML("beforeend", `<svg class="icon"><use href="#${pinned ? "i-star-filled" : "i-star"}"></use></svg>`);
    button.appendChild(pin);

    // Overflow menu (rename / pin / remove). Also a span (role=button) so it can
    // sit inside the row button.
    const actions = document.createElement("span");
    actions.className = "tab-actions";
    actions.dataset.action = "conversation-menu";
    actions.dataset.conversationId = id;
    actions.setAttribute("role", "button");
    actions.setAttribute("tabindex", "0");
    actions.setAttribute("aria-haspopup", "menu");
    actions.setAttribute("aria-label", `More options for ${label}`);
    actions.title = "More options";
    actions.insertAdjacentHTML("beforeend", '<svg class="icon"><use href="#i-dots"></use></svg>');
    button.appendChild(actions);

    return button;
  }

  function addGroupLabel(text) {
    const labelEl = document.createElement("div");
    labelEl.className = "conversation-group-label";
    labelEl.textContent = text;
    conversationList.appendChild(labelEl);
  }

  function renderConversations(nextConversations = conversations, activeId = activeConversationId) {
    if (!conversationList) return;
    // Don't rebuild the list while an inline rename is open, or we'd destroy the
    // input (and its caret/selection) mid-edit.
    if (editingId) return;
    // Likewise, the row overflow menu now lives inside the (scrolling) list, so a
    // background sync rebuild would wipe it mid-interaction. Hold off until it closes.
    if (openMenuEl && conversationList.contains(openMenuEl)) return;
    conversations = nextConversations.length ? nextConversations : conversations;
    activeConversationId = activeId || conversations[0]?.id || "current";

    const query = searchQuery.trim().toLowerCase();
    const visible = conversations.filter((conversation) => !hiddenIds.has(conversation.id));
    const matches = visible.filter((conversation) =>
      !query || displayLabel(conversation).toLowerCase().includes(query));
    const indexOf = (conversation) => conversations.indexOf(conversation);

    const prevScroll = conversationList.scrollTop;
    conversationList.textContent = "";

    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "conversation-empty";
      empty.textContent = query ? "No chats found" : "No conversations yet";
      conversationList.appendChild(empty);
      return;
    }

    const pinned = matches.filter((conversation) => pinnedIds.has(conversation.id));
    const regular = matches.filter((conversation) => !pinnedIds.has(conversation.id));

    // Only show section headers once there's something pinned; otherwise keep the
    // original clean, label-free list.
    if (pinned.length) {
      addGroupLabel("Pinned");
      pinned.forEach((conversation) => conversationList.appendChild(buildConversationRow(conversation, indexOf(conversation))));
      if (regular.length) addGroupLabel("Chats");
    }
    regular.forEach((conversation) => conversationList.appendChild(buildConversationRow(conversation, indexOf(conversation))));
    // Preserve the user's scroll position across background-sync rebuilds, so
    // scrolling down toward older chats isn't yanked back to the top every sync
    // and newly loaded chats stay reachable.
    conversationList.scrollTop = prevScroll;
  }

  function selectConversation(input, options = {}) {
    const fallback = conversations[0] || { id: "current", title: "Conversation Name", label: "Tab 1" };
    const next = typeof input === "string"
      ? conversations.find((conversation) => conversation.id === input) || fallback
      : { ...fallback, ...input };

    activeConversationId = next.id;
    const shownTitle = (next.id && aliases[next.id]) || next.title || next.label || "Conversation Name";
    conversationTitleTargets.forEach((target) => {
      target.textContent = shownTitle;
    });
    document.title = `${shownTitle} - Google Docs Skin`;
    if (documentPage) documentPage.dataset.conversationId = next.id;

    renderConversations(conversations, next.id);

    if (!options.silent) {
      renderedMessages = [];
      if (documentContent) documentContent.textContent = "";
      pendingSendNeedle = "";
      scrollToBottomOnLoad = true;
      pendingSwitchId = next.id;
      notifyHost("switch-conversation", { conversationId: next.id, conversation: next });
    }

    return next;
  }

  function applyHostState(state = {}) {
    if (state.provider) currentProvider = state.provider;

    if (Array.isArray(state.conversations)) {
      conversations = state.conversations.map((conversation, index) => ({
        id: conversation.id || conversation.href || `conversation-${index + 1}`,
        title: conversation.title || conversation.label || `Conversation ${index + 1}`,
        label: conversation.label || conversation.title || `Tab ${index + 1}`,
        href: conversation.href || ""
      }));
    }

    if (state.model) {
      const label = state.model.label || state.model.id || currentModelLabel() || "GPT-5.5";
      updateSelector(modelButton, label, "modelId", state.model.id || normLabel(label).replace(/[^a-z0-9.]+/g, "-"));
    }

    // When the active model changes, reset reasoning to that model's default.
    // Effort is skin-owned, so we don't let the crude host scrape override a user
    // choice on every sync.
    const modelLabelNow = currentModelLabel();
    if (modelLabelNow !== lastModelLabel) {
      const entry = findModelEntry(currentProvider, modelLabelNow);
      currentEffortLabel = defaultEffortFor(entry);
      toggleOn = defaultToggleFor(entry);
      lastModelLabel = modelLabelNow;
    }
    syncEffortControl();

    if (typeof state.profileImage === "string") {
      applyProfileImage(state.profileImage);
    }

    // If the rich-formatting toggle flipped, drop the rendered cache so the next
    // render rebuilds every message in the new mode (plain <-> formatted blocks).
    const richNow = state.richFormatting !== false;
    if (lastRichMode !== null && richNow !== lastRichMode && documentContent) {
      renderedMessages = [];
      documentContent.textContent = "";
    }
    lastRichMode = richNow;
    if (documentContent) documentContent.classList.toggle("is-rich", richNow);

    const imageControlNow = normalizeImageControl(state.imageControl);
    if (lastImageControl !== imageControlNow) {
      applyImageControl(imageControlNow);
      lastImageControl = imageControlNow;
    }

    const incomingId = state.activeConversationId || state.conversation?.id || "";
    const hostCaughtUp = !pendingSwitchId || incomingId === pendingSwitchId;
    historyLoading = !!state.historyLoading;
    historyHasMore = state.historyHasMore !== false;
    if (!historyLoading) loadingOlderRequest = false;
    conversationsLoading = !!state.conversationsLoading;
    conversationsHasMore = state.conversationsHasMore !== false;
    if (!conversationsLoading) loadingMoreConversations = false;
    if (documentContent) {
      // Keep the top hint mounted during fetch so layout doesn't jump when loading starts.
      documentContent.classList.toggle("can-load-older", historyHasMore);
      documentContent.classList.toggle("history-loading", historyLoading && loadingOlderRequest);
    }

    if (incomingId && incomingId !== lastSyncedConversationId && hostCaughtUp) {
      renderedMessages = [];
      if (documentContent) documentContent.textContent = "";
      lastSyncedConversationId = incomingId;
      scrollToBottomOnLoad = true;
      pendingSwitchId = "";
    }

    if (Array.isArray(state.messages) && hostCaughtUp) {
      renderDocumentContent(state.messages);
      // If the host transcript now shows the prompt we just sent, retract any
      // stale "may not have sent" warning regardless of what the send probe said.
      if (pendingSendNeedle) {
        const landed = state.messages.some((msg) =>
          msg.author === "user"
          && (msg.text || "").replace(/\s+/g, " ").trim().toLowerCase().includes(pendingSendNeedle));
        if (landed) {
          pendingSendNeedle = "";
          const toast = document.querySelector(".skin-toast");
          if (toast) toast.classList.remove("is-visible");
        }
      }
    }

    renderConversations(conversations, pendingSwitchId || state.activeConversationId || state.conversation?.id || activeConversationId);
    if (hostCaughtUp) {
      selectConversation(state.conversation || state.activeConversationId || activeConversationId, { silent: true });
    }
  }

  // Only http(s)/mailto links are turned into anchors; anything else (javascript:,
  // data:, etc.) renders as plain text. Defense against malicious model output.
  function isSafeHref(href) {
    return /^(https?:|mailto:)/i.test(String(href || "").trim());
  }

  // Append inline runs (text with bold/italic/code/strike/link marks) as DOM.
  // Every visible character is added via textContent / text nodes, so reverse-
  // engineered host content can never inject markup. "\n" within a run becomes <br>.
  function appendInlineRuns(parent, runs) {
    let started = false;
    (runs || []).forEach((run) => {
      let text = String(run && run.text != null ? run.text : "");
      if (!started) text = text.replace(/^\n+/, "");
      if (!text) return;
      text.split("\n").forEach((piece, index) => {
        if (index > 0) {
          parent.appendChild(document.createElement("br"));
          started = true;
        }
        if (!piece) return;
        started = true;
        let el;
        if (run.code) {
          el = document.createElement("code");
          el.className = "doc-inline-code";
        } else if (run.href && isSafeHref(run.href)) {
          el = document.createElement("a");
          el.className = "doc-link";
          el.href = run.href;
          el.target = "_blank";
          el.rel = "noopener noreferrer";
        } else if (run.bold || run.italic || run.strike) {
          el = document.createElement("span");
        } else {
          parent.appendChild(document.createTextNode(piece));
          return;
        }
        el.textContent = piece;
        if (run.bold) el.style.fontWeight = "700";
        if (run.italic) el.style.fontStyle = "italic";
        if (run.strike) el.style.textDecoration = "line-through";
        parent.appendChild(el);
      });
    });
  }

  function buildDocList(block, role) {
    const list = document.createElement(block.ordered ? "ol" : "ul");
    list.className = `doc-list ${block.ordered ? "doc-list-ordered" : "doc-list-unordered"}`;
    (block.items || []).forEach((item) => {
      const li = document.createElement("li");
      li.dataset.author = role;
      appendInlineRuns(li, item.runs);
      (item.sublists || []).forEach((sub) => li.appendChild(buildDocList(sub, role)));
      list.appendChild(li);
    });
    return list;
  }

  function buildDocTable(block, role) {
    const table = document.createElement("table");
    table.className = "doc-table";
    if (block.header && block.header.length) {
      const thead = document.createElement("thead");
      const tr = document.createElement("tr");
      block.header.forEach((cell) => {
        const th = document.createElement("th");
        th.dataset.author = role;
        appendInlineRuns(th, cell);
        tr.appendChild(th);
      });
      thead.appendChild(tr);
      table.appendChild(thead);
    }
    const tbody = document.createElement("tbody");
    (block.rows || []).forEach((row) => {
      const tr = document.createElement("tr");
      (row || []).forEach((cell) => {
        const td = document.createElement("td");
        appendInlineRuns(td, cell);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  // Render the block AST produced by content.js into the document wrapper.
  function renderBlocks(wrap, role, blocks) {
    (blocks || []).forEach((block) => {
      if (!block) return;
      if (block.type === "h") {
        const level = Math.min(Math.max(Number(block.level) || 2, 1), 6);
        const heading = document.createElement("h" + level);
        heading.className = "doc-h doc-h" + level;
        heading.dataset.author = role;
        appendInlineRuns(heading, block.runs);
        wrap.appendChild(heading);
      } else if (block.type === "list") {
        wrap.appendChild(buildDocList(block, role));
      } else if (block.type === "code") {
        const pre = document.createElement("pre");
        pre.className = "doc-code-block";
        if (block.lang) pre.dataset.lang = block.lang;
        const code = document.createElement("code");
        code.textContent = String(block.text == null ? "" : block.text);
        pre.appendChild(code);
        wrap.appendChild(pre);
      } else if (block.type === "quote") {
        const quote = document.createElement("blockquote");
        quote.className = "doc-quote";
        quote.dataset.author = role;
        renderBlocks(quote, role, block.blocks);
        wrap.appendChild(quote);
      } else if (block.type === "table") {
        const scroll = document.createElement("div");
        scroll.className = "doc-table-wrap";
        scroll.appendChild(buildDocTable(block, role));
        wrap.appendChild(scroll);
      } else if (block.type === "hr") {
        const hr = document.createElement("hr");
        hr.className = "doc-hr";
        wrap.appendChild(hr);
      } else if (block.type === "image") {
        if (isRenderableImageSrc(block.src)) {
          const img = document.createElement("img");
          img.className = "doc-image";
          img.src = block.src;
          img.alt = block.alt || "";
          img.loading = "lazy";
          wrap.appendChild(img);
        }
      } else {
        const p = document.createElement("p");
        p.dataset.author = role;
        appendInlineRuns(p, block.runs);
        wrap.appendChild(p);
      }
    });
  }

  // Lightweight fingerprint of a block AST so streaming formatting updates
  // (headings/lists/code appearing) trigger a re-render even when collapsed text
  // hasn't changed yet.
  function blocksFingerprint(blocks) {
    if (!blocks || !blocks.length) return "";
    let chars = 0;
    const walkRuns = (runs) => {
      (runs || []).forEach((run) => { chars += String(run.text || "").length; });
    };
    const walk = (list) => {
      (list || []).forEach((block) => {
        if (block.text) chars += block.text.length;
        if (block.src) chars += String(block.src).length;
        if (block.runs) walkRuns(block.runs);
        if (block.blocks) walk(block.blocks);
        if (block.items) {
          block.items.forEach((item) => {
            walkRuns(item.runs);
            (item.sublists || []).forEach((sub) => walk([{ type: "list", items: sub.items }]));
          });
        }
        if (block.header) block.header.forEach(walkRuns);
        if (block.rows) block.rows.forEach((row) => row.forEach(walkRuns));
      });
    };
    walk(blocks);
    return `${blocks.length}:${chars}`;
  }

  // Fill one message wrapper. With a block AST (formatted assistant turn) we
  // render rich blocks; otherwise blank lines split paragraphs and single
  // newlines become <br>. All text is inserted via text nodes either way, so
  // message content can never inject markup.
  // Append a message's attached photos (user uploads, or assistant images when
  // rich formatting is off). Rich assistant turns render images inline as blocks.
  function appendMessageImages(wrap, item) {
    const images = item && Array.isArray(item.images) ? item.images : null;
    if (!images || !images.length) return;
    const gallery = document.createElement("div");
    gallery.className = "msg-images";
    images.forEach((image) => {
      const src = image && typeof image === "object" ? image.src : image;
      if (!isRenderableImageSrc(src)) return;
      const img = document.createElement("img");
      img.src = src;
      img.alt = (image && image.alt) || "";
      img.loading = "lazy";
      gallery.appendChild(img);
    });
    if (gallery.childNodes.length) wrap.appendChild(gallery);
  }

  function fillMessageNode(wrap, role, item) {
    wrap.textContent = "";
    const blocks = item && item.blocks;
    const useBlocks = lastRichMode !== false && blocks && blocks.length;
    if (useBlocks) {
      renderBlocks(wrap, role, blocks);
      return;
    }
    const text = item && typeof item === "object" ? (item.text || "") : String(item || "");
    String(text).split(/\n{2,}/).forEach((paragraph) => {
      if (!paragraph) return;
      const p = document.createElement("p");
      p.dataset.author = role;
      paragraph.split("\n").forEach((line, index) => {
        if (index > 0) p.appendChild(document.createElement("br"));
        p.appendChild(document.createTextNode(line));
      });
      wrap.appendChild(p);
    });
    appendMessageImages(wrap, item);
  }

  function buildMessageNode(role, item, animate, prependEnter) {
    const wrap = document.createElement("div");
    wrap.className = "msg";
    if (animate) wrap.classList.add("msg-enter");
    if (prependEnter) wrap.classList.add("msg-prepend-enter");
    wrap.dataset.author = role;
    fillMessageNode(wrap, role, item);
    return wrap;
  }

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Ease scroll correction after prepending so the viewport doesn't snap abruptly.
  function smoothScrollBy(scroller, delta, onDone) {
    if (!scroller || !delta) {
      onDone?.();
      return;
    }
    if (prefersReducedMotion || Math.abs(delta) < 3) {
      scroller.scrollTop += delta;
      onDone?.();
      return;
    }
    const start = scroller.scrollTop;
    const duration = Math.min(320, 100 + Math.abs(delta) * 0.12);
    const t0 = performance.now();
    (function frame(now) {
      const p = Math.min(1, (now - t0) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      scroller.scrollTop = start + delta * ease;
      if (p < 1) requestAnimationFrame(frame);
      else onDone?.();
    })(t0);
  }

  // Keep the user's eyes on the same message while older turns are inserted above.
  function prependOlderMessages(next, addCount) {
    const scroller = document.querySelector(".editor-body");
    const marker = documentContent.firstElementChild;
    const markerTop = marker ? marker.getBoundingClientRect().top : 0;

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < addCount; i += 1) {
      fragment.appendChild(buildMessageNode(next[i].author, next[i], false, true));
    }
    documentContent.insertBefore(fragment, documentContent.firstChild);
    renderedMessages = next;

    requestAnimationFrame(() => {
      const finish = () => { loadingOlderRequest = false; };
      if (marker && scroller) {
        const delta = marker.getBoundingClientRect().top - markerTop;
        smoothScrollBy(scroller, delta, finish);
      } else {
        finish();
      }
    });
  }

  function appendMessage(author, text, images) {
    if (!documentContent) return;
    const role = author === "user" ? "user" : "assistant";
    const gallery = Array.isArray(images) && images.length
      ? images.map((img) => ({ src: img.dataUrl || img.src, alt: img.name || img.alt || "" }))
      : null;
    const body = String(text || "");
    if (!body && !gallery) return;
    documentContent.appendChild(buildMessageNode(role, { text: body, images: gallery }, true));
    // Track the optimistic echo so the next host sync reconciles against it
    // instead of wiping and re-adding it (which caused the flicker).
    renderedMessages.push({
      author: role,
      text: body,
      images: gallery,
      blockKey: "",
      imageKey: gallery ? gallery.map((im) => im.src || "").join("|").slice(0, 200) : ""
    });
  }

  function nearBottom(scroller, threshold = 140) {
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < threshold;
  }

  // Reconcile the transcript against host state instead of clearing + rebuilding
  // it on every sync. Unchanged messages are left in place, the streaming (last)
  // message is updated in place, and genuinely new messages fade in. This removes
  // the choppy full redraw while the model is responding.
  function messagesTailMatch(prev, next) {
    if (!prev.length || next.length <= prev.length) return false;
    const tail = next.slice(-prev.length);
    return tail.every((message, index) =>
      message.author === prev[index].author
      && message.text === prev[index].text
      && message.blockKey === prev[index].blockKey
      && (message.imageKey || "") === (prev[index].imageKey || ""));
  }

  function renderDocumentContent(messages) {
    if (!documentContent) return;
    const scroller = document.querySelector(".editor-body");
    const next = (messages || []).slice(-200).map((message) => {
      const images = Array.isArray(message.images) && message.images.length ? message.images : null;
      return {
        author: message.author === "user" ? "user" : "assistant",
        text: message.text || "",
        blocks: Array.isArray(message.blocks) && message.blocks.length ? message.blocks : null,
        blockKey: Array.isArray(message.blocks) && message.blocks.length
          ? blocksFingerprint(message.blocks)
          : "",
        images,
        imageKey: images ? images.map((im) => im.src || "").join("|").slice(0, 200) : ""
      };
    });

    // Older turns arrived: prepend without jumping the reader's scroll position.
    if (messagesTailMatch(renderedMessages, next)) {
      prependOlderMessages(next, next.length - renderedMessages.length);
      return;
    }

    const forceRebuild = scrollToBottomOnLoad;

    let common = 0;
    if (!forceRebuild) {
      const max = Math.min(renderedMessages.length, next.length);
      while (
        common < max &&
        renderedMessages[common].author === next[common].author &&
        renderedMessages[common].text === next[common].text &&
        renderedMessages[common].blockKey === next[common].blockKey &&
        (renderedMessages[common].imageKey || "") === (next[common].imageKey || "")
      ) {
        common++;
      }

      // Identical to what's shown → do nothing (kills the periodic flicker).
      if (common === renderedMessages.length && common === next.length) return;
      // Host momentarily has exactly one fewer message that is otherwise a prefix of
      // ours (our echo isn't scraped yet) → keep the current view until it catches up.
      if (common === next.length && renderedMessages.length - next.length === 1) return;
    }

    const stick = !forceRebuild && scroller ? nearBottom(scroller) : false;
    const hadContent = renderedMessages.length > 0;
    const nodes = documentContent.children;

    for (let i = common; i < next.length; i++) {
      if (i < nodes.length) {
        // Update in place — no remove/re-add, so streaming text doesn't flicker.
        nodes[i].dataset.author = next[i].author;
        fillMessageNode(nodes[i], next[i].author, next[i]);
      } else {
        // New message: animate only after the first population (avoid a bulk fade
        // when the transcript first loads).
        documentContent.appendChild(buildMessageNode(next[i].author, next[i], hadContent));
      }
    }
    while (nodes.length > next.length) {
      documentContent.lastElementChild.remove();
    }

    renderedMessages = next;
    if (scrollToBottomOnLoad && scroller) {
      scroller.scrollTop = scroller.scrollHeight;
      scrollToBottomOnLoad = false;
    } else if (stick && scroller) {
      scroller.scrollTop = scroller.scrollHeight;
    }
  }

  function setupOverscrollHistoryLoader() {
    const scroller = document.querySelector(".editor-body");
    if (!scroller) return;

    function requestOlder() {
      if (loadingOlderRequest || historyLoading || !historyHasMore) return;
      if (scroller.scrollTop > SCROLL_TOP_EPS) return;
      loadingOlderRequest = true;
      notifyHost("load-older-history");
    }

    // Pull for older thread history only when already at the top of the doc.
    scroller.addEventListener("wheel", (event) => {
      if (event.deltaY >= 0) return;
      if (scroller.scrollTop > SCROLL_TOP_EPS) return;
      requestOlder();
    }, { passive: true });
  }

  // Load more chats when the user scrolls toward the bottom of the sidebar list.
  // The host lazy-loads its own conversation sidebar, so we ask it to fetch the
  // next batch and re-sync (mirrors the thread-history loader above).
  function setupConversationListLoader() {
    if (!conversationList) return;
    function requestMore() {
      if (loadingMoreConversations || conversationsLoading || !conversationsHasMore) return;
      const remaining = conversationList.scrollHeight - conversationList.scrollTop - conversationList.clientHeight;
      if (remaining > 72) return;
      loadingMoreConversations = true;
      notifyHost("load-more-conversations");
    }
    conversationList.addEventListener("scroll", requestMore, { passive: true });
  }

  function submitPrompt() {
    if (!promptLine) return;
    const text = promptLine.textContent.replace(/\u200B/g, "").trim();
    const images = pendingAttachments.slice();
    if (!text && !images.length) return;
    // Echo into the document immediately so the prompt is visibly "sent",
    // then ask the host page to type + send it into the real composer. No
    // auto-scroll here — Enter should only submit, never jump the page. (The
    // transcript still follows a streaming reply if you're already at the bottom.)
    appendMessage("user", text, images);
    promptLine.textContent = "";
    clearAttachments();
    pendingSendNeedle = text ? text.replace(/\s+/g, " ").trim().slice(0, 18).toLowerCase() : "";
    notifyHost("submit-prompt", {
      text,
      images: images.map((att) => ({ name: att.name, type: att.type, dataUrl: att.dataUrl }))
    });
  }

  function closeMenu() {
    if (openMenuEl) {
      openMenuEl.remove();
      openMenuEl = null;
    }
  }

  // `isChecked` is a predicate so a menu can mark several items independently
  // (e.g. a selected reasoning level plus an on/off thinking toggle).
  function openMenu(align, items, isChecked, onSelect) {
    closeMenu();
    if (!titleRow) return;
    const menu = document.createElement("div");
    menu.className = "skin-menu";
    menu.style[align] = "0";
    items.forEach((item) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "skin-menu-item";
      option.setAttribute("aria-checked", String(!!isChecked(item)));
      option.textContent = item;
      option.addEventListener("click", (event) => {
        event.stopPropagation();
        closeMenu();
        onSelect(item);
      });
      menu.appendChild(option);
    });
    titleRow.appendChild(menu);
    openMenuEl = menu;
  }

  function handleAction(control, event) {
    const action = control.dataset.action;

    if (action === "change-avatar") {
      if (avatarInput) avatarInput.click();
      event.stopPropagation();
      return;
    }

    if (action === "toggle-disguise") {
      flash(control);
      notifyHost("toggle-disguise");
      event.stopPropagation();
      return;
    }

    if (action === "attach-image") {
      if (attachInput) attachInput.click();
      event.stopPropagation();
      return;
    }

    if (action === "remove-attachment") {
      removeAttachment(control.dataset.attachmentId);
      event.stopPropagation();
      return;
    }

    if (action === "new-chat") {
      flash(control);
      // Focus the composer right away so the new chat feels instant; the host
      // sync will swap in the empty conversation shortly after.
      if (promptLine) promptLine.focus({ preventScroll: true });
      notifyHost("new-chat");
      event.stopPropagation();
      return;
    }

    if (action === "toggle-pin") {
      togglePin(control.dataset.conversationId);
      event.stopPropagation();
      return;
    }

    if (action === "conversation-menu") {
      const row = control.closest(".tab-row");
      const conversation = conversations.find((item) => item.id === control.dataset.conversationId);
      if (row && conversation) openRowMenu(row, conversation);
      event.stopPropagation();
      return;
    }

    if (action === "select-model") {
      flash(control);
      const current = currentModelLabel();
      const labels = modelsForProvider(currentProvider).map((m) => m.label);
      openMenu("left", labels, (item) => normLabel(item) === normLabel(current), (label) => {
        updateSelector(modelButton, label, "modelId", normLabel(label).replace(/[^a-z0-9.]+/g, "-"));
        // A new model may expose different reasoning options → reset to its default.
        const entry = findModelEntry(currentProvider, label);
        currentEffortLabel = defaultEffortFor(entry);
        toggleOn = defaultToggleFor(entry);
        lastModelLabel = label;
        syncEffortControl();
        notifyHost("select-model", { modelId: modelButton.dataset.modelId, label });
      });
    }

    if (action === "select-effort") {
      if (effortButton && effortButton.disabled) return;
      flash(control);
      const entry = currentModelEntry();
      const items = effortItemsFor(entry);
      if (!items.length) return;
      openMenu(
        "right",
        items,
        (item) => (entry.toggle && item === entry.toggle ? toggleOn : item === currentEffortLabel),
        (label) => {
          // The toggle flips independently; any other item sets the reasoning level.
          if (entry.toggle && label === entry.toggle) {
            toggleOn = !toggleOn;
          } else {
            currentEffortLabel = label;
          }
          syncEffortControl();
          notifyHost("select-effort", {
            picked: label,
            label: currentEffortLabel,
            effortLevel: normLabel(currentEffortLabel),
            toggle: entry.toggle ? { name: entry.toggle, on: toggleOn } : null
          });
        }
      );
    }

    if (action === "switch-conversation") {
      selectConversation(control.dataset.conversationId);
      flash(control);
    }

    event.stopPropagation();
  }

  document.addEventListener("click", (event) => {
    const control = event.target.closest("[data-action]");
    if (control) {
      handleAction(control, event);
      return;
    }
    // Click outside an open menu (and not on its trigger) closes it.
    if (openMenuEl && !event.target.closest(".skin-menu")) {
      closeMenu();
    }
  });

  // Real <button> controls handle Enter/Space natively; the faux-button spans
  // (pin toggle, row menu) need it wired up explicitly for keyboard users.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    const control = event.target.closest('[data-action][role="button"]');
    if (!control) return;
    event.preventDefault();
    handleAction(control, event);
  });

  if (promptLine) {
    promptLine.addEventListener("keydown", (event) => {
      // Enter sends; Shift+Enter inserts a newline (chat convention).
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitPrompt();
      }
    });
  }

  if (chatSearch) {
    chatSearch.addEventListener("input", () => {
      searchQuery = chatSearch.value || "";
      renderConversations();
    });
    // Esc clears the filter and returns focus to the list.
    chatSearch.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && chatSearch.value) {
        event.stopPropagation();
        chatSearch.value = "";
        searchQuery = "";
        renderConversations();
      }
    });
  }

  if (avatarInput) {
    avatarInput.addEventListener("change", () => {
      // Snapshot before clearing value — resetting .value empties the live FileList.
      const files = Array.from(avatarInput.files || []);
      avatarInput.value = "";
      handleAvatarFile(files);
    });
  }

  if (attachInput) {
    attachInput.addEventListener("change", () => {
      const files = Array.from(attachInput.files || []);
      attachInput.value = "";
      addAttachmentFiles(files);
    });
  }

  // Paste an image straight into the composer (e.g. a screenshot).
  if (promptLine) {
    promptLine.addEventListener("paste", (event) => {
      const files = event.clipboardData && event.clipboardData.files;
      if (!files || !files.length) return;
      const images = Array.from(files).filter((file) => file.type && file.type.startsWith("image/"));
      if (images.length) {
        event.preventDefault();
        addAttachmentFiles(images);
      }
    });
  }

  // Drag-and-drop image files anywhere onto the document page.
  if (documentPage) {
    documentPage.addEventListener("dragover", (event) => {
      if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes("Files")) {
        event.preventDefault();
      }
    });
    documentPage.addEventListener("drop", (event) => {
      const files = event.dataTransfer && event.dataTransfer.files;
      if (!files || !files.length) return;
      const images = Array.from(files).filter((file) => file.type && file.type.startsWith("image/"));
      if (images.length) {
        event.preventDefault();
        addAttachmentFiles(images);
      }
    });
  }

  // Clicking blank document space focuses the input and drops the caret at the end.
  if (documentPage && promptLine) {
    documentPage.addEventListener("click", (event) => {
      if (event.target.closest("[data-action], .document-transcript")) return;
      if (String(window.getSelection())) return;
      promptLine.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(promptLine);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }

  window.selectConversation = selectConversation;
  window.renderConversations = renderConversations;
  window.applyHostState = applyHostState;

  window.addEventListener("message", (event) => {
    // Only trust the embedding host frame, and only messages marked as ours.
    // event.source identifies the exact window; message.source is a spoofable
    // payload string and is treated as a marker, not as authentication.
    if (event.source !== window.parent) return;
    const message = event.data || {};
    if (message.source !== HOST_SOURCE) return;

    // Pin outbound replies to the verified host origin.
    if (event.origin && event.origin !== "null") hostOrigin = event.origin;

    if (message.type === "host-state") {
      applyHostState(message.state);
    } else if (message.type === "conversation-switch") {
      // Host-initiated switch: apply silently so we don't echo a user-action event back.
      selectConversation(message.conversation || message.conversationId, { silent: true });
    } else if (message.type === "submit-result") {
      if (message.ok === false) {
        showToast(message.reason === "composer-not-found"
          ? "Couldn't find the message box on this page."
          : "The message may not have sent — couldn't confirm it on the page.");
      } else {
        // A later attempt confirmed the send — clear any stale failure toast.
        pendingSendNeedle = "";
        const toast = document.querySelector(".skin-toast");
        if (toast) toast.classList.remove("is-visible");
      }
    }
  });

  window.addEventListener("load", () => {
    loadStored();
    loadImageControlPreference();
    loadProAccessPreference();
    renderConversations(conversations, activeConversationId);
    // Initialise reasoning state for the default model before any host sync.
    lastModelLabel = currentModelLabel();
    currentEffortLabel = defaultEffortFor(currentModelEntry());
    toggleOn = defaultToggleFor(currentModelEntry());
    syncEffortControl();
    if (promptLine) promptLine.focus({ preventScroll: true });
    setupOverscrollHistoryLoader();
    setupConversationListLoader();
    notifyHost("ready");
  });

  try {
    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes[IMAGE_CONTROL_KEY]) {
          const mode = normalizeImageControl(changes[IMAGE_CONTROL_KEY].newValue);
          applyImageControl(mode);
          lastImageControl = mode;
        }
        if (changes[CHATGPT_PRO_KEY]) {
          applyProAccess(changes[CHATGPT_PRO_KEY].newValue === true);
        }
      });
    }
  } catch {
    /* storage unavailable outside the extension */
  }
})();
