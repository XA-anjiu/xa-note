(function initContent() {
  const HIGHLIGHT_CLASS = "web-annotator-highlight-text";
  const TOOLBAR_ID = "web-annotator-toolbar";
  const TOAST_ID = "web-annotator-toast";
  const RAIL_ID = "web-annotator-rail";
  const ACTS_ID = "web-annotator-acts-node";
  const STYLE_PICKER_ID = "web-annotator-style-picker";
  const DETAILS_ID = "web-annotator-note-details";
  const PAGE_PANEL_ID = "web-annotator-page-panel";
  const PAGE_PANEL_OPEN_CLASS = "wa-page-panel-open";
  const RAIL_TOP_KEY = "web-annotator-rail-y";
  const MAX_RETRY_ATTEMPTS = 8;
  const RETRY_DELAY_MS = 900;
  let colorSettings = WAUtils.getDefaultColorSettings();
  let shortcuts = { addHighlight: "Alt+S", openPanel: "Alt+W", jumpToNote: "Alt+N", deleteHighlight: "Alt+X" };
  let uiPrefs = { cardStyle: "a" };
  let themeAccent = "#2dd4bf";
  let restoring = false;
  let currentDetailsMarkId = null;
  let quickAction = null;
  let mousePosition = { x: 0, y: 0 };
  let railDrag = null;
  let activeRestoreAnchors = [];
  let lastClickedMarkId = null;
  let lastCreatedMarkId = null;
  let pendingRetryMarks = [];
  let retryObserver = null;
  let retryTimer = null;
  let retryAttempts = 0;

  bootstrap();

  async function bootstrap() {
    createToast();
    createNoteDetailsCard();
    createStatusRail();
    bindEvents();
    try {
      colorSettings = await WAUtils.sendMessage({ type: "GET_COLOR_SETTINGS_BG" });
      shortcuts = await WAUtils.sendMessage({ type: "GET_SHORTCUTS_BG" });
    } catch (error) {
      console.warn("Web Annotator: using default colors", error);
    }
    // 加载暗黑主题设置
    try {
      const saved = await new Promise(resolve => {
        chrome.storage.local.get("darkMode", data => resolve(data.darkMode || false));
      });
      if (saved) {
        document.documentElement.classList.add("dark-theme");
      }
    } catch (error) {
      // 使用默认主题
    }
    try {
      const saved = await new Promise(resolve => {
        chrome.storage.local.get(["uiPrefs", "themeAccent"], data => resolve(data));
      });
      uiPrefs = saved.uiPrefs || { cardStyle: "a" };
      themeAccent = saved.themeAccent || "#2dd4bf";
      applyThemeAccent(themeAccent);
    } catch (error) {
      // 使用默认偏好
    }
    createQuickAction();
    await restoreHighlights();
  }

  function bindEvents() {
    document.addEventListener("mousemove", event => {
      mousePosition = { x: event.clientX, y: event.clientY };
    });
    document.addEventListener("mouseup", handleSelectionMouseup);
    document.addEventListener("mousedown", handleDocumentMousedown, true);
    document.addEventListener("keydown", handleShortcutKeydown, true);
    document.addEventListener("click", event => {
      const highlight = event.target.closest && event.target.closest(`.${HIGHLIGHT_CLASS}`);
      if (highlight) {
        event.preventDefault();
        event.stopPropagation();
        lastClickedMarkId = highlight.dataset.markId || lastClickedMarkId;
        showActsNode(highlight.dataset.markId, event.clientX, getClickedHighlightTop(highlight, event.clientY), highlight);
        showNoteDetailsCard(highlight.dataset.markId, highlight);
        safeRuntimeSend({ type: "HIGHLIGHT_CLICKED_CS", data: { markId: highlight.dataset.markId, url: location.href } });
        return;
      }
      if (!event.target.closest(`#${RAIL_ID}, #${ACTS_ID}, #${STYLE_PICKER_ID}, #${COLOR_PICKER_ID}, #${DETAILS_ID}`)) {
        removeActsNode();
        removeStylePicker();
        removeColorPicker();
        hideNoteDetailsCard();
        const detailsCard = document.getElementById(DETAILS_ID);
        if (detailsCard) detailsCard.querySelectorAll(".expanded").forEach(el => el.classList.remove("expanded"));
      }
    });
    document.addEventListener("scroll", () => {
      removeActsNode();
    }, true);
    const runtime = getRuntime();
    if (runtime && runtime.onMessage) {
      runtime.onMessage.addListener((message, sender, sendResponse) => {
        handleRuntimeMessage(message)
          .then(data => sendResponse({ success: true, data }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
      });
    }
  }

  async function handleRuntimeMessage(message) {
    switch (message.type) {
      case "CHECK_SELECTION_AND_SAVE_CS":
        return saveCurrentSelection();
      case "SHOW_ALL_HIGHLIGHTS_CS":
        return restoreHighlights(false);
      case "TEMPORARY_HIDE_ALL_HIGHLIGHTS_CS":
        document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(element => element.classList.add("web-annotator-hidden"));
        return true;
      case "COLOR_CONFIG_UPDATED_CS":
        colorSettings = await WAUtils.sendMessage({ type: "GET_COLOR_SETTINGS_BG" });
        createQuickAction(true);
        return true;
      case "SHORTCUTS_UPDATED_CS":
        shortcuts = await WAUtils.sendMessage({ type: "GET_SHORTCUTS_BG" });
        return true;
      case "UI_PREFS_UPDATED_CS":
        if (message.uiPrefs) {
          uiPrefs = message.uiPrefs;
          // 同步备注详情卡片的风格属性
          const detailsCard = document.getElementById(DETAILS_ID);
          if (detailsCard && uiPrefs.cardStyle) {
            detailsCard.dataset.cardStyle = uiPrefs.cardStyle;
          }
          // 高亮文字颜色策略可能变了，就地重新着色已有高亮
          reapplyHighlightStyles();
        }
        return true;
      case "THEME_UPDATED_CS":
        if (message.darkMode !== undefined) {
          document.documentElement.classList.toggle("dark-theme", message.darkMode);
        }
        return true;
      case "THEME_ACCENT_UPDATED_CS":
        themeAccent = message.color || "#2dd4bf";
        applyThemeAccent(themeAccent);
        return true;
      case "SHOW_TOAST_CS":
        showToast(message.message || (message.data && message.data.message) || "Done");
        return true;
      default:
        return undefined;
    }
  }

  function handleSelectionMouseup(event) {
    if (isQuickActionEvent(event) || isInsideOwnUi(event.target)) return;
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) return;
      const range = selection.getRangeAt(0);
      if (isInsideOwnUi(range.commonAncestorContainer) || isEditableTarget(document.activeElement)) return;
      const colors = colorSettings.colors && colorSettings.colors.length ? colorSettings.colors : WAUtils.DEFAULT_COLORS;
      const defaultColor = colors.find(color => color.id === colorSettings.defaultColorId) || colors[0];
      showQuickAction(mousePosition.x + 8, mousePosition.y - 40, defaultColor && defaultColor.bg);
    }, 50);
  }

  function handleDocumentMousedown(event) {
    if (!isQuickActionEvent(event)) hideQuickAction();
  }


  async function handleShortcutKeydown(event) {
    // 页面可能派发合成的 keydown 事件（没有标准 key 字段）；先挡掉，避免异步处理器抛未捕获异常
    if (!event || typeof event.key !== "string") return;
    const pressed = formatShortcut(event);
    if (!pressed) return;

    if (pressed === shortcuts.deleteHighlight) {
      event.preventDefault();
      await deleteActiveHighlight();
      return;
    }

    // jumpToNote 快捷键可以在备注输入框中使用
    if (pressed === shortcuts.jumpToNote) {
      event.preventDefault();
      await jumpToLastHighlight();
      return;
    }

    if (isEditableTarget(event.target)) return;
    if (pressed === shortcuts.addHighlight) {
      event.preventDefault();
      await saveCurrentSelection();
    }
    if (pressed === shortcuts.openPanel) {
      event.preventDefault();
      await WAUtils.sendMessage({ type: "OPEN_SIDE_PANEL_BG", data: { page: "marks" } });
    }
  }

  async function jumpToLastHighlight() {
    // 如果详细备注卡片已经打开，保存并关闭
    if (currentDetailsMarkId) {
      await saveCurrentNoteDetails();
      hideNoteDetailsCard();
      removeActsNode();
      return;
    }

    const highlights = document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
    if (!highlights.length) {
      showToast("当前页面没有高亮内容");
      return;
    }

    let lastVisibleHighlight = await findPreferredJumpHighlight(highlights, { includeNewestCreated: true });

    const viewportHeight = window.innerHeight;
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + viewportHeight;

    // 找到视口中最后一个可见的高亮元素
    if (!lastVisibleHighlight) {
      highlights.forEach(highlight => {
        const rect = highlight.getBoundingClientRect();
        const elementTop = rect.top + window.scrollY;
        const elementBottom = rect.bottom + window.scrollY;

        // 检查元素是否在视口中
        if (elementTop < viewportBottom && elementBottom > viewportTop) {
          lastVisibleHighlight = highlight;
        }
      });
    }

    // 如果没有在视口中找到，就找最接近视口底部的
    if (!lastVisibleHighlight) {
      let minDistance = Infinity;
      highlights.forEach(highlight => {
        const rect = highlight.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2 + window.scrollY;
        const distance = Math.abs(elementCenter - viewportBottom);
        if (distance < minDistance) {
          minDistance = distance;
          lastVisibleHighlight = highlight;
        }
      });
    }

    if (lastVisibleHighlight) {
      // 滚动到高亮元素
      lastVisibleHighlight.scrollIntoView({ behavior: "smooth", block: "center" });

      // 稍微延迟后显示备注卡片
      setTimeout(() => {
        const markId = lastVisibleHighlight.dataset.markId;
        if (markId) {
          const rect = lastVisibleHighlight.getBoundingClientRect();
          lastClickedMarkId = markId;
          showActsNode(markId, rect.left + rect.width / 2, rect.top, lastVisibleHighlight);
          showNoteDetailsCard(markId, lastVisibleHighlight);
        }
      }, 300);

      showToast("已跳转到上一个高亮");
    }
  }

  async function saveCurrentNoteDetails() {
    const card = document.getElementById(DETAILS_ID);
    if (!card || !currentDetailsMarkId) return;

    const descInput = card.querySelector('.wa-details-description');
    if (descInput) {
      await saveDetailsDescription(descInput.value);
    }
  }

  async function findPreferredJumpHighlight(highlights, options = {}) {
    const byCreated = getHighlightByMarkId(lastCreatedMarkId, highlights);
    if (byCreated) return byCreated;
    const byClicked = getHighlightByMarkId(lastClickedMarkId, highlights);
    if (byClicked) return byClicked;
    return options.includeNewestCreated ? await getNewestCreatedHighlight(highlights) : null;
  }

  async function getNewestCreatedHighlight(highlights) {
    try {
      const marks = await WAUtils.sendMessage({ type: "GET_MARKS_BY_URL_BG", data: { url: WAUtils.normalizeUrl(location.href), exact: true } });
      return (marks || [])
        .slice()
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
        .map(mark => getHighlightByMarkId(mark.id, highlights))
        .find(Boolean) || null;
    } catch (error) {
      return null;
    }
  }

  function getHighlightByMarkId(markId, highlights) {
    if (!markId) return null;
    return Array.from(highlights).find(highlight => highlight.dataset.markId === markId) || null;
  }

  async function deleteActiveHighlight() {
    const highlights = document.querySelectorAll(`.${HIGHLIGHT_CLASS}`);
    const target = currentDetailsMarkId
      ? getHighlightByMarkId(currentDetailsMarkId, highlights)
      : await findPreferredJumpHighlight(highlights, { includeNewestCreated: false });
    const markId = currentDetailsMarkId || (target && target.dataset.markId);
    if (!markId) {
      showToast("没有可删除的高亮");
      return;
    }
    await deleteHighlightById(markId);
  }

  function formatShortcut(event) {
    const rawKey = event && typeof event.key === "string" ? event.key : "";
    if (!rawKey) return "";
    const key = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
    if (["Control", "Shift", "Alt", "Meta"].includes(key)) return "";
    const parts = [];
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.altKey) parts.push("Alt");
    if (event.shiftKey) parts.push("Shift");
    if (event.metaKey) parts.push("Meta");
    parts.push(key.replace(" ", "Space"));
    return parts.join("+");
  }

  function isEditableTarget(target) {
    return Boolean(target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)));
  }

  function applyThemeAccent(color) {
    document.documentElement.style.setProperty("--wa-theme-accent", color);
    document.documentElement.style.setProperty("--wa-theme-accent-text", WAUtils.getTextColor(color));
  }

  function createQuickAction(force = false) {
    const existing = document.getElementById(TOOLBAR_ID);
    if (existing && !force) return;
    if (existing) existing.remove();
    const container = document.createElement("div");
    container.id = TOOLBAR_ID;
    container.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
    const shadow = container.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      .quick-action-wrapper { position: fixed; pointer-events: none; opacity: 0; transform: translateY(3px) scale(.96); transition: opacity .14s ease, transform .14s ease; }
      .quick-action-wrapper.visible { opacity: 1; pointer-events: auto; }
      .quick-action-wrapper.visible { transform: translateY(0) scale(1); }
      .quick-action-ring { width: 30px; height: 30px; border-radius: 999px; background: transparent; display: flex; align-items: center; justify-content: center; }
      .quick-action-icon { position: relative; width: 24px; height: 24px; border: 1px solid rgba(255,255,255,.78); border-radius: 999px; background: var(--wa-quick-color, #facc15); color: var(--wa-quick-text, #111); box-shadow: 0 4px 12px rgba(15,23,42,.16), inset 0 1px 0 rgba(255,255,255,.38); cursor: pointer; transition: transform .14s ease, box-shadow .14s ease, filter .14s ease; display: flex; align-items: center; justify-content: center; }
      .quick-action-icon::after { content: ""; position: absolute; inset: -4px; border-radius: inherit; border: 1px solid color-mix(in srgb, var(--wa-quick-color, #facc15) 45%, transparent); opacity: .7; }
      .quick-action-icon svg { width: 12px; height: 12px; stroke: currentColor; stroke-width: 2.45; fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .quick-action-wrapper:hover .quick-action-icon { transform: translateY(-1px) scale(1.06); filter: saturate(1.08); box-shadow: 0 6px 16px rgba(15,23,42,.18), inset 0 1px 0 rgba(255,255,255,.42); }
    `;
    const wrapper = document.createElement("div");
    wrapper.className = "quick-action-wrapper";
    const ring = document.createElement("div");
    ring.className = "quick-action-ring";
    const icon = document.createElement("div");
    icon.className = "quick-action-icon";
    icon.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></svg>';
    ring.appendChild(icon);
    wrapper.appendChild(ring);
    shadow.append(style, wrapper);
    document.documentElement.appendChild(container);
    quickAction = { container, shadow, wrapper, ring, icon };
    wrapper.addEventListener("mousedown", event => event.preventDefault());
    wrapper.addEventListener("click", handleQuickActionClick);
  }

  function showQuickAction(x, y, bgColor) {
    if (!quickAction) createQuickAction();
    const position = calculatePosition(x, y, 38, 38);
    quickAction.wrapper.style.left = `${position.left}px`;
    quickAction.wrapper.style.top = `${position.top}px`;
    const bg = bgColor || "#ffffff";
    quickAction.icon.style.setProperty("--wa-quick-color", bg);
    quickAction.icon.style.setProperty("--wa-quick-text", WAUtils.getTextColor(bg));
    const svgEl = quickAction.icon.querySelector("svg");
    if (svgEl) svgEl.style.stroke = WAUtils.getTextColor(bg);
    requestAnimationFrame(() => quickAction.wrapper.classList.add("visible"));
  }

  function hideQuickAction() {
    if (quickAction && quickAction.wrapper) quickAction.wrapper.classList.remove("visible");
  }

  async function handleQuickActionClick(event) {
    event.preventDefault();
    event.stopPropagation();
    hideQuickAction();
    try {
      await saveCurrentSelection();
    } catch (error) {
      console.error("Web Annotator: save failed", error);
      showToast("高亮保存失败，请重试");
    }
  }

  function calculatePosition(x, y, width, height) {
    const padding = 8;
    return {
      left: Math.min(Math.max(padding, x), window.innerWidth - width - padding),
      top: Math.min(Math.max(padding, y), window.innerHeight - height - padding)
    };
  }

  function isQuickActionEvent(event) {
    if (!event || typeof event.composedPath !== "function") return false;
    return event.composedPath().some(element => element instanceof HTMLElement && (element.id === TOOLBAR_ID || element.classList.contains("quick-action-icon")));
  }

  async function saveCurrentSelection(colorId = colorSettings.defaultColorId, style = colorSettings.defaultStyle) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      showToast("请先选择文字");
      return false;
    }
    const range = selection.getRangeAt(0);
    if (isInsideOwnUi(range.commonAncestorContainer)) return false;
    const savedRange = range.cloneRange();

    const colors = colorSettings.colors && colorSettings.colors.length ? colorSettings.colors : WAUtils.DEFAULT_COLORS;
    const color = colors.find(item => item.id === colorId) || colors[0];
    const mark = {
      id: WAUtils.generateId(),
      url: WAUtils.normalizeUrl(location.href),
      page_url: location.href,
      type: getLinkUrl(range) ? "link" : "text",
      text: savedRange.toString(),
      description: "",
      color: { ...color, style: style || "background" },
      select_info: JSON.stringify(getSelectionInfo(savedRange)),
      page_title: document.title,
      page_icon: getPageIcon(),
      is_favorite: false,
      link_url: getLinkUrl(savedRange) || "",
      created_at: Date.now(),
      updated_at: Date.now()
    };

    await WAUtils.sendMessage({ type: "SAVE_MARK_BG", data: { mark } });
    applyHighlightToRange(savedRange, mark);
    lastCreatedMarkId = mark.id;
    selection.removeAllRanges();
    hideQuickAction();
    showToast("已添加高亮");
    return mark;
  }

  function getSelectionInfo(range) {
    const root = document.body;
    const pageIndex = buildPageTextIndex(true);
    const textPosition = getRangeTextPosition(range, pageIndex);
    const blockAnchor = getBlockAnchor(range);
    const examAnchor = getExamAnchor(range, pageIndex, textPosition);
    const wordBoundary = getWordBoundaryAnchor(range, pageIndex, textPosition);
    return [{
      type: "TextQuoteSelector",
      exact: range.toString(),
      prefix: collectContextBefore(range, 120),
      suffix: collectContextAfter(range, 120),
      extra: {
        firstCssParent: getCssSelector(range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement),
        startPath: getNodePath(range.startContainer, root),
        endPath: getNodePath(range.endContainer, root),
        startOffset: range.startOffset,
        endOffset: range.endOffset,
        textStart: textPosition ? textPosition.start : null,
        textEnd: textPosition ? textPosition.end : null,
        occurrenceIndex: textPosition ? getOccurrenceIndex(pageIndex.text, range.toString(), textPosition.start) : null,
        occurrenceCount: countOccurrences(pageIndex.text, range.toString()),
        blockText: blockAnchor.text,
        blockHash: blockAnchor.hash,
        blockSelector: blockAnchor.selector,
        wordBoundary,
        exam: examAnchor
      }
    }];
  }

  async function restoreHighlights(showSummary = true) {
    if (restoring) return false;
    restoring = true;
    let restored = 0;
    let failed = 0;
    const failedMarks = [];
    try {
      unwrapHighlights();
      activeRestoreAnchors = [];
      const url = WAUtils.normalizeUrl(location.href);
      const marks = await WAUtils.sendMessage({ type: "GET_MARKS_BY_URL_BG", data: { url, exact: true } });
      const currentPageMarks = marks || [];
      for (const mark of currentPageMarks.sort((a, b) => a.created_at - b.created_at)) {
        try {
          const didRender = renderHighlight(mark);
          if (didRender) {
            restored++;
            rememberRestoreAnchor(mark.id);
          }
          else {
            failed++;
            failedMarks.push(mark);
          }
        } catch (error) {
          failed++;
          failedMarks.push(mark);
          console.warn("Web Annotator: restore failed", mark.id, error);
        }
      }
      if (showSummary && currentPageMarks.length) {
        showToast(`当前页笔记 ${currentPageMarks.length} 条：${restored} 条恢复，${failed} 条未定位`, 2800);
      }
      // 页面内容可能还在陆续渲染（懒加载 / SPA），先记下未定位的标记，稍后自动重试
      pendingRetryMarks = failedMarks;
      retryAttempts = 0;
      if (pendingRetryMarks.length) scheduleRetryPass();
      return true;
    } finally {
      activeRestoreAnchors = [];
      restoring = false;
    }
  }

  /** 页面内容还在陆续渲染时，观察 DOM 变化并在稳定后重试未定位的标记。 */
  function scheduleRetryPass() {
    if (!pendingRetryMarks.length || retryAttempts >= MAX_RETRY_ATTEMPTS) {
      stopRetryPass();
      return;
    }
    if (retryObserver || retryTimer) return;
    retryObserver = new MutationObserver(() => {
      if (restoring || retryTimer) return;
      retryTimer = setTimeout(runRetryPass, RETRY_DELAY_MS);
    });
    try {
      retryObserver.observe(document.body, { childList: true, subtree: true });
    } catch (error) {
      retryObserver = null;
    }
  }

  /** 停止观察并清掉待执行的重试。 */
  function stopRetryPass() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (retryObserver) {
      retryObserver.disconnect();
      retryObserver = null;
    }
  }

  async function runRetryPass() {
    retryTimer = null;
    // 自己写 DOM 之前先停止观察，避免自触发
    if (retryObserver) {
      retryObserver.disconnect();
      retryObserver = null;
    }
    if (!pendingRetryMarks.length) return;
    retryAttempts++;
    const marks = pendingRetryMarks;
    pendingRetryMarks = [];
    let restored = 0;
    for (const mark of marks) {
      try {
        if (renderHighlight(mark)) {
          restored++;
          rememberRestoreAnchor(mark.id);
        } else {
          pendingRetryMarks.push(mark);
        }
      } catch (error) {
        pendingRetryMarks.push(mark);
      }
    }
    if (restored > 0) {
      showToast(pendingRetryMarks.length > 0
        ? `页面加载后补回 ${restored} 条高亮，仍有 ${pendingRetryMarks.length} 条未定位`
        : `页面加载后补回 ${restored} 条高亮`, 2600);
    }
    if (pendingRetryMarks.length) scheduleRetryPass();
  }

  function renderHighlight(mark) {
    let selectors;
    try {
      selectors = JSON.parse(mark.select_info || "[]");
    } catch (error) {
      selectors = [];
    }
    let rendered = false;
    // 索引只在前面策略失败时惰性构建，并在单个标记内复用，避免重复遍历整页
    let indexCache = null;
    const getIndex = () => indexCache || (indexCache = buildCurrentTextIndex());
    selectors.filter(selector => selector.type === "TextQuoteSelector").forEach(selector => {
      const range = rangeFromSelector(selector)
        || rangeFromTextPosition(selector, getIndex())
        || rangeFromQuote(selector, getIndex())
        || rangeFromNormalizedQuote(selector, getIndex())
        || rangeFromFuzzyQuote(selector, getIndex());
      if (range && !range.collapsed) {
        applyHighlightToRange(range, mark);
        rendered = true;
      }
    });
    return rendered;
  }

  function rangeFromSelector(selector) {
    const root = document.body;
    const start = getNodeByPath(selector.extra && selector.extra.startPath, root);
    const end = getNodeByPath(selector.extra && selector.extra.endPath, root);
    if (!start || !end) return null;
    try {
      const range = document.createRange();
      range.setStart(start, Math.min(selector.extra.startOffset, getNodeLength(start)));
      range.setEnd(end, Math.min(selector.extra.endOffset, getNodeLength(end)));
      return range.toString() === selector.exact ? range : null;
    } catch (error) {
      return null;
    }
  }

  function rangeFromTextPosition(selector, pageIndex) {
    const extra = selector.extra || {};
    if (!Number.isFinite(extra.textStart) || !Number.isFinite(extra.textEnd)) return null;
    const index = pageIndex || buildCurrentTextIndex();
    const exact = selector.exact || "";
    if (!exact || index.text.slice(extra.textStart, extra.textEnd) !== exact) return null;
    return rangeFromTextIndex(index, extra.textStart, extra.textEnd);
  }

  function rangeFromQuote(selector, pageIndex) {
    const indexData = pageIndex || buildCurrentTextIndex();
    const index = findQuoteIndex(indexData, selector);
    if (index < 0) return null;
    const endIndex = index + selector.exact.length;
    return rangeFromTextIndex(indexData, index, endIndex);
  }

  /**
   * 归一化视图：折叠连续空白，并记录每个归一化字符对应的原始下标。
   * 用于"文本没变、空白排布变了"的场景（笔记重新导出 HTML、编辑器换行策略变化等）。
   */
  function buildNormalizedView(text) {
    const map = [];
    let normalized = "";
    let pendingSpace = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (/\s/.test(ch)) {
        if (normalized.length > 0) pendingSpace = true;
        continue;
      }
      if (pendingSpace) {
        normalized += " ";
        map.push(i);
        pendingSpace = false;
      }
      normalized += ch;
      map.push(i);
    }
    return { normalized, map };
  }

  function normalizedViewOf(pageIndex) {
    if (!pageIndex.normalizedView) {
      // 超大页面不建归一化视图：map 与正文等长，避免为极少数标记付出高内存代价
      if (pageIndex.text.length > 2000000) return { normalized: "", map: [] };
      pageIndex.normalizedView = buildNormalizedView(pageIndex.text);
    }
    return pageIndex.normalizedView;
  }

  /** 归一化区间 [startNorm, endNorm) 映射回原始下标并生成 Range。 */
  function rangeFromMappedSpan(pageIndex, view, startNorm, endNorm) {
    const startRaw = view.map[startNorm];
    const lastRaw = view.map[endNorm - 1];
    if (!Number.isFinite(startRaw) || !Number.isFinite(lastRaw)) return null;
    return rangeFromTextIndex(pageIndex, startRaw, lastRaw + 1);
  }

  /**
   * 策略四：忽略空白差异的精确匹配。
   * 内容一字未改、只是换行/缩进/&nbsp; 变了时，原始 indexOf 会失败，这一步能救回来。
   */
  function rangeFromNormalizedQuote(selector, pageIndex) {
    const exactNorm = normalizeLocatorText(selector.exact || "");
    if (!exactNorm) return null;
    const indexData = pageIndex || buildCurrentTextIndex();
    const view = normalizedViewOf(indexData);
    let at = view.normalized.indexOf(exactNorm);
    if (at < 0) return null;
    if (view.normalized.indexOf(exactNorm, at + 1) >= 0) {
      // 多处出现：用前后文在归一化文本上挑，挑不出就交给后续策略
      const prefixNorm = normalizeLocatorText(selector.prefix || "");
      const suffixNorm = normalizeLocatorText(selector.suffix || "");
      // 前后文比较前后各留一点余量并 trim：归一化会把边界的空白裁掉，直接比会错位
      const margin = 4;
      let picked = -1;
      let cursor = at;
      while (cursor >= 0) {
        const before = view.normalized.slice(Math.max(0, cursor - prefixNorm.length - margin), cursor).trimEnd();
        const after = view.normalized.slice(cursor + exactNorm.length, cursor + exactNorm.length + suffixNorm.length + margin).trimStart();
        if ((!prefixNorm || before.endsWith(prefixNorm)) && (!suffixNorm || after.startsWith(suffixNorm))) {
          picked = cursor;
          break;
        }
        cursor = view.normalized.indexOf(exactNorm, cursor + 1);
      }
      if (picked < 0) return null;
      at = picked;
    }
    return rangeFromMappedSpan(indexData, view, at, at + exactNorm.length);
  }

  /**
   * 策略五（兜底）：模糊匹配。文本被小幅改动（错字、漏词、多处空白变化）时，
   * 用"首尾片段锚定 + 字符二元组 Dice 相似度"找最接近的片段。
   * 阈值刻意保守：宁可显示"未定位"，也不要标到错误的位置上。
   */
  function rangeFromFuzzyQuote(selector, pageIndex) {
    const exactNorm = normalizeLocatorText(selector.exact || "");
    if (exactNorm.length < 8) return null;
    const indexData = pageIndex || buildCurrentTextIndex();
    const view = normalizedViewOf(indexData);
    const text = view.normalized;
    if (!text) return null;
    const head = exactNorm.slice(0, Math.min(5, exactNorm.length));
    const minLen = Math.max(4, Math.round(exactNorm.length * 0.6));
    const maxLen = Math.round(exactNorm.length * 1.6) + 24;
    const target = bigramCounts(exactNorm);
    // 首部锚定后，用几档窗口长度去试，避免"改动落在尾部"时锚不住
    const factors = [1, 0.9, 1.1, 0.8, 1.2];
    let best = null;
    let second = 0;
    let cursor = 0;
    let tried = 0;
    while (tried < 240) {
      const at = text.indexOf(head, cursor);
      if (at < 0) break;
      tried++;
      cursor = at + 1;
      for (const factor of factors) {
        const length = Math.max(4, Math.round(exactNorm.length * factor));
        if (length < minLen || length > maxLen) continue;
        if (at + length > text.length) continue;
        const ratio = diceSimilarity(target, bigramCounts(text.slice(at, at + length)));
        if (!best || ratio > best.ratio) {
          if (best) second = Math.max(second, best.ratio);
          best = { at, end: at + length, ratio };
        } else if (ratio > second) {
          second = ratio;
        }
      }
    }
    if (!best || best.ratio < 0.85) return null;
    // 两个候选分数接近时不做决定，避免标错位置
    if (second > 0 && best.ratio - second < 0.05 && best.ratio < 0.95) return null;
    return rangeFromMappedSpan(indexData, view, best.at, best.end);
  }

  /** 字符二元组计数：对中英文都有效，不依赖分词。 */
  function bigramCounts(text) {
    const counts = new Map();
    for (let i = 0; i < text.length - 1; i++) {
      const gram = text.slice(i, i + 2);
      counts.set(gram, (counts.get(gram) || 0) + 1);
    }
    return counts;
  }

  /** Dice 系数（多重集版本）：2|A∩B| / (|A|+|B|)。 */
  function diceSimilarity(a, b) {
    if (!a.size || !b.size) return 0;
    let shared = 0;
    let sizeA = 0;
    let sizeB = 0;
    a.forEach((count, gram) => {
      sizeA += count;
      const other = b.get(gram);
      if (other) shared += Math.min(count, other);
    });
    b.forEach(count => {
      sizeB += count;
    });
    return (2 * shared) / (sizeA + sizeB);
  }

  function rangeFromTextIndex(pageIndex, startIndex, endIndex) {
    const startNode = findTextBoundary(pageIndex.nodes, startIndex, "start");
    const endNode = findTextBoundary(pageIndex.nodes, endIndex, "end");
    if (!startNode || !endNode) return null;
    const range = document.createRange();
    range.setStart(startNode.node, startIndex - startNode.start);
    range.setEnd(endNode.node, endIndex - endNode.start);
    return range;
  }

  function buildCurrentTextIndex() {
    return buildPageTextIndex(true);
  }

  function buildPageTextIndex(includeHighlights) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: node => {
        const ownHighlight = node.parentElement && node.parentElement.classList.contains(HIGHLIGHT_CLASS);
        if (shouldExcludeNode(node) && !(includeHighlights && ownHighlight)) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!includeHighlights && ownHighlight) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let text = "";
    let node;
    while ((node = walker.nextNode())) {
      nodes.push({ node, start: text.length, end: text.length + node.textContent.length });
      text += node.textContent;
    }
    return { text, normalizedText: normalizeLocatorText(text), nodes };
  }

  function findTextBoundary(nodes, targetIndex, mode) {
    if (!nodes.length) return null;
    const node = nodes.find(item => item.start <= targetIndex && item.end >= targetIndex);
    if (node) return node;
    if (mode === "end" && targetIndex === nodes[nodes.length - 1].end) return nodes[nodes.length - 1];
    return null;
  }

  function getRangeTextPosition(range, pageIndex) {
    const startItem = pageIndex.nodes.find(item => item.node === range.startContainer);
    const endItem = pageIndex.nodes.find(item => item.node === range.endContainer);
    if (!startItem || !endItem) return null;
    return {
      start: startItem.start + range.startOffset,
      end: endItem.start + range.endOffset
    };
  }

  function getOccurrenceIndex(text, exact, targetIndex) {
    if (!exact) return null;
    let occurrence = 0;
    let index = text.indexOf(exact);
    while (index >= 0) {
      if (index === targetIndex) return occurrence;
      occurrence++;
      index = text.indexOf(exact, index + exact.length);
    }
    return null;
  }

  function countOccurrences(text, exact) {
    if (!exact) return 0;
    let count = 0;
    let index = text.indexOf(exact);
    while (index >= 0 && count <= 500) {
      count++;
      index = text.indexOf(exact, index + exact.length);
    }
    return count;
  }

  function getBlockAnchor(range) {
    const element = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const block = findUsefulBlock(element);
    const text = block ? normalizeLocatorText(block.innerText || block.textContent || "").slice(0, 800) : "";
    return {
      text,
      hash: hashLocatorText(text),
      selector: getCssSelector(block)
    };
  }

  function findUsefulBlock(element) {
    let current = element;
    let best = element;
    while (current && current !== document.body && current.nodeType === Node.ELEMENT_NODE) {
      const text = normalizeLocatorText(current.innerText || current.textContent || "");
      if (text.length >= 40 || hasExamSignals(text)) return current;
      best = current;
      current = current.parentElement;
    }
    return best;
  }

  function getExamAnchor(range, pageIndex, textPosition) {
    const exact = range.toString();
    const start = textPosition ? textPosition.start : 0;
    const windowText = pageIndex.text.slice(Math.max(0, start - 1200), Math.min(pageIndex.text.length, start + 1200));
    const blockAnchor = getBlockAnchor(range);
    const combined = `${blockAnchor.text} ${windowText}`;
    const question = findNearestQuestion(pageIndex.text, start);
    const option = findNearestOption(combined, exact);
    const enabled = Boolean(option || hasExamSignals(combined));
    if (!enabled) return { enabled: false, confidence: 0 };
    const questionBlockText = question ? normalizeLocatorText(pageIndex.text.slice(question.start, question.end)).slice(0, 1200) : blockAnchor.text;
    return {
      enabled: true,
      confidence: Math.min(1, (question ? 0.4 : 0) + (option ? 0.35 : 0) + (hasExamSignals(combined) ? 0.25 : 0)),
      questionNumber: question ? question.number : "",
      optionLabel: option ? option.label : "",
      optionText: option ? option.text : "",
      questionBlockText,
      questionBlockHash: hashLocatorText(questionBlockText)
    };
  }

  function getWordBoundaryAnchor(range, pageIndex, textPosition) {
    const exact = range.toString();
    const isWordLike = /^[A-Za-z0-9'-]+$/.test(exact);
    if (!isWordLike || !textPosition) return { enabled: false };
    const leftChar = pageIndex.text[textPosition.start - 1] || "";
    const rightChar = pageIndex.text[textPosition.end] || "";
    return {
      enabled: true,
      isWholeWord: !isWordChar(leftChar) && !isWordChar(rightChar)
    };
  }

  function findNearestQuestion(text, index) {
    const pattern = /(?:^|\n|\s)(?:Question\s*)?(\d{1,3})[.)]/gi;
    const matches = [];
    let match;
    while ((match = pattern.exec(text))) {
      if (match.index <= index) matches.push({ number: match[1], start: match.index });
      else break;
      if (matches.length > 300) matches.shift();
    }
    const current = matches[matches.length - 1];
    if (!current) return null;
    pattern.lastIndex = index + 1;
    const next = pattern.exec(text);
    return { ...current, end: next ? next.index : Math.min(text.length, current.start + 2500) };
  }

  function findNearestOption(text, exact) {
    const options = [];
    const pattern = /(?:^|\s|\n)([A-D])[.)]\s*([^\n]{0,160})/g;
    let match;
    while ((match = pattern.exec(text))) {
      options.push({ label: match[1].toUpperCase(), text: normalizeLocatorText(`${match[1]}. ${match[2] || ""}`) });
    }
    if (!options.length) return null;
    const normalizedExact = normalizeLocatorText(exact).toUpperCase();
    if (/^[A-D]$/.test(normalizedExact)) return options.find(option => option.label === normalizedExact) || null;
    return options.find(option => option.text.toLowerCase().includes(normalizedExact.toLowerCase())) || null;
  }

  function findQuoteIndex(pageIndex, selector) {
    const text = pageIndex.text;
    const exact = selector.exact || "";
    if (!exact) return -1;
    const matches = [];
    let index = text.indexOf(exact);
    while (index >= 0) {
      matches.push(index);
      index = text.indexOf(exact, index + exact.length);
    }
    if (matches.length <= 1) return matches[0] ?? -1;
    const contextMatch = matches.find(match => {
      const prefix = selector.prefix || "";
      const suffix = selector.suffix || "";
      return (!prefix || text.slice(Math.max(0, match - prefix.length), match).endsWith(prefix)) &&
        (!suffix || text.slice(match + exact.length, match + exact.length + suffix.length).startsWith(suffix));
    });
    if (contextMatch !== undefined && !isRiskySelector(selector, matches.length)) return contextMatch;
    return findBestScoredMatch(pageIndex, selector, matches);
  }

  function findBestScoredMatch(pageIndex, selector, matches) {
    const scored = matches.slice(0, 300).map((match, order) => ({
      index: match,
      score: scoreQuoteMatch(pageIndex, selector, match, order)
    })).sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) return -1;
    const risky = isRiskySelector(selector, matches.length);
    const threshold = risky ? 42 : 30;
    const second = scored[1];
    if (best.score < threshold) return getBestLegacyFallback(pageIndex.text, selector, matches);
    if (risky && second && best.score - second.score < 6 && best.score < 75) return getBestLegacyFallback(pageIndex.text, selector, matches);
    return best.index;
  }

  function rememberRestoreAnchor(markId) {
    if (!markId) return;
    const spans = Array.from(document.querySelectorAll(`.${HIGHLIGHT_CLASS}[data-mark-id="${CSS.escape(markId)}"]`));
    if (!spans.length) return;
    const firstText = spans.find(span => span.firstChild && span.firstChild.nodeType === Node.TEXT_NODE);
    const pageIndex = buildPageTextIndex(true);
    const item = firstText && pageIndex.nodes.find(nodeInfo => nodeInfo.node === firstText.firstChild);
    if (!item) return;
    activeRestoreAnchors.push({ markId, start: item.start });
    if (activeRestoreAnchors.length > 8) activeRestoreAnchors.shift();
  }

  function getBestLegacyFallback(text, selector, matches) {
    const prefix = selector.prefix || "";
    const suffix = selector.suffix || "";
    const contextMatch = matches.find(match =>
      (!prefix || text.slice(Math.max(0, match - prefix.length), match).endsWith(prefix)) &&
      (!suffix || text.slice(match + selector.exact.length, match + selector.exact.length + suffix.length).startsWith(suffix))
    );
    if (contextMatch !== undefined) return contextMatch;
    const extra = selector.extra || {};
    const wholeWordMatches = getWholeWordMatches(text, selector, matches);
    if (wholeWordMatches.length) matches = wholeWordMatches;
    if (Number.isFinite(extra.occurrenceIndex) && matches[extra.occurrenceIndex] !== undefined) return matches[extra.occurrenceIndex];
    return matches[0];
  }

  function scoreQuoteMatch(pageIndex, selector, match, order) {
    const exact = selector.exact || "";
    const extra = selector.extra || {};
    const exam = extra.exam || {};
    let score = 30;
    const prefix = selector.prefix || "";
    const suffix = selector.suffix || "";
    if (prefix && pageIndex.text.slice(Math.max(0, match - prefix.length), match).endsWith(prefix)) score += 18;
    if (suffix && pageIndex.text.slice(match + exact.length, match + exact.length + suffix.length).startsWith(suffix)) score += 18;
    if (Number.isFinite(extra.textStart)) score += Math.max(0, 16 - Math.abs(extra.textStart - match) / 80);
    if (Number.isFinite(extra.occurrenceIndex) && extra.occurrenceIndex === order) score += 18;
    score += nearbyAnchorScore(match);
    score += wordBoundaryScore(pageIndex.text, selector, match);

    const localText = normalizeLocatorText(pageIndex.text.slice(Math.max(0, match - 1200), Math.min(pageIndex.text.length, match + exact.length + 1200)));
    if (extra.blockHash && hashLocatorText(localText.slice(0, 800)) === extra.blockHash) score += 28;
    else if (extra.blockText) score += similarityScore(extra.blockText, localText) * 24;

    if (exam.enabled) {
      const question = findNearestQuestion(pageIndex.text, match);
      if (exam.questionNumber && question && question.number === exam.questionNumber) score += 45;
      if (exam.optionLabel && hasOptionLabelNear(localText, exam.optionLabel)) score += 24;
      if (exam.optionText && localText.includes(normalizeLocatorText(exam.optionText))) score += 34;
      if (exam.questionBlockHash) {
        const questionText = question ? normalizeLocatorText(pageIndex.text.slice(question.start, question.end)).slice(0, 1200) : localText;
        if (hashLocatorText(questionText) === exam.questionBlockHash) score += 32;
        else score += similarityScore(exam.questionBlockText || "", questionText) * 28;
      }
    }
    return score;
  }

  function isRiskySelector(selector, occurrenceCount) {
    const exact = selector.exact || "";
    const exam = selector.extra && selector.extra.exam;
    return Boolean(exam && exam.enabled) || isVeryRiskyExact(exact, occurrenceCount);
  }

  function nearbyAnchorScore(match) {
    if (!activeRestoreAnchors.length) return 0;
    const nearest = activeRestoreAnchors.reduce((best, anchor) => Math.min(best, Math.abs(anchor.start - match)), Infinity);
    if (nearest <= 400) return 14;
    if (nearest <= 1200) return 9;
    if (nearest <= 2500) return 5;
    return 0;
  }

  function wordBoundaryScore(text, selector, match) {
    const boundary = selector.extra && selector.extra.wordBoundary;
    if (!boundary || !boundary.enabled || !boundary.isWholeWord) return 0;
    return isWholeWordAt(text, match, (selector.exact || "").length) ? 24 : -18;
  }

  function getWholeWordMatches(text, selector, matches) {
    const boundary = selector.extra && selector.extra.wordBoundary;
    if (!boundary || !boundary.enabled || !boundary.isWholeWord) return [];
    const exact = selector.exact || "";
    return matches.filter(match => isWholeWordAt(text, match, exact.length));
  }

  function isWholeWordAt(text, index, length) {
    return !isWordChar(text[index - 1] || "") && !isWordChar(text[index + length] || "");
  }

  function isWordChar(char) {
    return /[A-Za-z0-9_]/.test(char);
  }

  function isVeryRiskyExact(exact, occurrenceCount) {
    const normalized = normalizeLocatorText(exact);
    return /^[A-D]$/i.test(normalized) || (normalized.length <= 2 && occurrenceCount >= 12);
  }

  function hasOptionLabelNear(text, label) {
    return new RegExp(`(?:^|\\s)${label}[.)]`, "i").test(text);
  }

  function similarityScore(a, b) {
    const aTokens = tokenSet(a);
    const bTokens = tokenSet(b);
    if (!aTokens.size || !bTokens.size) return 0;
    let shared = 0;
    aTokens.forEach(token => { if (bTokens.has(token)) shared++; });
    return shared / Math.max(aTokens.size, bTokens.size);
  }

  function tokenSet(text) {
    return new Set(normalizeLocatorText(text).toLowerCase().split(/\s+/).filter(token => token.length > 1).slice(0, 120));
  }

  function normalizeLocatorText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function hashLocatorText(text) {
    const normalized = normalizeLocatorText(text);
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
    }
    return String(hash);
  }

  function hasExamSignals(text) {
    const normalized = normalizeLocatorText(text);
    const questionCount = (normalized.match(/(?:^|\s)(?:Question\s*)?\d{1,3}[.)]/gi) || []).length;
    const optionCount = (normalized.match(/(?:^|\s)[A-D][.)]\s+/g) || []).length;
    return questionCount >= 2 || optionCount >= 3;
  }

  function applyHighlightToRange(range, mark) {
    const textNodes = getTextNodesInRange(range);
    textNodes.forEach(node => {
      if (!node.parentNode || shouldExcludeNode(node)) return;
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.textContent.length;
      if (start >= end) return;
      wrapTextNode(node, start, end, mark);
    });
  }

  function wrapTextNode(node, start, end, mark) {
    const text = node.textContent;
    const fragment = document.createDocumentFragment();
    if (start > 0) fragment.appendChild(document.createTextNode(text.slice(0, start)));
    const span = document.createElement("span");
    span.className = HIGHLIGHT_CLASS;
    span.dataset.markId = mark.id;
    span.textContent = text.slice(start, end);
    const color = mark.color || WAUtils.DEFAULT_COLORS[0];
    // 记下底色与样式，偏好变更时可在原地重新着色，无需重建 DOM
    span.dataset.hlBg = color.bg || "";
    span.dataset.hlStyle = color.style || "background";
    applyHighlightStyle(span, color);
    fragment.appendChild(span);
    if (end < text.length) fragment.appendChild(document.createTextNode(text.slice(end)));
    node.parentNode.replaceChild(fragment, node);
  }

  /**
   * 高亮文字颜色的取值策略：
   *   original（默认）—— 不覆盖网页文字颜色，保持原样；
   *   black           —— 固定黑色；
   *   auto            —— 旧行为：按底色亮度取黑/白对比色。
   */
  function resolveHighlightTextColor(color) {
    const mode = (uiPrefs && uiPrefs.highlightTextColor) || "original";
    if (mode === "black") return "#000000";
    if (mode === "auto") return color.text || WAUtils.getTextColor(color.bg);
    return "";
  }

  function applyHighlightStyle(element, color) {
    const style = color.style || "background";
    element.style.removeProperty("background-color");
    element.style.removeProperty("color");
    element.style.removeProperty("text-decoration");
    element.style.removeProperty("text-decoration-color");
    element.style.removeProperty("text-decoration-thickness");
    if (style === "background") {
      element.style.setProperty("background-color", color.bg, "important");
      const textColor = resolveHighlightTextColor(color);
      if (textColor) element.style.setProperty("color", textColor, "important");
      return;
    }
    element.style.setProperty("text-decoration", style === "underline-wavy" ? "underline wavy" : style, "important");
    element.style.setProperty("text-decoration-color", color.bg, "important");
    element.style.setProperty("text-decoration-thickness", "2px", "important");
  }

  /** 偏好变化时就地重新着色已有高亮（数据来自 wrapTextNode 记下的 data-hl-*）。 */
  function reapplyHighlightStyles() {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(span => {
      const bg = span.dataset.hlBg;
      if (!bg) return;
      applyHighlightStyle(span, { bg, style: span.dataset.hlStyle || "background" });
    });
  }

  function getTextNodesInRange(range) {
    if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
      return [range.startContainer];
    }
    const nodes = [];
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
      acceptNode: node => range.intersectsNode(node) && !shouldExcludeNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    });
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
  }

  function shouldExcludeNode(node) {
    let parent = node.parentElement || node.parentNode;
    while (parent && parent.nodeType === Node.ELEMENT_NODE) {
      if (["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META", "LINK", "TITLE", "SVG", "PATH", "TEXTAREA", "INPUT"].includes(parent.tagName)) return true;
      if (parent.id === TOOLBAR_ID || parent.id === TOAST_ID || parent.id === RAIL_ID || parent.id === ACTS_ID || parent.classList.contains(HIGHLIGHT_CLASS)) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function unwrapHighlights() {
    const parents = new Set();
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(span => {
      const parent = span.parentNode;
      if (parent) parents.add(parent);
      span.replaceWith(document.createTextNode(span.textContent));
    });
    // 只合并受影响父节点内的相邻文本节点；整页 normalize() 会破坏页面脚本持有的文本节点引用
    parents.forEach(parent => {
      try {
        parent.normalize();
      } catch (error) {
        // 节点已脱离文档时忽略
      }
    });
  }

  function getNodePath(node, root) {
    const path = [];
    let current = node;
    while (current && current !== root) {
      const parent = current.parentNode;
      if (!parent) break;
      path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
      current = parent;
    }
    return path;
  }

  function getNodeByPath(path, root) {
    if (!Array.isArray(path)) return null;
    return path.reduce((node, index) => node && node.childNodes[index], root);
  }

  function getNodeLength(node) {
    return node.nodeType === Node.TEXT_NODE ? node.textContent.length : node.childNodes.length;
  }

  function collectContextBefore(range, length) {
    const clone = range.cloneRange();
    clone.selectNodeContents(document.body);
    clone.setEnd(range.startContainer, range.startOffset);
    return clone.toString().slice(-length);
  }

  function collectContextAfter(range, length) {
    const clone = range.cloneRange();
    clone.selectNodeContents(document.body);
    clone.setStart(range.endContainer, range.endOffset);
    return clone.toString().slice(0, length);
  }

  function getCssSelector(element) {
    if (!element) return "";
    if (element.id) return `#${CSS.escape(element.id)}`;
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.className && typeof current.className === "string") selector += `.${current.className.trim().split(/\s+/).map(CSS.escape).join(".")}`;
      parts.unshift(selector);
      current = current.parentElement;
    }
    return parts.join(" > ");
  }

  function getLinkUrl(range) {
    const element = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const link = element && element.closest && element.closest("a[href]");
    return link ? link.href : "";
  }

  function getPageIcon() {
    const icon = document.querySelector("link[rel~='icon']");
    return icon ? icon.href : "";
  }


  function isInsideOwnUi(node) {
    if (!node || typeof node.nodeType !== "number") return false;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(element && element.closest(`#${TOOLBAR_ID}, #${TOAST_ID}, #${RAIL_ID}, #${ACTS_ID}, #${STYLE_PICKER_ID}, #${COLOR_PICKER_ID}, #${DETAILS_ID}`));
  }

  function createToast() {
    if (document.getElementById(TOAST_ID)) return;
    const toast = document.createElement("div");
    toast.id = TOAST_ID;
    document.documentElement.appendChild(toast);
  }

  function createNoteDetailsCard() {
    if (document.getElementById(DETAILS_ID)) return;
    const card = document.createElement("div");
    card.id = DETAILS_ID;
    card.addEventListener("click", event => {
      event.stopPropagation();
      if (event.target.closest("[data-action='close-details']")) { hideNoteDetailsCard(); return; }
      // 点击标签按钮时不触发展开/收起逻辑
      if (event.target.closest("button[data-tag-id]")) return;
      // 文本展开/收起（与侧栏卡片逻辑一致）
      const expandable = event.target.closest(".wa-details-highlight, .wa-details-description");
      if (expandable) {
        // 如果已展开，点击内部不收起（保持编辑状态）
        if (expandable.classList.contains("expanded")) return;
        expandable.classList.toggle("expanded");
        return;
      }
      // 点击卡片内非展开元素时，收起所有已展开的文本
      card.querySelectorAll(".expanded").forEach(el => el.classList.remove("expanded"));
    });
    card.addEventListener("blur", event => {
      if (event.target.matches('[data-field="details-description"]')) saveDetailsDescription(event.target.value);
    }, true);
    card.addEventListener("click", event => {
      const tagButton = event.target.closest("button[data-tag-id]");
      if (tagButton) selectDetailsTag(tagButton.dataset.tagId);
    });
    document.documentElement.appendChild(card);
  }

  async function showNoteDetailsCard(markId, highlight) {
    const card = document.getElementById(DETAILS_ID);
    if (!card || !markId) return;
    try {
      const [mark, tags] = await Promise.all([
        WAUtils.sendMessage({ type: "GET_MARK_BY_ID_BG", data: { markId } }),
        WAUtils.sendMessage({ type: "GET_TAGS_FOR_MARK_BG", data: { markId } })
      ]);
      if (!mark) return;
      currentDetailsMarkId = markId;
      const rect = highlight.getBoundingClientRect();
      card.dataset.position = getDetailsCardPosition(rect);
      card.dataset.cardStyle = uiPrefs.cardStyle || "a";
      const allTags = await WAUtils.sendMessage({ type: "GET_TAGS_BG" });
      card.innerHTML = renderNoteDetailsHtml(mark, tags || [], allTags || []);
      card.style.setProperty("--mark-color", mark.color && mark.color.bg ? mark.color.bg : "#2dd4bf");
      // 备注栏自适应高度
      const descEl = card.querySelector(".wa-details-description");
      if (descEl) {
        const autoResize = () => { descEl.style.height = "auto"; descEl.style.height = descEl.scrollHeight + "px"; };
        autoResize();
        descEl.addEventListener("input", autoResize);
      }
      // 标签栏滚轮横向滚动
      const tagsEl = card.querySelector(".wa-details-tags");
      if (tagsEl) {
        let _sTarget = tagsEl.scrollLeft, _sAnim = null;
        const _step = () => {
          const diff = _sTarget - tagsEl.scrollLeft;
          if (Math.abs(diff) < 0.5) { tagsEl.scrollLeft = _sTarget; _sAnim = null; return; }
          tagsEl.scrollLeft += diff * 0.15;
          _sAnim = requestAnimationFrame(_step);
        };
        tagsEl.addEventListener("wheel", (e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.preventDefault();
            const max = tagsEl.scrollWidth - tagsEl.clientWidth;
            _sTarget = Math.max(0, Math.min(max, _sTarget + e.deltaY * 0.3));
            if (!_sAnim) _sAnim = requestAnimationFrame(_step);
          }
        }, { passive: false });
      }
      requestAnimationFrame(() => {
        card.classList.add("visible");
        // 动画结束后自动聚焦到备注输入栏，光标置于文本末尾
        setTimeout(() => {
          const descInput = card.querySelector(".wa-details-description");
          if (descInput) {
            descInput.focus();
            const len = descInput.value.length;
            descInput.setSelectionRange(len, len);
          }
        }, 320);
      });
    } catch (error) {
      console.warn("Web Annotator: failed to show note details", error);
    }
  }

  function hideNoteDetailsCard() {
    const card = document.getElementById(DETAILS_ID);
    if (card) card.classList.remove("visible");
    currentDetailsMarkId = null;
  }

  function getDetailsCardPosition(highlightRect) {
    const cardHeight = Math.min(420, window.innerHeight * 0.46);
    const safeMargin = 24;
    const bottomCoveredTop = window.innerHeight - safeMargin - cardHeight;
    const highlightCenter = highlightRect.top + highlightRect.height / 2;
    return highlightCenter > bottomCoveredTop ? "top" : "bottom";
  }

  function renderNoteDetailsHtml(mark, markTags, allTags) {
    const selectedTagIds = new Set(markTags.map(tag => tag.id));
    const tagHtml = allTags.length
      ? `<div class="wa-details-tags">${allTags.map(tag => `<button type="button" class="${selectedTagIds.has(tag.id) ? "active" : ""}" data-tag-id="${tag.id}">${escapeHtml(tag.name)}</button>`).join("")}</div>`
      : "<div class=\"wa-details-empty\">暂无标签，请先在侧栏样式页创建</div>";
    const linkHtml = mark.link_url
      ? `<div class="wa-details-link"><strong>链接：</strong><a href="${escapeHtml(mark.link_url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(mark.link_url)}</a></div>`
      : "";
    return `
      <div class="wa-details-header">
        <div><span class="wa-details-date">${new Date(mark.created_at).toLocaleDateString()}</span></div>
        <button type="button" data-action="close-details" title="关闭"><svg viewBox="0 0 24 24" width="12" height="12"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
      </div>
      <div class="wa-details-highlight">${escapeHtml(mark.text || "-")}</div>
      <textarea class="wa-details-description" data-field="details-description" rows="1" placeholder="请输入文字批注">${escapeHtml(mark.description || "")}</textarea>
      ${tagHtml}
      ${linkHtml}
    `;
  }

  async function saveDetailsDescription(description) {
    if (!currentDetailsMarkId) return;
    const mark = await WAUtils.sendMessage({ type: "GET_MARK_BY_ID_BG", data: { markId: currentDetailsMarkId } });
    if (!mark) return;
    await WAUtils.sendMessage({ type: "UPDATE_MARK_BG", data: { mark: { ...mark, description: description.trim() } } });
  }

  async function selectDetailsTag(tagId) {
    if (!currentDetailsMarkId || !tagId) return;
    const card = document.getElementById(DETAILS_ID);
    const button = card.querySelector(".wa-details-tags button[data-tag-id=\"" + tagId + "\"]");
    const isActive = button && button.classList.contains("active");
    if (isActive) {
      await WAUtils.sendMessage({ type: "REMOVE_TAG_FROM_MARK_BG", data: { markId: currentDetailsMarkId, tagId } });
      button.classList.remove("active");
      showToast("标签已移除");
    } else {
      await WAUtils.sendMessage({ type: "ADD_TAG_TO_MARK_BG", data: { markId: currentDetailsMarkId, tagId } });
      if (button) button.classList.add("active");
      showToast("标签已添加");
    }
  }

  function createStatusRail() {
    if (document.getElementById(RAIL_ID)) return;
    const rail = document.createElement("div");
    rail.id = RAIL_ID;
    rail.innerHTML = [
      "<button type=\"button\" data-action=\"panel\" title=\"打开侧栏\"><svg viewBox=\"0 0 24 24\"><rect x=\"3\" y=\"3\" width=\"7\" height=\"18\" rx=\"1.5\"/><rect x=\"14\" y=\"3\" width=\"7\" height=\"18\" rx=\"1.5\"/></svg></button>",
      "<button type=\"button\" data-action=\"page-panel\" title=\"在本页打开大面板\"><svg viewBox=\"0 0 24 24\"><path d=\"M8 3H5a2 2 0 0 0-2 2v3\"/><path d=\"M16 3h3a2 2 0 0 1 2 2v3\"/><path d=\"M8 21H5a2 2 0 0 1-2-2v-3\"/><path d=\"M16 21h3a2 2 0 0 0 2-2v-3\"/></svg></button>",
      "<div class=\"wa-rail-divider\"></div>",
      "<button type=\"button\" data-action=\"style\" title=\"高亮标注\"><svg viewBox=\"0 0 24 24\"><path d=\"M12 20h9\"/><path d=\"M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z\"/></svg></button>",
      "<button type=\"button\" data-action=\"sync\" title=\"同步当前页高亮\"><svg viewBox=\"0 0 24 24\"><path d=\"M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/><path d=\"M3 3v5h5\"/><path d=\"M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16\"/><path d=\"M16 16h5v5\"/></svg></button>"
    ].join("");
    rail.addEventListener("mousedown", event => {
      if (event.target.closest("button[data-action]")) return;
      event.preventDefault();
      railDrag = { startY: event.clientY, startTop: rail.getBoundingClientRect().top, moved: false };
      document.addEventListener("mousemove", handleRailDrag);
      document.addEventListener("mouseup", stopRailDrag, { once: true });
    });
    rail.addEventListener("click", async event => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      if (railDrag && railDrag.moved) return;
      event.preventDefault();
      event.stopPropagation();
      if (button.dataset.action === "sync") {
        await restoreHighlights(true);
        return;
      }
      if (button.dataset.action === "page-panel") {
        togglePagePanel();
        return;
      }
      const page = button.dataset.action === "style" ? "style" : "marks";
      try {
        await WAUtils.sendMessage({ type: "OPEN_SIDE_PANEL_BG", data: { page } });
      } catch (error) {
        showToast("请重新加载页面后再打开侧栏");
      }
    });
    document.documentElement.appendChild(rail);
    rail.style.top = `${resolveRailTop(rail)}px`;
    // 窗口尺寸变化时把悬浮栏拉回视口内（存量坐标可能来自更高的窗口）
    window.addEventListener("resize", clampRailIntoViewport);
  }

  /**
   * 读取悬浮栏纵坐标：越界的存量值（例如窗口变矮后遗留的旧坐标）一律丢弃并回到默认位置。
   * 这就是"某些站点看不到悬浮窗"的成因——localStorage 按域名隔离，脏坐标只在那个站生效。
   */
  function resolveRailTop(rail) {
    const height = rail.offsetHeight || 132;
    const max = Math.max(8, window.innerHeight - height - 8);
    const fallback = Math.min(Math.max(8, Math.round(window.innerHeight * 0.42)), max);
    const stored = Number(localStorage.getItem(RAIL_TOP_KEY));
    if (!Number.isFinite(stored) || stored < 8 || stored > max) {
      if (Number.isFinite(stored) && stored !== 0) localStorage.removeItem(RAIL_TOP_KEY);
      return fallback;
    }
    return stored;
  }

  /** 视口变小后把悬浮栏拉回可视范围，并同步修正存量坐标。 */
  function clampRailIntoViewport() {
    const rail = document.getElementById(RAIL_ID);
    if (!rail) return;
    const height = rail.offsetHeight || 132;
    const max = Math.max(8, window.innerHeight - height - 8);
    const current = Number.parseFloat(rail.style.top);
    if (!Number.isFinite(current)) return;
    const next = Math.min(Math.max(8, current), max);
    if (next !== current) {
      rail.style.top = `${next}px`;
      localStorage.setItem(RAIL_TOP_KEY, String(Math.round(next)));
    }
  }

  /* ---- 本页大面板：用 iframe 把侧边栏页面装进来，一套 UI 两个入口 ---- */

  let pagePanelCleanup = null;

  function togglePagePanel() {
    if (document.getElementById(PAGE_PANEL_ID)) {
      closePagePanel();
      return;
    }
    openPagePanel();
  }

  /**
   * 锁住宿主网页的滚动，返回还原函数。
   * 只改内联样式、关闭时原样写回，并补上滚动条让出的宽度，避免开合时页面横向跳一下。
   */
  function lockHostScroll() {
    const html = document.documentElement;
    const body = document.body;
    const before = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight
    };
    const gap = Math.max(0, window.innerWidth - html.clientWidth);
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (gap > 0) {
      const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + gap}px`;
    }
    return () => {
      html.style.overflow = before.htmlOverflow;
      body.style.overflow = before.bodyOverflow;
      body.style.paddingRight = before.bodyPaddingRight;
    };
  }

  function openPagePanel() {
    if (document.getElementById(PAGE_PANEL_ID)) return;
    const runtime = getRuntime();
    if (!runtime || typeof runtime.getURL !== "function") {
      showToast("扩展已更新，请刷新页面后再试");
      return;
    }
    const wrap = document.createElement("div");
    wrap.id = PAGE_PANEL_ID;
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "XA-Note 面板");
    wrap.innerHTML =
      '<div class="wa-page-panel-card">' +
        '<div class="wa-page-panel-head">' +
          '<span class="wa-page-panel-title">XA-Note</span>' +
          '<button type="button" class="wa-page-panel-close" title="关闭（Esc）" aria-label="关闭">×</button>' +
        '</div>' +
        '<iframe class="wa-page-panel-frame" title="XA-Note 面板"></iframe>' +
      '</div>';
    const card = wrap.firstElementChild;
    wrap.querySelector(".wa-page-panel-close").addEventListener("click", closePagePanel);
    const frame = wrap.querySelector(".wa-page-panel-frame");
    frame.src = runtime.getURL("sidepanel.html?surface=page-panel");

    const onPointerDown = event => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (card.contains(target)) return;
      // 点在悬浮栏上交给它自己切换，避免"关掉又立刻打开"
      if (target instanceof Element && target.closest(`#${RAIL_ID}`)) return;
      closePagePanel();
    };
    const onKeyDown = event => {
      if (event.key === "Escape") closePagePanel();
    };
    // 面板开着时滚轮一律留在面板里：在 document 捕获阶段就把父文档的滚轮事件拦掉。
    // iframe 里的滚轮事件不会冒泡到父文档，所以面板内部照常滚，被挡住的只有面板外的区域。
    const onWheel = event => {
      event.preventDefault();
      event.stopPropagation();
    };
    const wheelOptions = { passive: false, capture: true };
    document.addEventListener("wheel", onWheel, wheelOptions);
    document.addEventListener("mousewheel", onWheel, wheelOptions);
    document.addEventListener("DOMMouseScroll", onWheel, wheelOptions);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.documentElement.classList.add(PAGE_PANEL_OPEN_CLASS);
    // 第二道闸：直接把网页的滚动锁住，连拖滚动条、空格/方向键翻页也一起挡住
    const unlockHostScroll = lockHostScroll();
    document.body.appendChild(wrap);
    pagePanelCleanup = () => {
      document.removeEventListener("wheel", onWheel, true);
      document.removeEventListener("mousewheel", onWheel, true);
      document.removeEventListener("DOMMouseScroll", onWheel, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.documentElement.classList.remove(PAGE_PANEL_OPEN_CLASS);
      unlockHostScroll();
    };
  }

  function closePagePanel() {
    if (pagePanelCleanup) {
      pagePanelCleanup();
      pagePanelCleanup = null;
    }
    const wrap = document.getElementById(PAGE_PANEL_ID);
    if (wrap) wrap.remove();
  }

  function handleRailDrag(event) {
    const rail = document.getElementById(RAIL_ID);
    if (!rail || !railDrag) return;
    const nextTop = Math.min(Math.max(8, railDrag.startTop + event.clientY - railDrag.startY), window.innerHeight - rail.offsetHeight - 8);
    if (Math.abs(event.clientY - railDrag.startY) > 3) railDrag.moved = true;
    rail.style.top = `${nextTop}px`;
    rail.style.transform = "none";
  }

  function stopRailDrag() {
    const rail = document.getElementById(RAIL_ID);
    if (rail) localStorage.setItem(RAIL_TOP_KEY, String(Math.round(rail.getBoundingClientRect().top)));
    document.removeEventListener("mousemove", handleRailDrag);
    setTimeout(() => { railDrag = null; }, 0);
  }

  function showActsNode(markId, x, y, element) {
    removeActsNode();
    if (!markId) return;
    const container = document.createElement("div");
    container.id = ACTS_ID;
    container.dataset.markId = markId;
    container.innerHTML = [
      "<button type=\"button\" data-action=\"color\" title=\"更换颜色\"><span class=\"wa-act-color\"></span></button>",
      "<div class=\"wa-acts-sep\"></div>",
      "<button type=\"button\" data-action=\"style\" title=\"修改样式\"><svg viewBox=\"0 0 24 24\"><path d=\"M12 20h9\"/><path d=\"M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z\"/></svg></button>",
      "<div class=\"wa-acts-sep\"></div>",
      "<button type=\"button\" data-action=\"favorite\" title=\"收藏\"><svg viewBox=\"0 0 24 24\"><path d=\"M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z\"/></svg></button>",
      "<div class=\"wa-acts-sep\"></div>",
      "<button type=\"button\" data-action=\"delete\" title=\"删除\"><svg viewBox=\"0 0 24 24\"><polyline points=\"3 6 5 6 21 6\"/><path d=\"M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6\"/><path d=\"M10 11v6\"/><path d=\"M14 11v6\"/><path d=\"M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2\"/></svg></button>"
    ].join("");
    container.addEventListener("click", event => handleActsClick(event, markId, element));
    document.body.appendChild(container);
    hydrateActsNode(container, markId);
    hydrateQuickTags(container, markId, x, y);
    requestAnimationFrame(() => {
      const rect = container.getBoundingClientRect();
      const position = calculateActsPosition(x, y, rect.width, rect.height);
      container.style.left = `${position.left}px`;
      container.style.top = `${position.top}px`;
      container.style.opacity = "1";
    });
  }

  /** 操作条尾部的快捷标签：取使用频率最高的三个标签，点一下就贴/取消。 */
  async function hydrateQuickTags(container, markId, x, y) {
    try {
      const tags = await WAUtils.sendMessage({ type: "GET_TAGS_WITH_COUNT_BG" });
      const top = (tags || []).slice(0, 3);
      if (!top.length) return;
      const relations = await WAUtils.sendMessage({ type: "GET_TAGS_FOR_MARK_BG", data: { markId } }) || [];
      const activeIds = new Set(relations.map(item => item.tag_id));
      const separator = document.createElement("div");
      separator.className = "wa-acts-sep";
      const row = document.createElement("div");
      row.className = "wa-quick-tags";
      top.forEach(tag => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "wa-quick-tag" + (activeIds.has(tag.id) ? " active" : "");
        button.dataset.action = "tag";
        button.dataset.tagId = tag.id;
        button.dataset.tagName = tag.name;
        button.title = `标签「${tag.name}」（已用于 ${tag.count || 0} 处）· 点击贴标签，再点取消`;
        button.textContent = tag.name;
        row.appendChild(button);
      });
      container.append(separator, row);
      // 追加内容后宽度变了，重新居中一次
      requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        const position = calculateActsPosition(x, y, rect.width, rect.height);
        container.style.left = `${position.left}px`;
        container.style.top = `${position.top}px`;
      });
    } catch (error) {
      // 标签数据不可用时静默跳过，不影响原有操作条
    }
  }

  /** 给标注贴 / 取消一个标签。 */
  async function toggleTagOnMark(markId, tagId, tagName, button) {
    try {
      const relations = await WAUtils.sendMessage({ type: "GET_TAGS_FOR_MARK_BG", data: { markId } }) || [];
      const has = relations.some(item => item.tag_id === tagId);
      if (has) {
        await WAUtils.sendMessage({ type: "REMOVE_TAG_FROM_MARK_BG", data: { markId, tagId } });
        button.classList.remove("active");
        showToast(`已移除标签「${tagName}」`);
      } else {
        await WAUtils.sendMessage({ type: "ADD_TAG_TO_MARK_BG", data: { markId, tagId } });
        button.classList.add("active");
        showToast(`已标记为「${tagName}」`);
      }
    } catch (error) {
      showToast("标签操作失败，请重试");
    }
  }

  async function hydrateActsNode(container, markId) {
    try {
      const mark = await WAUtils.sendMessage({ type: "GET_MARK_BY_ID_BG", data: { markId } });
      if (!mark) return;
      const colorSwatch = container.querySelector(".wa-act-color");
      if (colorSwatch) colorSwatch.style.background = mark.color && mark.color.bg ? mark.color.bg : "#2dd4bf";
      const favorite = container.querySelector('[data-action="favorite"]');
      favorite.classList.toggle("active", Boolean(mark.is_favorite));
    } catch (error) {
      console.warn("Web Annotator: failed to hydrate toolbar", error);
    }
  }

  async function handleActsClick(event, markId, element) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const action = button.dataset.action;
    if (action === "color") {
      await showColorPicker(markId, button);
      return;
    }
    if (action === "style") {
      await showStylePicker(markId, button);
      return;
    }
    if (action === "favorite") {
      await toggleFavorite(markId, button);
      return;
    }
    if (action === "locate") {
      await WAUtils.sendMessage({ type: "OPEN_SIDE_PANEL_BG", data: { page: "marks" } });
      return;
    }
    if (action === "note") {
      removeActsNode();
      showNoteDetailsCard(markId, element);
      return;
    }
    if (action === "tag") {
      await toggleTagOnMark(markId, button.dataset.tagId, button.dataset.tagName, button);
      return;
    }
    if (action === "delete") {
      await deleteHighlightById(markId);
    }
  }

  async function deleteHighlightById(markId) {
    await WAUtils.sendMessage({ type: "DELETE_MARK_BG", data: { markId } });
    removeHighlight(markId);
    if (lastClickedMarkId === markId) lastClickedMarkId = null;
    if (lastCreatedMarkId === markId) lastCreatedMarkId = null;
    if (currentDetailsMarkId === markId) hideNoteDetailsCard();
    removeActsNode();
    showToast("已删除高亮");
  }

  async function showStylePicker(markId, anchor) {
    removeStylePicker();
    const mark = await WAUtils.sendMessage({ type: "GET_MARK_BY_ID_BG", data: { markId } });
    if (!mark) return;
    const picker = document.createElement("div");
    picker.id = STYLE_PICKER_ID;
    const styles = [
      { id: "background", label: "高亮" },
      { id: "underline", label: "下划线" },
      { id: "underline-wavy", label: "波浪线" },
      { id: "line-through", label: "删除线" }
    ];
    const currentStyle = mark.color && mark.color.style ? mark.color.style : "background";
    picker.innerHTML = styles.map(style => (`<button type="button" class="${style.id === currentStyle ? "active" : ""}" data-style="${style.id}">${style.label}</button>`)).join("");
    picker.addEventListener("click", async event => {
      const button = event.target.closest("button[data-style]");
      if (!button) return;
      event.stopPropagation();
      const nextColor = { ...(mark.color || WAUtils.DEFAULT_COLORS[0]), style: button.dataset.style };
      await WAUtils.sendMessage({ type: "UPDATE_MARK_COLOR_BG", data: { markId, color: nextColor } });
      updateHighlightColor(markId, nextColor);
      removeStylePicker();
    });
    document.body.appendChild(picker);
    const rect = anchor.getBoundingClientRect();
    const position = calculatePosition(rect.left, rect.bottom + 8, 220, 40);
    picker.style.left = `${position.left}px`;
    picker.style.top = `${position.top}px`;
  }

  const COLOR_PICKER_ID = "web-annotator-color-picker";

  async function showColorPicker(markId, anchor) {
    removeColorPicker();
    const mark = await WAUtils.sendMessage({ type: "GET_MARK_BY_ID_BG", data: { markId } });
    if (!mark) return;
    const picker = document.createElement("div");
    picker.id = COLOR_PICKER_ID;
    const colors = colorSettings.colors;
    const currentColorId = mark.color && mark.color.id ? mark.color.id : colors[0].id;
    picker.innerHTML = `
      <div class="wa-color-picker-grid">
        ${colors.map(color => `
          <button type="button" class="wa-color-btn ${color.id === currentColorId ? "active" : ""}"
                  data-color-id="${color.id}"
                  title="${color.name}"
                  style="background-color: ${color.bg};">
          </button>
        `).join("")}
      </div>
    `;
    picker.addEventListener("click", async event => {
      const button = event.target.closest("button[data-color-id]");
      if (!button) return;
      event.stopPropagation();
      const selectedColor = colors.find(c => c.id === button.dataset.colorId);
      if (!selectedColor) return;
      const nextColor = { ...selectedColor, style: mark.color && mark.color.style ? mark.color.style : "background" };
      await WAUtils.sendMessage({ type: "UPDATE_MARK_COLOR_BG", data: { markId, color: nextColor } });
      updateHighlightColor(markId, nextColor);
      removeColorPicker();
      showToast("颜色已更新");
    });
    document.body.appendChild(picker);
    const rect = anchor.getBoundingClientRect();
    const pickerWidth = Math.min(colors.length * 36 + 16, 260);
    const pickerHeight = Math.ceil(colors.length / 6) * 36 + 16;
    const position = calculatePosition(rect.left, rect.bottom + 8, pickerWidth, pickerHeight);
    picker.style.left = `${position.left}px`;
    picker.style.top = `${position.top}px`;
  }

  function removeColorPicker() {
    const existing = document.getElementById(COLOR_PICKER_ID);
    if (existing) existing.remove();
  }

  async function toggleFavorite(markId, button) {
    const mark = await WAUtils.sendMessage({ type: "GET_MARK_BY_ID_BG", data: { markId } });
    if (!mark) return;
    const isFavorite = !mark.is_favorite;
    await WAUtils.sendMessage({ type: "UPDATE_MARK_FAVORITE_BG", data: { markId, isFavorite } });
    button.classList.toggle("active", isFavorite);
    const svg = button.querySelector("svg");
    if (svg) {
      const mc = mark.color && mark.color.bg ? mark.color.bg : "#e11d48";
      svg.style.fill = isFavorite ? mc : "none";
      svg.style.stroke = isFavorite ? mc : "";
    }
  }

  function removeHighlight(markId) {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}[data-mark-id="${CSS.escape(markId)}"]`).forEach(span => span.replaceWith(document.createTextNode(span.textContent)));
    document.body.normalize();
  }

  function updateHighlightColor(markId, color) {
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}[data-mark-id="${CSS.escape(markId)}"]`).forEach(span => applyHighlightStyle(span, color));
  }

  function removeActsNode() {
    const existing = document.getElementById(ACTS_ID);
    if (existing) existing.remove();
  }

  function removeStylePicker() {
    const existing = document.getElementById(STYLE_PICKER_ID);
    if (existing) existing.remove();
  }

  function getClickedHighlightTop(element, clientY) {
    const rects = Array.from(element.getClientRects());
    const rect = rects.find(item => clientY >= item.top && clientY <= item.bottom) || element.getBoundingClientRect();
    return rect.top;
  }

  function calculateActsPosition(x, y, width, height) {
    const padding = 10;
    const offset = 12;
    let left = x - width / 2;
    let top = y - height - offset;
    if (top < padding) top = y + offset;
    if (top + height > window.innerHeight - padding) top = window.innerHeight - height - padding;
    if (left < padding) left = padding;
    if (left + width > window.innerWidth - padding) left = window.innerWidth - width - padding;
    return { left, top };
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[char]));
  }

  function showToast(message, durationMs = 1800) {
    const toast = document.getElementById(TOAST_ID);
    toast.textContent = message;
    toast.style.display = "block";
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { toast.style.display = "none"; }, durationMs);
  }

  function safeRuntimeSend(message) {
    const runtime = getRuntime();
    const send = runtime && runtime.sendMessage;
    if (typeof send !== "function") return;
    try {
      send.call(runtime, message, () => void (runtime && runtime.lastError));
    } catch (error) {
      console.warn("Web Annotator: runtime unavailable", error);
    }
  }

  function getRuntime() {
    const chromeApi = globalThis && globalThis.chrome;
    return chromeApi && chromeApi.runtime ? chromeApi.runtime : null;
  }
})();
