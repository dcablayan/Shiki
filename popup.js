const PROFILE_KEY = "shikiProfileImage";
const RICH_KEY = "shikiRichFormatting";
const IMAGE_CONTROL_KEY = "shikiImageControl";
const CHATGPT_PRO_KEY = "shikiChatgptPro";
const MAX_AVATAR_BYTES = 1024 * 1024;

const toggleButton = document.getElementById("toggle");
const syncButton = document.getElementById("sync");
const formattingButton = document.getElementById("formatting");
const imageControlButton = document.getElementById("imageControl");
const chatgptProButton = document.getElementById("chatgptPro");
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
    setStatus("Open ChatGPT, Claude, or Gemini first.");
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

function reflectChatgptPro(on) {
  chatgptProButton.textContent = on ? "On" : "Off";
  chatgptProButton.setAttribute("aria-pressed", String(on));
}

chrome.storage.local.get({ [CHATGPT_PRO_KEY]: false }, (result) => {
  reflectChatgptPro(result[CHATGPT_PRO_KEY] === true);
});

chatgptProButton.addEventListener("click", () => {
  chrome.storage.local.get({ [CHATGPT_PRO_KEY]: false }, (result) => {
    const next = result[CHATGPT_PRO_KEY] !== true; // flip current value
    chrome.storage.local.set({ [CHATGPT_PRO_KEY]: next }, () => {
      reflectChatgptPro(next);
      setStatus(next ? "ChatGPT Pro options shown." : "ChatGPT Pro options hidden.");
      refreshActiveTab();
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
