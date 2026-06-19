chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ shikiDocsSkinEnabled: true });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-skin") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "SHIKI_TOGGLE" });
  }
});
