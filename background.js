importScripts("utils.js", "db.js");

const MENU_TEXT = "web-annotator-add-text-note";
const MENU_PAGE = "web-annotator-add-page-note";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_TEXT,
      title: "添加文字高亮",
      contexts: ["selection"],
      documentUrlPatterns: ["http://*/*", "https://*/*"]
    });
    chrome.contextMenus.create({
      id: MENU_PAGE,
      title: "添加页面标记",
      contexts: ["page"],
      documentUrlPatterns: ["http://*/*", "https://*/*"]
    });
  });
});

chrome.action.onClicked.addListener(tab => {
  if (tab.id) chrome.sidePanel.open({ tabId: tab.id });
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab || !tab.id) return;
  if (command === "web-annotator-add-note-command") {
    sendMessageToTab(tab.id, { type: "CHECK_SELECTION_AND_SAVE_CS" });
  }
  if (command === "toggle-side-panel") {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === MENU_TEXT) {
    sendMessageToTab(tab.id, { type: "CHECK_SELECTION_AND_SAVE_CS" });
  }
  if (info.menuItemId === MENU_PAGE) {
    savePageMark(tab);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(data => sendResponse({ success: true, data }))
    .catch(error => sendResponse({ success: false, error: error.message }));
  return true;
});

async function handleMessage(message, sender) {
  const data = message.data || message;
  switch (message.type) {
    case "SAVE_MARK_BG":
      await WADatabase.addMark(data.mark);
      notifyDataUpdated(sender.tab && sender.tab.id, data.mark.url);
      return data.mark;
    case "GET_MARKS_BY_URL_BG":
      return WADatabase.getMarksByUrl(data.url, data.exact !== false);
    case "GET_MARK_BY_ID_BG":
      return WADatabase.getMarkById(data.markId);
    case "GET_ALL_MARKS_BG":
      return WADatabase.getMarks();
    case "GET_STATS_BG":
      return WADatabase.getStats();
    case "GET_SHORTCUTS_BG":
      return getShortcuts();
    case "SAVE_SHORTCUTS_BG":
      await chrome.storage.local.set({ shortcuts: data.shortcuts });
      broadcastToTabs({ type: "SHORTCUTS_UPDATED_CS" }, sender.tab && sender.tab.id);
      return data.shortcuts;
    case "UPDATE_MARK_BG":
      await WADatabase.updateMark(data.mark);
      notifyDataUpdated(sender.tab && sender.tab.id, data.mark.url);
      return data.mark;
    case "UPDATE_MARK_COLOR_BG":
      return updateMark(data.markId, mark => ({ ...mark, color: data.color }), sender.tab && sender.tab.id);
    case "UPDATE_MARK_FAVORITE_BG":
      return updateMark(data.markId, mark => ({ ...mark, is_favorite: data.isFavorite }), sender.tab && sender.tab.id);
    case "DELETE_MARK_BG":
      await WADatabase.deleteMark(data.markId);
      notifyDataUpdated(sender.tab && sender.tab.id);
      return true;
    case "GET_TAGS_BG":
      return WADatabase.getTags();
    case "GET_TAGS_WITH_COUNT_BG":
      return WADatabase.getTagsWithCount();
    case "CREATE_TAG_BG":
      return createTag(data.name);
    case "DELETE_TAG_BG":
      await WADatabase.deleteTag(data.tagId);
      notifyDataUpdated(sender.tab && sender.tab.id);
      return true;
    case "ADD_TAG_TO_MARK_BG":
      return WADatabase.addTagToMark(data.markId, data.tagId);
    case "REMOVE_TAG_FROM_MARK_BG":
      await WADatabase.removeTagFromMark(data.markId, data.tagId);
      notifyDataUpdated(sender.tab && sender.tab.id);
      return true;
    case "GET_TAGS_FOR_MARK_BG":
      return WADatabase.getTagsForMark(data.markId);
    case "GET_COLOR_SETTINGS_BG":
      return WADatabase.getColorSettings();
    case "SAVE_COLOR_SETTINGS_BG":
      await WADatabase.saveColorSettings(data.settings);
      broadcastToTabs({ type: "COLOR_CONFIG_UPDATED_CS" }, sender.tab && sender.tab.id);
      return data.settings;
    case "EXPORT_DATA_BG":
      return WADatabase.exportData();
    case "IMPORT_DATA_BG":
      await WADatabase.importData(data.importData);
      notifyDataUpdated(sender.tab && sender.tab.id);
      return true;
    case "GET_CURRENT_TAB_BG":
      return getCurrentTab();
    case "OPEN_URL_BG":
      await chrome.tabs.create({ url: data.url });
      return true;
    case "HIGHLIGHT_CLICKED_CS":
      return true;
    case "OPEN_SIDE_PANEL_BG":
      if (sender.tab && sender.tab.id) await chrome.sidePanel.open({ tabId: sender.tab.id });
      if (data.page) {
        chrome.runtime.sendMessage({ type: "SWITCH_PAGE_FR", page: data.page }, () => void chrome.runtime.lastError);
      }
      return true;
    case "SAVE_UI_PREFS_BG":
      await chrome.storage.local.set({ uiPrefs: data.uiPrefs });
      broadcastToTabs({ type: "UI_PREFS_UPDATED_CS", uiPrefs: data.uiPrefs }, sender.tab && sender.tab.id);
      return data.uiPrefs;
    default:
      throw new Error(`Unsupported message type: ${message.type}`);
  }
}

async function updateMark(markId, updater, sourceTabId) {
  const mark = await WADatabase.getMarkById(markId);
  if (!mark) throw new Error("Mark not found");
  const next = { ...updater(mark), updated_at: Date.now() };
  await WADatabase.updateMark(next);
  notifyDataUpdated(sourceTabId, next.url);
  return next;
}

async function createTag(name, shouldNotify = true) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Tag name is required");
  const existing = await WADatabase.getTagByName(trimmed);
  if (existing) return existing;
  const tag = { id: WAUtils.generateId(), name: trimmed, created_at: Date.now(), updated_at: Date.now() };
  await WADatabase.addTag(tag);
  if (shouldNotify) notifyDataUpdated();
  return tag;
}

async function savePageMark(tab) {
  const mark = {
    id: WAUtils.generateId(),
    url: WAUtils.normalizeUrl(tab.url),
    page_url: tab.url,
    type: "page",
    text: tab.title || tab.url,
    description: "",
    color: { ...WAUtils.DEFAULT_COLORS[0], style: "background" },
    select_info: "[]",
    page_title: tab.title || "",
    page_icon: tab.favIconUrl || "",
    is_favorite: false,
    link_url: "",
    created_at: Date.now(),
    updated_at: Date.now()
  };
  await WADatabase.addMark(mark);
  notifyDataUpdated(tab.id, mark.url);
}

async function getCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function getShortcuts() {
  const saved = await chrome.storage.local.get("shortcuts");
  return saved.shortcuts || {
    addHighlight: "Alt+S",
    openPanel: "Alt+W",
    jumpToNote: "Alt+N",
    deleteHighlight: "Alt+X"
  };
}

function sendMessageToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, () => void chrome.runtime.lastError);
}

function notifyDataUpdated(sourceTabId, url) {
  chrome.runtime.sendMessage({ type: "DATA_UPDATED_FR", url }, () => void chrome.runtime.lastError);
  // 只有同一 URL 的标签页需要重绘高亮；无条件群发会让无关页面反复重建 DOM
  broadcastToTabs({ type: "SHOW_ALL_HIGHLIGHTS_CS" }, sourceTabId, url);
}

function broadcastToTabs(message, sourceTabId, onlyUrl) {
  chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, tabs => {
    tabs.forEach(tab => {
      if (!tab.id || tab.id === sourceTabId) return;
      if (onlyUrl && WAUtils.normalizeUrl(tab.url || "") !== onlyUrl) return;
      sendMessageToTab(tab.id, message);
    });
  });
}
