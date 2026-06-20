(function initSidePanel() {
  const state = {
    marks: [],
    tags: [],
    markTags: new Map(),
    activeTagId: "all",
    currentPage: "marks",
    currentTab: null,
    colorSettings: WAUtils.getDefaultColorSettings(),
    stats: { marks: 0, tags: 0, colors: 0 },
    deleteColorMode: false,
    deleteTagMode: false,
    shortcuts: { addHighlight: "Alt+S", openPanel: "Alt+W", jumpToNote: "Alt+N" },
    uiPrefs: { cardStyle: "a" },
    sites: []
  };
  const els = {};

  document.addEventListener("DOMContentLoaded", bootstrap);

  async function bootstrap() {
    Object.assign(els, {
      currentPageLabel: document.getElementById("current-page"),
      markCountWrap: document.getElementById("mark-count"),
      navSeg: document.getElementById("nav-seg"),
      pages: document.querySelectorAll(".sp-page"),
      search: document.getElementById("search"),
      tagFilters: document.getElementById("tag-filters"),
      marks: document.getElementById("marks"),
      template: document.getElementById("mark-template"),
      colorGrid: document.getElementById("color-grid"),
      styleOptions: document.getElementById("style-options"),
      pickColor: document.getElementById("pick-color"),
      toggleDeleteColors: document.getElementById("toggle-delete-colors"),
      tagName: document.getElementById("tag-name"),
      createTag: document.getElementById("create-tag"),
      toggleDeleteTags: document.getElementById("toggle-delete-tags"),
      tagLibrary: document.getElementById("tag-library"),
      statsMarks: document.getElementById("stats-marks"),
      statsTags: document.getElementById("stats-tags"),
      statsColors: document.getElementById("stats-colors"),
      shortcutHighlight: document.getElementById("shortcut-highlight"),
      shortcutPanel: document.getElementById("shortcut-panel"),
      shortcutNote: document.getElementById("shortcut-note"),
      exportButton: document.getElementById("export"),
      importInput: document.getElementById("import"),
      cardStyleOptions: document.getElementById("card-style-options"),
      siteList: document.getElementById("site-list")
    });
    bindEvents();
    await loadUiPrefs();
    await loadData();
    await loadSites();
  }

  /* ====== UI Preferences ====== */

  async function loadUiPrefs() {
    try {
      const result = await new Promise(resolve => {
        chrome.storage.local.get("uiPrefs", data => resolve(data.uiPrefs || { cardStyle: "a" }));
      });
      state.uiPrefs = result;
    } catch (e) {
      state.uiPrefs = { cardStyle: "a" };
    }
    applyCardStyle(state.uiPrefs.cardStyle);
    renderCardStyleOptions();
  }

  async function saveUiPrefs() {
    await WAUtils.sendMessage({ type: "SAVE_UI_PREFS_BG", data: { uiPrefs: state.uiPrefs } });
  }

  function applyCardStyle(style) {
    document.body.classList.remove("card-a", "card-b");
    document.body.classList.add("card-" + style);
  }

  function setCardStyle(style) {
    state.uiPrefs.cardStyle = style;
    applyCardStyle(style);
    renderCardStyleOptions();
    saveUiPrefs();
  }

  function renderCardStyleOptions() {
    if (!els.cardStyleOptions) return;
    els.cardStyleOptions.querySelectorAll(".card-style-opt").forEach(opt => {
      opt.classList.toggle("active", opt.dataset.cardStyle === state.uiPrefs.cardStyle);
    });
  }

  /* ====== Events ====== */

  function bindEvents() {
    // Segmented nav
    els.navSeg.addEventListener("click", event => {
      const button = event.target.closest("button[data-page]");
      if (!button) return;
      state.currentPage = button.dataset.page;
      renderPages();
    });

    // Search
    els.search.addEventListener("input", debounce(renderMarks, 120));

    // Tag filters
    els.tagFilters.addEventListener("click", event => {
      const button = event.target.closest("button[data-tag-id]");
      if (!button) return;
      state.activeTagId = button.dataset.tagId;
      renderMarks();
    });

    // Style options
    els.styleOptions.addEventListener("click", event => {
      const button = event.target.closest("button[data-style]");
      if (!button) return;
      state.colorSettings.defaultStyle = button.dataset.style;
      renderStylePage();
      saveColorSettings();
    });

    // Color grid — 点击色块设为默认颜色，删除模式下删除，+ 添加新颜色
    els.colorGrid.addEventListener("click", event => {
      const deleteButton = event.target.closest("[data-delete-color-id]");
      if (deleteButton) {
        event.stopPropagation();
        deleteColor(deleteButton.dataset.deleteColorId);
        return;
      }
      const addBtn = event.target.closest(".add-color-btn");
      if (addBtn) {
        showColorPickerPopup(addBtn, "add");
        return;
      }
      const button = event.target.closest("button[data-color-id]");
      if (!button) return;
      state.colorSettings.defaultColorId = button.dataset.colorId;
      renderStylePage();
      saveColorSettings();
    });

    // 颜色选取按钮 → 取色替换当前默认颜色
    els.pickColor.addEventListener("click", () => {
      showColorPickerPopup(els.pickColor, "replace");
    });

    // 点击选色器外部关闭
    document.addEventListener("click", event => {
      const popup = document.getElementById("sp-color-picker");
      if (popup && !popup.contains(event.target) && !event.target.closest("#pick-color") && !event.target.closest(".add-color-btn")) {
        popup.remove();
      }
    });

    // 删除颜色模式切换
    els.toggleDeleteColors.addEventListener("click", () => {
      state.deleteColorMode = !state.deleteColorMode;
      renderStylePage();
    });

    // Tags
    els.createTag.addEventListener("click", createTag);
    els.toggleDeleteTags.addEventListener("click", () => {
      state.deleteTagMode = !state.deleteTagMode;
      renderStylePage();
    });
    els.tagLibrary.addEventListener("click", event => {
      const deleteButton = event.target.closest("[data-delete-tag-id]");
      if (!deleteButton) return;
      deleteTag(deleteButton.dataset.deleteTagId);
    });
    els.tagName.addEventListener("keydown", event => {
      if (event.key === "Enter") createTag();
    });

    // Import / export
    els.exportButton.addEventListener("click", exportData);
    els.importInput.addEventListener("change", importData);

    // Shortcuts
    bindShortcutInput(els.shortcutHighlight, "addHighlight");
    bindShortcutInput(els.shortcutPanel, "openPanel");
    bindShortcutInput(els.shortcutNote, "jumpToNote");

    // Collapsible headers
    document.querySelectorAll(".collapse-header").forEach(header => {
      header.addEventListener("click", () => {
        header.classList.toggle("open");
        const body = header.nextElementSibling;
        if (body) body.classList.toggle("open");
      });
    });

    // Card style switcher
    els.cardStyleOptions.addEventListener("click", event => {
      const opt = event.target.closest("[data-card-style]");
      if (!opt) return;
      setCardStyle(opt.dataset.cardStyle);
    });

    // Theme toggle
    const darkModeToggle = document.getElementById("dark-mode-toggle");
    if (darkModeToggle) {
      // Load saved theme preference
      chrome.storage.local.get("darkMode", data => {
        if (data.darkMode) {
          darkModeToggle.checked = true;
          document.body.classList.add("dark-theme");
        }
      });

      darkModeToggle.addEventListener("change", () => {
        const isDark = darkModeToggle.checked;
        document.body.classList.toggle("dark-theme", isDark);
        chrome.storage.local.set({ darkMode: isDark });
        // 同步到 content script
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { type: "THEME_UPDATED_CS", darkMode: isDark }).catch(() => {});
          }
        });
      });
    }

    // Font options
    const fontOptions = document.getElementById("font-options");
    if (fontOptions) {
      // Load saved font preference
      chrome.storage.local.get("fontFamily", data => {
        const savedFont = data.fontFamily || "default";
        document.body.classList.add("font-" + savedFont);
        fontOptions.querySelectorAll(".font-opt").forEach(opt => {
          opt.classList.toggle("active", opt.dataset.font === savedFont);
        });
      });

      fontOptions.addEventListener("click", event => {
        const opt = event.target.closest("[data-font]");
        if (!opt) return;
        const font = opt.dataset.font;
        // Remove all font classes
        document.body.classList.remove("font-default", "font-serif");
        // Add selected font class
        document.body.classList.add("font-" + font);
        // Update active state
        fontOptions.querySelectorAll(".font-opt").forEach(o => o.classList.remove("active"));
        opt.classList.add("active");
        // Save preference
        chrome.storage.local.set({ fontFamily: font });
      });
    }

    // Runtime messages
    chrome.runtime.onMessage.addListener(message => {
      if (message.type === "DATA_UPDATED_FR" || message.type === "MARKS_UPDATED_FR") loadData();
      if (message.type === "SWITCH_PAGE_FR" && message.page) {
        state.currentPage = message.page;
        renderPages();
      }
    });

    // 文本展开/收起：点击多行文本展开，点击其他地方自动收起
    els.marks.addEventListener("click", event => {
      const expandable = event.target.closest(".mark-text:not(.single-line), .mark-description:not(.single-line)");
      if (expandable) {
        expandable.classList.toggle("expanded");
        return;
      }
      // 点击非展开元素时，收起所有已展开的文本
      els.marks.querySelectorAll(".mark-text.expanded, .mark-description.expanded")
        .forEach(el => el.classList.remove("expanded"));
    });
  }

  /* ====== Data Loading ====== */

  async function loadData() {
    const [tab, marks, tags, colorSettings, stats, shortcuts] = await Promise.all([
      WAUtils.sendMessage({ type: "GET_CURRENT_TAB_BG" }).catch(() => null),
      WAUtils.sendMessage({ type: "GET_ALL_MARKS_BG" }),
      WAUtils.sendMessage({ type: "GET_TAGS_WITH_COUNT_BG" }),
      WAUtils.sendMessage({ type: "GET_COLOR_SETTINGS_BG" }),
      WAUtils.sendMessage({ type: "GET_STATS_BG" }),
      WAUtils.sendMessage({ type: "GET_SHORTCUTS_BG" })
    ]);
    state.currentTab = tab;
    state.marks = (marks || []).sort((a, b) => b.created_at - a.created_at);
    state.tags = tags || [];
    state.colorSettings = colorSettings || WAUtils.getDefaultColorSettings();
    state.stats = stats || state.stats;
    state.shortcuts = shortcuts || state.shortcuts;
    if (state.activeTagId !== "all" && !state.tags.some(tag => tag.id === state.activeTagId)) state.activeTagId = "all";
    await loadAllMarkTags();
    els.currentPageLabel.textContent = tab && tab.url ? getHost(tab.url) : "All annotations";
    renderAll();
  }

  async function loadAllMarkTags() {
    const entries = await Promise.all(state.marks.map(async mark => [
      mark.id,
      await WAUtils.sendMessage({ type: "GET_TAGS_FOR_MARK_BG", data: { markId: mark.id } })
    ]));
    state.markTags = new Map(entries);
  }

  /* ====== Sites ====== */

  async function loadSites() {
    try {
      const saved = await new Promise(resolve => {
        chrome.storage.local.get("sites", data => resolve(data.sites || []));
      });
      state.sites = saved;
      renderSites();
    } catch (e) {
      state.sites = [];
    }
  }

  async function saveSites() {
    await chrome.storage.local.set({ sites: state.sites });
  }

  function renderSites() {
    if (!els.siteList) return;

    console.log("renderSites: state.marks.length =", state.marks.length);
    console.log("renderSites: sample marks =", state.marks.slice(0, 3).map(m => ({ page_url: m.page_url, url: m.url })));

    // 统计每个网站的标注数量
    const siteCounts = {};
    state.marks.forEach(mark => {
      const targetUrl = mark.page_url || mark.full_url || mark.url;
      if (targetUrl) {
        const host = getHost(targetUrl);
        console.log("renderSites: targetUrl =", targetUrl, "host =", host);
        siteCounts[host] = (siteCounts[host] || 0) + 1;
      }
    });

    console.log("renderSites: siteCounts =", siteCounts);

    // 收集所有有标注的网站
    const allSites = new Set(Object.keys(siteCounts));
    state.sites.forEach(site => allSites.add(site.url));

    const sitesArray = Array.from(allSites).map(url => {
      const savedSite = state.sites.find(s => s.url === url);
      return {
        url: url,
        name: savedSite ? savedSite.name : url,
        description: savedSite ? savedSite.description : "",
        icon: savedSite ? savedSite.icon : "",
        count: siteCounts[url] || 0
      };
    });

    // 按标注数量排序
    sitesArray.sort((a, b) => b.count - a.count);

    if (sitesArray.length === 0) {
      els.siteList.innerHTML = `
        <div class="site-empty">
          <div class="site-empty-icon">🌐</div>
          <div>暂无网站分类</div>
          <div>标注网页后会自动出现</div>
        </div>
      `;
      return;
    }

    els.siteList.innerHTML = sitesArray.map(site => `
      <div class="site-item" data-site="${escapeHtml(site.url)}">
        <div class="site-item-icon">
          ${site.icon ? `<img src="${escapeHtml(site.icon)}" alt="">` : '🌐'}
        </div>
        <div class="site-item-info">
          <div class="site-item-name">${escapeHtml(site.name)}</div>
          ${site.description ? `<div class="site-item-desc">${escapeHtml(site.description)}</div>` : ''}
        </div>
        <div class="site-item-count">${site.count}</div>
        <div class="site-item-actions">
          <button type="button" class="site-item-btn" data-action="edit" title="编辑">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button type="button" class="site-item-btn" data-action="filter" title="筛选">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          </button>
        </div>
      </div>
    `).join("");

    // 绑定事件
    els.siteList.querySelectorAll(".site-item").forEach(item => {
      item.addEventListener("click", event => {
        const btn = event.target.closest(".site-item-btn");
        if (btn) {
          event.stopPropagation();
          const action = btn.dataset.action;
          const siteUrl = item.dataset.site;
          if (action === "filter") {
            filterBySite(siteUrl);
          } else if (action === "edit") {
            editSite(siteUrl);
          }
          return;
        }
        // 点击整个项目也跳转筛选
        filterBySite(item.dataset.site);
      });
    });
  }

  function filterBySite(siteUrl) {
    state.activeSiteFilter = siteUrl;
    els.siteFilterName.textContent = siteUrl;
    els.siteFilterBar.style.display = "flex";
    state.currentPage = "marks";
    renderPages();
    renderMarks();
  }

  async function editSite(siteUrl) {
    const site = state.sites.find(s => s.url === siteUrl);
    const currentName = site ? site.name : siteUrl;
    const currentDesc = site ? site.description : "";

    const newName = prompt("网站名称", currentName);
    if (newName === null) return;

    const newDesc = prompt("网站备注", currentDesc);
    if (newDesc === null) return;

    const existingIndex = state.sites.findIndex(s => s.url === siteUrl);
    const siteData = {
      url: siteUrl,
      name: newName || siteUrl,
      description: newDesc || "",
      icon: site ? site.icon : ""
    };

    if (existingIndex >= 0) {
      state.sites[existingIndex] = siteData;
    } else {
      state.sites.push(siteData);
    }

    await saveSites();
    renderSites();
    showToast("网站信息已保存");
  }

  function renderAll() {
    renderPages();
    renderMarks();
    renderStylePage();
    renderSettingsPage();
    renderSites();
  }

  /* ====== Page Navigation ====== */

  function renderPages() {
    const pageIndex = { marks: 0, style: 1, settings: 2 };
    const idx = pageIndex[state.currentPage] || 0;

    // Update slider
    const slider = els.navSeg.querySelector(".seg-slider");
    if (slider) slider.dataset.pos = String(idx);

    // Update buttons
    els.navSeg.querySelectorAll("button[data-page]").forEach(button => {
      button.classList.toggle("active", button.dataset.page === state.currentPage);
    });

    // Show/hide pages
    els.pages.forEach(page => page.classList.toggle("active", page.id === "page-" + state.currentPage));
  }

  /* ====== Marks Page ====== */

  function renderMarks() {
    const keyword = els.search.value.trim().toLowerCase();
    let marks = state.marks;
    if (keyword) {
      marks = marks.filter(mark => [mark.text, mark.description, mark.page_title, mark.url]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(keyword));
    }
    if (state.activeTagId !== "all") {
      marks = marks.filter(mark => (state.markTags.get(mark.id) || []).some(tag => tag.id === state.activeTagId));
    }

    // Count
    els.markCountWrap.innerHTML = "<b>" + marks.length + "</b> " + (marks.length === 1 ? "mark" : "marks");

    renderTagFilters();

    els.marks.innerHTML = "";
    if (!marks.length) {
      els.marks.innerHTML = "<div class=\"empty\">还没有标注。选中文字后点击浮动工具栏或右键添加。</div>";
      return;
    }
    marks.forEach(mark => els.marks.appendChild(renderMark(mark)));
  }

  function renderTagFilters() {
    const buttons = ["<button class=\"tag-filter " + (state.activeTagId === "all" ? "active" : "") + "\" type=\"button\" data-tag-id=\"all\">全部 " + state.marks.length + "</button>"];
    buttons.push(...state.tags.map(tag =>
      "<button class=\"tag-filter " + (state.activeTagId === tag.id ? "active" : "") + "\" type=\"button\" data-tag-id=\"" + tag.id + "\">" + escapeHtml(tag.name) + " " + tag.count + "</button>"
    ));
    els.tagFilters.innerHTML = buttons.join("");
  }

  function renderMark(mark) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const color = mark.color || {};
    node.style.setProperty("--mark-color", color.bg || "#2dd4bf");

    // Color dot
    const colorDot = node.querySelector(".mark-color");
    if (colorDot) colorDot.style.background = color.bg || "#2dd4bf";

    // Type
    node.querySelector(".mark-type").textContent = getTypeLabel(mark.type);

    // Text
    const markText = node.querySelector(".mark-text");
    markText.classList.toggle("single-line", isSingleLineText(mark.text || ""));
    markText.textContent = mark.text || "(页面标记)";

    // Meta → 合并到顶行（地址 + 时间）
    const topline = node.querySelector(".mark-topline");
    const targetUrl = mark.page_url || mark.full_url || mark.url;
    const urlBtn = document.createElement("button");
    urlBtn.className = "mark-url";
    urlBtn.type = "button";
    urlBtn.title = targetUrl;
    urlBtn.textContent = getHost(targetUrl);
    urlBtn.addEventListener("click", () => openMarkUrl(targetUrl));
    const timeSpan = document.createElement("span");
    timeSpan.className = "mark-time";
    timeSpan.textContent = "· " + formatTime(mark.created_at);
    // 插入到 favorite 之前
    const favBtn = node.querySelector(".favorite");
    topline.insertBefore(urlBtn, favBtn);
    topline.insertBefore(timeSpan, favBtn);

    // Favorite
    const favorite = node.querySelector(".favorite");
    favorite.textContent = mark.is_favorite ? "♥" : "♡";
    favorite.classList.toggle("active", Boolean(mark.is_favorite));
    favorite.addEventListener("click", () => updateFavorite(mark, !mark.is_favorite));

    // Description
    const description = node.querySelector(".mark-description");
    description.value = mark.description || "";
    description.classList.toggle("single-line", isSingleLineText(mark.description || ""));
    description.addEventListener("blur", () => updateDescription(mark, description.value));

    // Tags
    renderMarkTags(mark.id, node.querySelector(".mark-tags"));

    // Tag picker
    renderMarkTagPicker(mark.id, node.querySelector(".mark-tag-picker"));

    // Delete (双击确认模式)
    const deleteBtn = node.querySelector(".delete");
    deleteBtn.addEventListener("click", () => {
      if (deleteBtn.classList.contains("armed")) {
        deleteMark(mark.id);
      } else {
        deleteBtn.classList.add("armed");
        deleteBtn.textContent = "确认？";
        setTimeout(() => {
          deleteBtn.classList.remove("armed");
          deleteBtn.textContent = "删除";
        }, 2500);
      }
    });

    return node;
  }

  function renderMarkTagPicker(markId, container) {
    const selectedIds = new Set((state.markTags.get(markId) || []).map(tag => tag.id));
    if (!state.tags.length) {
      container.innerHTML = "<span class=\"no-tags\">先在样式页创建标签</span>";
      return;
    }
    // B 方案：选中的标签排在前面
    const sortedTags = [...state.tags].sort((a, b) => {
      const aSelected = selectedIds.has(a.id) ? 0 : 1;
      const bSelected = selectedIds.has(b.id) ? 0 : 1;
      return aSelected - bSelected;
    });
    container.innerHTML = sortedTags.map(tag =>
      "<button class=\"picker-tag " + (selectedIds.has(tag.id) ? "active" : "") + "\" type=\"button\" data-tag-id=\"" + tag.id + "\">" + escapeHtml(tag.name) + "</button>"
    ).join("");
    container.querySelectorAll("button[data-tag-id]").forEach(button => {
      button.addEventListener("click", () => addExistingTagToMark(markId, button.dataset.tagId));
    });
    // 鼠标滚轮纵向滚动 → 平滑横向滚动标签栏
    let _scrollTarget = container.scrollLeft;
    let _scrollAnim = null;
    const _smoothStep = () => {
      const diff = _scrollTarget - container.scrollLeft;
      if (Math.abs(diff) < 0.5) {
        container.scrollLeft = _scrollTarget;
        _scrollAnim = null;
        return;
      }
      container.scrollLeft += diff * 0.15;
      _scrollAnim = requestAnimationFrame(_smoothStep);
    };
    container.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        const maxScroll = container.scrollWidth - container.clientWidth;
        _scrollTarget = Math.max(0, Math.min(maxScroll, _scrollTarget + e.deltaY * 0.3));
        if (!_scrollAnim) _scrollAnim = requestAnimationFrame(_smoothStep);
      }
    }, { passive: false });
  }

  function renderMarkTags(markId, container) {
    const tags = state.markTags.get(markId) || [];
    container.innerHTML = tags.length
      ? tags.map(tag => "<button class=\"mark-tag\" type=\"button\" data-tag-id=\"" + tag.id + "\" title=\"点击筛选，Alt+点击移除\">" + escapeHtml(tag.name) + "</button>").join("")
      : "<span class=\"no-tags\">未添加标签</span>";
    container.querySelectorAll("button[data-tag-id]").forEach(button => {
      button.addEventListener("click", event => {
        if (event.altKey) {
          removeTagFromMark(markId, button.dataset.tagId);
          return;
        }
        state.activeTagId = button.dataset.tagId;
        state.currentPage = "marks";
        renderAll();
      });
    });
  }

  /* ====== Style Page ====== */

  function renderStylePage() {
    els.styleOptions.querySelectorAll("button[data-style]").forEach(button => {
      button.classList.toggle("active", button.dataset.style === (state.colorSettings.defaultStyle || "background"));
    });
    els.toggleDeleteColors.classList.toggle("active", state.deleteColorMode);
    els.toggleDeleteTags.classList.toggle("active", state.deleteTagMode);

    els.colorGrid.innerHTML = state.colorSettings.colors.map(color =>
      "<button class=\"color-swatch " + (state.colorSettings.defaultColorId === color.id ? "active" : "") + " " + (color.id.startsWith("custom-") ? "custom" : "") + "\" type=\"button\" data-color-id=\"" + color.id + "\" title=\"点击设为默认颜色\">"
      + (state.deleteColorMode ? "<span class=\"delete-color\" data-delete-color-id=\"" + color.id + "\" title=\"删除颜色\">×</span>" : "")
      + "<span class=\"color-block\" style=\"background:" + color.bg + "\"></span>"
      + "</button>"
    ).join("")
    + (state.deleteColorMode ? "" : "<button class=\"add-color-btn\" type=\"button\" title=\"添加新颜色\">+</button>");

    els.tagLibrary.innerHTML = state.tags.length
      ? state.tags.map(tag =>
          "<span class=\"library-tag\">" + escapeHtml(tag.name) + " <em>" + tag.count + "</em>"
          + (state.deleteTagMode ? "<button type=\"button\" data-delete-tag-id=\"" + tag.id + "\" title=\"删除标签\">×</button>" : "")
          + "</span>"
        ).join("")
      : "<span class=\"no-tags\">暂无标签</span>";
  }

  /* ====== Settings Page ====== */

  function renderSettingsPage() {
    els.statsMarks.textContent = state.stats.marks;
    els.statsTags.textContent = state.stats.tags;
    els.statsColors.textContent = state.stats.colors;
    els.shortcutHighlight.value = state.shortcuts.addHighlight || "";
    els.shortcutPanel.value = state.shortcuts.openPanel || "";
    els.shortcutNote.value = state.shortcuts.jumpToNote || "";
  }

  /* ====== Actions ====== */

  function bindShortcutInput(input, key) {
    input.addEventListener("keydown", async event => {
      event.preventDefault();
      const shortcut = formatShortcut(event);
      if (!shortcut) return;
      state.shortcuts = { ...state.shortcuts, [key]: shortcut };
      renderSettingsPage();
      await WAUtils.sendMessage({ type: "SAVE_SHORTCUTS_BG", data: { shortcuts: state.shortcuts } });
    });
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

  async function saveColorSettings() {
    await WAUtils.sendMessage({ type: "SAVE_COLOR_SETTINGS_BG", data: { settings: state.colorSettings } });
    await loadData();
  }

  /* ---------- HSV ↔ RGB 颜色工具 ---------- */

  function hsvToRgb(h, s, v) {
    h = h % 360;
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r, g, b;
    if (h < 60)       { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else               { r = c; g = 0; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
  }

  function hexToRgb(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    let h = 0, s = max === 0 ? 0 : d / max, v = max;
    if (d !== 0) {
      if (max === r)      h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else                h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, v];
  }

  function showColorPickerPopup(anchor, mode) {
    let popup = document.getElementById("sp-color-picker");
    if (popup) { popup.remove(); return; }

    // 从当前默认颜色初始化 HSV 状态
    const defaultColor = state.colorSettings.colors.find(c => c.id === state.colorSettings.defaultColorId);
    const currentBg = (defaultColor && defaultColor.bg) || "#2dd4bf";
    const initRgb = hexToRgb(currentBg);
    let hsv = rgbToHsv(initRgb[0], initRgb[1], initRgb[2]);

    popup = document.createElement("div");
    popup.id = "sp-color-picker";
    popup.className = "color-picker-popup";

    popup.innerHTML =
      '<div class="picker-sb">' +
        '<div class="picker-sb-sat"></div>' +
        '<div class="picker-sb-val"></div>' +
        '<div class="picker-sb-marker"></div>' +
      '</div>' +
      '<div class="picker-hue"><div class="picker-hue-marker"></div></div>' +
      '<div class="picker-preview"></div>' +
      '<div class="picker-actions">' +
        '<button type="button" class="picker-confirm" title="确认">✓</button>' +
        '<button type="button" class="picker-cancel" title="取消">✕</button>' +
      '</div>';

    const sbArea    = popup.querySelector(".picker-sb");
    const sbMarker  = popup.querySelector(".picker-sb-marker");
    const hueBar    = popup.querySelector(".picker-hue");
    const hueMarker = popup.querySelector(".picker-hue-marker");
    const preview   = popup.querySelector(".picker-preview");

    /* 根据当前 HSV 刷新所有视觉元素 */
    function updateVisuals() {
      // SB 方块底色 = 当前色相的纯色
      sbArea.style.background = "hsl(" + hsv[0] + ", 100%, 50%)";

      // SB 标记位置：x = saturation, y = 1 - value
      sbMarker.style.left = (hsv[1] * 100) + "%";
      sbMarker.style.top  = ((1 - hsv[2]) * 100) + "%";
      sbMarker.style.background = rgbToHex.apply(null, hsvToRgb(hsv[0], hsv[1], hsv[2]));

      // 色相滑条标记
      hueMarker.style.left = (hsv[0] / 360 * 100) + "%";
      hueMarker.style.background = "hsl(" + hsv[0] + ", 100%, 50%)";

      // 预览色块
      const hex = rgbToHex.apply(null, hsvToRgb(hsv[0], hsv[1], hsv[2]));
      preview.style.background = hex;
    }

    /* 从指针坐标读取 SB 值 */
    function updateSB(clientX, clientY) {
      const rect = sbArea.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const v = Math.max(0, Math.min(1, 1 - (clientY - rect.top) / rect.height));
      hsv[1] = s;
      hsv[2] = v;
      updateVisuals();
    }

    /* 从指针坐标读取色相值 */
    function updateHue(clientX) {
      const rect = hueBar.getBoundingClientRect();
      const h = Math.max(0, Math.min(359, (clientX - rect.left) / rect.width * 360));
      hsv[0] = h;
      updateVisuals();
    }

    /* SB 方块拖拽 */
    sbArea.addEventListener("pointerdown", function(e) {
      e.preventDefault();
      sbArea.setPointerCapture(e.pointerId);
      updateSB(e.clientX, e.clientY);
      function onMove(ev) { updateSB(ev.clientX, ev.clientY); }
      function onUp(ev) {
        sbArea.releasePointerCapture(ev.pointerId);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });

    /* 色相滑条拖拽 */
    hueBar.addEventListener("pointerdown", function(e) {
      e.preventDefault();
      hueBar.setPointerCapture(e.pointerId);
      updateHue(e.clientX);
      function onMove(ev) { updateHue(ev.clientX); }
      function onUp(ev) {
        hueBar.releasePointerCapture(ev.pointerId);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });

    /* 确认 / 取消 */
    popup.addEventListener("click", function(event) {
      event.stopPropagation();

      if (event.target.closest(".picker-confirm")) {
        const rgb = hsvToRgb(hsv[0], hsv[1], hsv[2]);
        const hex = rgbToHex(rgb[0], rgb[1], rgb[2]);

        if (mode === "replace") {
          const color = state.colorSettings.colors.find(c => c.id === state.colorSettings.defaultColorId);
          if (color && color.bg !== hex) {
            color.bg = hex;
            color.text = WAUtils.getTextColor(hex);
          }
        } else if (mode === "add") {
          if (state.colorSettings.colors.length < 18) {
            state.colorSettings.colors.push({
              id: "custom-" + Date.now(),
              name: "Custom",
              bg: hex,
              text: WAUtils.getTextColor(hex)
            });
            state.colorSettings.defaultColorId = state.colorSettings.colors[state.colorSettings.colors.length - 1].id;
          }
        }
        renderStylePage();
        saveColorSettings();
        popup.remove();
        return;
      }

      if (event.target.closest(".picker-cancel")) {
        popup.remove();
        return;
      }
    });

    /* 阻止弹窗内 pointerdown 冒泡到 document 关闭 */
    popup.addEventListener("pointerdown", function(e) { e.stopPropagation(); });

    document.body.appendChild(popup);
    updateVisuals();

    // 定位
    const rect = anchor.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 8;
    if (left + 220 > window.innerWidth - 8) left = window.innerWidth - 228;
    if (left < 8) left = 8;
    if (top + 280 > window.innerHeight) top = rect.top - 280;
    popup.style.left = left + "px";
    popup.style.top = top + "px";
  }

  async function deleteColor(colorId) {
    if (state.colorSettings.colors.length <= 1) return;
    state.colorSettings.colors = state.colorSettings.colors.filter(color => color.id !== colorId);
    if (state.colorSettings.defaultColorId === colorId) {
      state.colorSettings.defaultColorId = state.colorSettings.colors[0].id;
    }
    renderStylePage();
    await saveColorSettings();
  }

  async function createTag() {
    const name = els.tagName.value.trim();
    if (!name) return;
    await WAUtils.sendMessage({ type: "CREATE_TAG_BG", data: { name } });
    els.tagName.value = "";
    await loadData();
  }

  async function deleteTag(tagId) {
    await WAUtils.sendMessage({ type: "DELETE_TAG_BG", data: { tagId } });
    await loadData();
  }

  async function addExistingTagToMark(markId, tagId) {
    if (!tagId) return;
    // 切换逻辑：已选中的标签再次点击则取消，未选中则添加
    const currentTags = state.markTags.get(markId) || [];
    const alreadySelected = currentTags.some(t => t.id === tagId);
    if (alreadySelected) {
      await WAUtils.sendMessage({ type: "REMOVE_TAG_FROM_MARK_BG", data: { markId, tagId } });
    } else {
      await WAUtils.sendMessage({ type: "ADD_TAG_TO_MARK_BG", data: { markId, tagId } });
    }
    await loadData();
  }

  async function removeTagFromMark(markId, tagId) {
    await WAUtils.sendMessage({ type: "REMOVE_TAG_FROM_MARK_BG", data: { markId, tagId } });
    await loadData();
  }

  async function updateFavorite(mark, isFavorite) {
    await WAUtils.sendMessage({ type: "UPDATE_MARK_FAVORITE_BG", data: { markId: mark.id, isFavorite } });
    await loadData();
  }

  async function updateDescription(mark, description) {
    await WAUtils.sendMessage({ type: "UPDATE_MARK_BG", data: { mark: { ...mark, description } } });
    await loadData();
  }

  async function deleteMark(markId) {
    await WAUtils.sendMessage({ type: "DELETE_MARK_BG", data: { markId } });
    await loadData();
  }

  async function exportData() {
    const data = await WAUtils.sendMessage({ type: "EXPORT_DATA_BG" });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "web-annotator-export-" + new Date().toISOString().slice(0, 10) + ".json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    const data = JSON.parse(await file.text());
    await WAUtils.sendMessage({ type: "IMPORT_DATA_BG", data: { importData: data } });
    event.target.value = "";
    await loadData();
  }

  async function openMarkUrl(url) {
    if (!url) return;
    await WAUtils.sendMessage({ type: "OPEN_URL_BG", data: { url } });
  }

  /* ====== Utilities ====== */

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[char]));
  }

  function showToast(message) {
    let toast = document.querySelector('.wa-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'wa-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }

  function getHost(url) {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      console.log("getHost: url =", url, "hostname =", hostname);
      return hostname;
    } catch (error) {
      console.log("getHost: error for url =", url, "error =", error);
      return url || "Unknown page";
    }
  }

  function getTypeLabel(type) {
    if (type === "link") return "Link";
    if (type === "page") return "Page";
    return "Text";
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function isSingleLineText(text) {
    const normalized = String(text).trim();
    return normalized.length <= 48 && !/[\r\n]/.test(normalized);
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }
})();
