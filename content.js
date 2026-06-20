(function initContent() {
  const HIGHLIGHT_CLASS = "web-annotator-highlight-text";
  const TOOLBAR_ID = "web-annotator-toolbar";
  const TOAST_ID = "web-annotator-toast";
  const RAIL_ID = "web-annotator-rail";
  const ACTS_ID = "web-annotator-acts-node";
  const STYLE_PICKER_ID = "web-annotator-style-picker";
  const DETAILS_ID = "web-annotator-note-details";
  let colorSettings = WAUtils.getDefaultColorSettings();
  let shortcuts = { addHighlight: "Alt+S", openPanel: "Alt+W", jumpToNote: "Alt+N" };
  let uiPrefs = { cardStyle: "a" };
  let restoring = false;
  let currentDetailsMarkId = null;
  let quickAction = null;
  let mousePosition = { x: 0, y: 0 };
  let railDrag = null;

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
        chrome.storage.local.get("uiPrefs", data => resolve(data.uiPrefs || { cardStyle: "a" }));
      });
      uiPrefs = saved;
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
        }
        return true;
      case "THEME_UPDATED_CS":
        if (message.darkMode !== undefined) {
          document.documentElement.classList.toggle("dark-theme", message.darkMode);
        }
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
    const pressed = formatShortcut(event);
    if (!pressed) return;

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
    console.log("jumpToLastHighlight: currentDetailsMarkId =", currentDetailsMarkId);
    if (currentDetailsMarkId) {
      console.log("保存并关闭卡片");
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

    const viewportHeight = window.innerHeight;
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + viewportHeight;

    // 找到视口中最后一个可见的高亮元素
    let lastVisibleHighlight = null;
    highlights.forEach(highlight => {
      const rect = highlight.getBoundingClientRect();
      const elementTop = rect.top + window.scrollY;
      const elementBottom = rect.bottom + window.scrollY;

      // 检查元素是否在视口中
      if (elementTop < viewportBottom && elementBottom > viewportTop) {
        lastVisibleHighlight = highlight;
      }
    });

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
          showActsNode(markId, rect.left + rect.width / 2, rect.top, lastVisibleHighlight);
          showNoteDetailsCard(markId, lastVisibleHighlight);
        }
      }, 300);

      showToast("已跳转到上一个高亮");
    }
  }

  async function saveCurrentNoteDetails() {
    const card = document.getElementById(DETAILS_ID);
    console.log("saveCurrentNoteDetails: card =", card, "currentDetailsMarkId =", currentDetailsMarkId);
    if (!card || !currentDetailsMarkId) return;

    const descInput = card.querySelector('.wa-details-description');
    console.log("saveCurrentNoteDetails: descInput =", descInput);
    if (descInput) {
      console.log("saveCurrentNoteDetails: value =", descInput.value);
      await saveDetailsDescription(descInput.value);
    }
  }

  function formatShortcut(event) {
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
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
      .quick-action-wrapper { position: fixed; pointer-events: none; opacity: 0; transition: opacity .15s ease; }
      .quick-action-wrapper.visible { opacity: 1; pointer-events: auto; }
      .quick-action-ring { width: 38px; height: 38px; border-radius: 50%; border: 1.5px solid rgba(254,240,138,0.3); display: flex; align-items: center; justify-content: center; }
      .quick-action-icon { width: 26px; height: 26px; border-radius: 50%; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.12), 0 0 0 2px rgba(255,255,255,.9); cursor: pointer; transition: transform .15s ease, box-shadow .15s ease; display: flex; align-items: center; justify-content: center; }
      .quick-action-icon svg { width: 12px; height: 12px; stroke: #555; stroke-width: 2.5; fill: none; stroke-linecap: round; }
      .quick-action-wrapper:hover .quick-action-icon { transform: scale(1.12); box-shadow: 0 4px 14px rgba(0,0,0,.18), 0 0 0 2px rgba(255,255,255,.9); }
    `;
    const wrapper = document.createElement("div");
    wrapper.className = "quick-action-wrapper";
    const ring = document.createElement("div");
    ring.className = "quick-action-ring";
    const icon = document.createElement("div");
    icon.className = "quick-action-icon";
    icon.innerHTML = '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
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
    quickAction.icon.style.background = bg;
    if (quickAction.ring) quickAction.ring.style.borderColor = bg.replace(")", ",0.3)").replace("rgb", "rgba");
    const svgEl = quickAction.icon.querySelector("svg");
    if (svgEl) svgEl.style.stroke = "#555";
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
    selection.removeAllRanges();
    hideQuickAction();
    showToast("已添加高亮");
    return mark;
  }

  function getSelectionInfo(range) {
    const root = document.body;
    return [{
      type: "TextQuoteSelector",
      exact: range.toString(),
      prefix: collectContextBefore(range, 40),
      suffix: collectContextAfter(range, 40),
      extra: {
        firstCssParent: getCssSelector(range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement),
        startPath: getNodePath(range.startContainer, root),
        endPath: getNodePath(range.endContainer, root),
        startOffset: range.startOffset,
        endOffset: range.endOffset
      }
    }];
  }

  async function restoreHighlights(showSummary = true) {
    if (restoring) return false;
    restoring = true;
    let restored = 0;
    let failed = 0;
    try {
      unwrapHighlights();
      const url = WAUtils.normalizeUrl(location.href);
      const marks = await WAUtils.sendMessage({ type: "GET_MARKS_BY_URL_BG", data: { url, exact: true } });
      const currentPageMarks = marks || [];
      for (const mark of currentPageMarks.sort((a, b) => a.created_at - b.created_at)) {
        try {
          const didRender = renderHighlight(mark);
          if (didRender) restored++;
          else failed++;
        } catch (error) {
          failed++;
          console.warn("Web Annotator: restore failed", mark.id, error);
        }
      }
      if (showSummary && currentPageMarks.length) {
        showToast(`当前页笔记 ${currentPageMarks.length} 条：${restored} 条恢复，${failed} 条未定位`, 2800);
      }
      return true;
    } finally {
      restoring = false;
    }
  }

  function renderHighlight(mark) {
    let selectors;
    try {
      selectors = JSON.parse(mark.select_info || "[]");
    } catch (error) {
      selectors = [];
    }
    let rendered = false;
    selectors.filter(selector => selector.type === "TextQuoteSelector").forEach(selector => {
      const range = rangeFromSelector(selector) || rangeFromQuote(selector);
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

  function rangeFromQuote(selector) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: node => shouldExcludeNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const nodes = [];
    let text = "";
    let node;
    while ((node = walker.nextNode())) {
      nodes.push({ node, start: text.length, end: text.length + node.textContent.length });
      text += node.textContent;
    }
    const index = findQuoteIndex(text, selector);
    if (index < 0) return null;
    const endIndex = index + selector.exact.length;
    const startNode = nodes.find(item => item.start <= index && item.end >= index);
    const endNode = nodes.find(item => item.start <= endIndex && item.end >= endIndex);
    if (!startNode || !endNode) return null;
    const range = document.createRange();
    range.setStart(startNode.node, index - startNode.start);
    range.setEnd(endNode.node, endIndex - endNode.start);
    return range;
  }

  function findQuoteIndex(text, selector) {
    const exact = selector.exact || "";
    if (!exact) return -1;
    const matches = [];
    let index = text.indexOf(exact);
    while (index >= 0) {
      matches.push(index);
      index = text.indexOf(exact, index + exact.length);
    }
    if (matches.length <= 1) return matches[0] ?? -1;
    return matches.find(match => {
      const prefix = selector.prefix || "";
      const suffix = selector.suffix || "";
      return (!prefix || text.slice(Math.max(0, match - prefix.length), match).endsWith(prefix)) &&
        (!suffix || text.slice(match + exact.length, match + exact.length + suffix.length).startsWith(suffix));
    }) ?? matches[0];
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
    applyHighlightStyle(span, mark.color || WAUtils.DEFAULT_COLORS[0]);
    fragment.appendChild(span);
    if (end < text.length) fragment.appendChild(document.createTextNode(text.slice(end)));
    node.parentNode.replaceChild(fragment, node);
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
      element.style.setProperty("color", color.text || WAUtils.getTextColor(color.bg), "important");
      return;
    }
    element.style.setProperty("text-decoration", style === "underline-wavy" ? "underline wavy" : style, "important");
    element.style.setProperty("text-decoration-color", color.bg, "important");
    element.style.setProperty("text-decoration-thickness", "2px", "important");
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
    document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(span => span.replaceWith(document.createTextNode(span.textContent)));
    document.body.normalize();
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
      card.dataset.position = window.innerHeight - rect.bottom < 400 ? "top" : "bottom";
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
    showToast("备注已保存");
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
      "<div class=\"wa-rail-divider\"></div>",
      "<button type=\"button\" data-action=\"style\" title=\"高亮标注\"><svg viewBox=\"0 0 24 24\"><path d=\"M12 20h9\"/><path d=\"M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z\"/></svg></button>",
      "<button type=\"button\" data-action=\"sync\" title=\"同步当前页高亮\"><svg viewBox=\"0 0 24 24\"><path d=\"M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/><path d=\"M3 3v5h5\"/><path d=\"M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16\"/><path d=\"M16 16h5v5\"/></svg></button>"
    ].join("");
    rail.style.top = `${Number(localStorage.getItem("web-annotator-rail-y")) || Math.round(window.innerHeight * 0.42)}px`;
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
      const page = button.dataset.action === "style" ? "style" : "marks";
      try {
        await WAUtils.sendMessage({ type: "OPEN_SIDE_PANEL_BG", data: { page } });
      } catch (error) {
        showToast("请重新加载页面后再打开侧栏");
      }
    });
    document.documentElement.appendChild(rail);
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
    if (rail) localStorage.setItem("web-annotator-rail-y", String(Math.round(rail.getBoundingClientRect().top)));
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
      "<button type=\"button\" data-action=\"color\" title=\"更换颜色\"><svg viewBox=\"0 0 24 24\"><path d=\"M12 20h9\"/><path d=\"M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z\"/></svg></button>",
      "<div class=\"wa-acts-sep\"></div>",
      "<button type=\"button\" data-action=\"style\" title=\"修改样式\"><svg viewBox=\"0 0 24 24\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M8 12h8\"/><path d=\"M12 8v8\"/></svg></button>",
      "<div class=\"wa-acts-sep\"></div>",
      "<button type=\"button\" data-action=\"favorite\" title=\"收藏\"><svg viewBox=\"0 0 24 24\"><path d=\"M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z\"/></svg></button>",
      "<button type=\"button\" data-action=\"copy\" title=\"复制文本\"><svg viewBox=\"0 0 24 24\"><rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\"/><path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\"/></svg></button>",
      "<div class=\"wa-acts-sep\"></div>",
      "<button type=\"button\" data-action=\"delete\" title=\"删除\"><svg viewBox=\"0 0 24 24\"><polyline points=\"3 6 5 6 21 6\"/><path d=\"M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6\"/><path d=\"M10 11v6\"/><path d=\"M14 11v6\"/><path d=\"M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2\"/></svg></button>"
    ].join("");
    container.addEventListener("click", event => handleActsClick(event, markId, element));
    document.body.appendChild(container);
    hydrateActsNode(container, markId);
    requestAnimationFrame(() => {
      const rect = container.getBoundingClientRect();
      const position = calculateActsPosition(x, y, rect.width, rect.height);
      container.style.left = `${position.left}px`;
      container.style.top = `${position.top}px`;
      container.style.opacity = "1";
    });
  }

  async function hydrateActsNode(container, markId) {
    try {
      const mark = await WAUtils.sendMessage({ type: "GET_MARK_BY_ID_BG", data: { markId } });
      if (!mark) return;
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
    if (action === "copy") {
      const mark = await WAUtils.sendMessage({ type: "GET_MARK_BY_ID_BG", data: { markId } });
      if (mark && mark.text) await navigator.clipboard.writeText(mark.text);
      showToast("已复制");
      removeActsNode();
      return;
    }
    if (action === "note") {
      removeActsNode();
      showNoteDetailsCard(markId, element);
      return;
    }
    if (action === "delete") {
      await WAUtils.sendMessage({ type: "DELETE_MARK_BG", data: { markId } });
      removeHighlight(markId);
      removeActsNode();
      showToast("已删除高亮");
    }
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
