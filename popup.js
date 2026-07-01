const PROFILE_KEY = "shikiProfileImage";
const RICH_KEY = "shikiRichFormatting";
const IMAGE_CONTROL_KEY = "shikiImageControl";
const TIERS_KEY = "shikiProviderTiers";
// Pre-1.3 single ChatGPT-Pro boolean; read once as a migration default.
const LEGACY_CHATGPT_PRO_KEY = "shikiChatgptPro";
// Subscription tiers per provider, lowest → highest. Mirrors PROVIDER_TIERS in
// skin.js; each button cycles through its provider's ladder (same interaction
// pattern as the other popup toggles).
const PROVIDER_TIERS = {
  ChatGPT: ["Free", "Plus", "Pro"],
  Claude: ["Free", "Pro", "Max"],
  Gemini: ["Free", "Advanced"]
};
const MAX_AVATAR_BYTES = 1024 * 1024;

const toggleButton = document.getElementById("toggle");
const syncButton = document.getElementById("sync");
const formattingButton = document.getElementById("formatting");
const imageControlButton = document.getElementById("imageControl");
const tierButtons = Array.from(document.querySelectorAll("button[data-provider]"));
const status = document.getElementById("status");
const pickAvatarButton = document.getElementById("pickAvatar");
const resetAvatarButton = document.getElementById("resetAvatar");
const avatarFileInput = document.getElementById("avatarFile");
const avatarPreview = document.getElementById("avatarPreview");

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToActiveTab(message) {
  const tab = await activeTab();
  if (!tab?.id) throw new Error("No active tab");
  return chrome.tabs.sendMessage(tab.id, message);
}

function setStatus(message) {
  status.textContent = message;
}

toggleButton.addEventListener("click", async () => {
  try {
    const response = await sendToActiveTab({ type: "SHIKI_TOGGLE" });
    setStatus(response?.enabled ? "Docs style enabled." : "Docs style hidden.");
  } catch {
    setStatus("Open a supported AI chat site first.");
  }
});

syncButton.addEventListener("click", async () => {
  try {
    const response = await sendToActiveTab({ type: "SHIKI_SYNC" });
    const count = response?.page?.conversations?.length || 0;
    setStatus(`Synced ${count || "current"} conversation${count === 1 ? "" : "s"}.`);
  } catch {
    setStatus("Nothing to sync on this tab.");
  }
});

function reflectFormatting(on) {
  formattingButton.textContent = on ? "On" : "Off";
  formattingButton.setAttribute("aria-pressed", String(on));
}

chrome.storage.local.get({ [RICH_KEY]: true }, (result) => {
  reflectFormatting(result[RICH_KEY] !== false);
});

formattingButton.addEventListener("click", () => {
  chrome.storage.local.get({ [RICH_KEY]: true }, (result) => {
    const next = result[RICH_KEY] === false; // flip current value
    chrome.storage.local.set({ [RICH_KEY]: next }, () => {
      reflectFormatting(next);
      setStatus(next ? "Rich formatting on." : "Rich formatting off (plain text).");
      refreshActiveTab();
    });
  });
});

function reflectImageControl(mode) {
  imageControlButton.textContent = normalizeImageControl(mode) === "insert" ? "Insert" : "Composer";
}

function normalizeImageControl(mode) {
  return mode === "insert" || mode === "toolbar" ? "insert" : "composer";
}

chrome.storage.local.get({ [IMAGE_CONTROL_KEY]: "composer" }, (result) => {
  reflectImageControl(result[IMAGE_CONTROL_KEY]);
});

imageControlButton.addEventListener("click", () => {
  chrome.storage.local.get({ [IMAGE_CONTROL_KEY]: "composer" }, (result) => {
    const current = normalizeImageControl(result[IMAGE_CONTROL_KEY]);
    const next = current === "insert" ? "composer" : "insert";
    chrome.storage.local.set({ [IMAGE_CONTROL_KEY]: next }, () => {
      reflectImageControl(next);
      setStatus(next === "insert" ? "Use Insert menu for images." : "Image button in composer.");
      refreshActiveTab();
    });
  });
});

// Coerce whatever is stored into a full { provider: tier } map, falling back to
// each provider's lowest tier. The legacy ChatGPT-Pro boolean is honoured only
// while no explicit tier selection exists yet.
function normalizeTiers(stored, legacyPro) {
  const tiers = {};
  Object.keys(PROVIDER_TIERS).forEach((provider) => {
    const options = PROVIDER_TIERS[provider];
    const raw = stored && typeof stored === "object" ? String(stored[provider] || "") : "";
    tiers[provider] = options.find((tier) => tier.toLowerCase() === raw.toLowerCase()) || options[0];
  });
  if ((!stored || typeof stored !== "object") && legacyPro) tiers.ChatGPT = "Pro";
  return tiers;
}

function reflectTiers(tiers) {
  tierButtons.forEach((button) => {
    button.textContent = tiers[button.dataset.provider] || "Free";
  });
}

chrome.storage.local.get({ [TIERS_KEY]: null, [LEGACY_CHATGPT_PRO_KEY]: false }, (result) => {
  const tiers = normalizeTiers(result[TIERS_KEY], result[LEGACY_CHATGPT_PRO_KEY] === true);
  reflectTiers(tiers);
  // One-time migration from the old ChatGPT-Pro toggle to explicit tiers.
  if (!result[TIERS_KEY] || typeof result[TIERS_KEY] !== "object") {
    chrome.storage.local.set({ [TIERS_KEY]: tiers });
  }
});

tierButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const provider = button.dataset.provider;
    const options = PROVIDER_TIERS[provider];
    if (!options) return;
    chrome.storage.local.get({ [TIERS_KEY]: null, [LEGACY_CHATGPT_PRO_KEY]: false }, (result) => {
      const tiers = normalizeTiers(result[TIERS_KEY], result[LEGACY_CHATGPT_PRO_KEY] === true);
      const next = options[(options.indexOf(tiers[provider]) + 1) % options.length];
      tiers[provider] = next;
      chrome.storage.local.set({ [TIERS_KEY]: tiers }, () => {
        reflectTiers(tiers);
        setStatus(`${provider} plan set to ${next}.`);
        refreshActiveTab();
      });
    });
  });
});

function showAvatarPreview(url) {
  avatarPreview.style.backgroundImage = url && /^data:image\//i.test(url) ? `url("${url}")` : "";
}

async function refreshActiveTab() {
  // Storage already changed; nudge the active tab to re-render immediately.
  try {
    await sendToActiveTab({ type: "SHIKI_SYNC" });
  } catch {
    /* no supported tab open — content scripts pick it up via storage.onChanged */
  }
}

chrome.storage.local.get({ [PROFILE_KEY]: "" }, (result) => {
  showAvatarPreview(result[PROFILE_KEY] || "");
});

pickAvatarButton.addEventListener("click", () => avatarFileInput.click());

avatarFileInput.addEventListener("change", () => {
  const file = avatarFileInput.files && avatarFileInput.files[0];
  avatarFileInput.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setStatus("Choose an image file.");
    return;
  }
  if (file.size > MAX_AVATAR_BYTES) {
    setStatus("Image too large (max 1 MB).");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result || "");
    if (!/^data:image\//i.test(dataUrl)) {
      setStatus("Could not read that image.");
      return;
    }
    chrome.storage.local.set({ [PROFILE_KEY]: dataUrl }, () => {
      showAvatarPreview(dataUrl);
      setStatus("Profile picture updated.");
      refreshActiveTab();
    });
  };
  reader.onerror = () => setStatus("Could not read that image.");
  reader.readAsDataURL(file);
});

resetAvatarButton.addEventListener("click", () => {
  chrome.storage.local.set({ [PROFILE_KEY]: "" }, () => {
    showAvatarPreview("");
    setStatus("Profile picture reset.");
    refreshActiveTab();
  });
});
