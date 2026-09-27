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
    shortcuts: { addHighlight: "Alt+S", openPanel: "Alt+W", jumpToNote: "Alt+N", deleteHighlight: "Alt+X" },
    uiPrefs: { cardStyle: "a", highlightTextColor: "original" },
    wordEntries: [],
    mergeWordForms: false,
    wordsOnly: true,
    wordFilteredOut: 0,
    sites: [],
    themeAccent: "#2dd4bf"
  };
  const THEME_ACCENTS = [
    { id: "teal", name: "青绿", color: "#2dd4bf" },
    { id: "blue", name: "蓝色", color: "#3b82f6" },
    { id: "violet", name: "紫色", color: "#8b5cf6" },
    { id: "rose", name: "玫红", color: "#f43f5e" },
    { id: "orange", name: "橙色", color: "#f97316" },
    { id: "emerald", name: "绿色", color: "#22c55e" },
    { id: "gold", name: "金色", color: "#f59e0b" },
    { id: "pink", name: "少女粉", color: "#ff8fb3" }
  ];
  const els = {};

  document.addEventListener("DOMContentLoaded", bootstrap);

  async function bootstrap() {
    applySurfaceMode();
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
      shortcutOpen: document.getElementById("shortcut-open"),
      shortcutSummary: document.getElementById("shortcut-summary"),
      exportButton: document.getElementById("export"),
      exportCsvButton: document.getElementById("export-csv"),
      exportPdfButton: document.getElementById("export-pdf"),
      importInput: document.getElementById("import"),
      cardStyleOptions: document.getElementById("card-style-options"),
      accentOptions: document.getElementById("accent-options"),
      textColorOptions: document.getElementById("text-color-options"),
      wordSearch: document.getElementById("word-search"),
      wordList: document.getElementById("word-list"),
      wordCount: document.getElementById("word-count"),
      wordMergeForms: document.getElementById("word-merge-forms"),
      wordOnly: document.getElementById("word-only"),
      exportWords: document.getElementById("export-words"),
      copyWords: document.getElementById("copy-words"),
      siteList: document.getElementById("site-list")
    });
    bindEvents();
    await loadUiPrefs();
    await loadThemeAccent();
    await loadData();
    await loadSites();
  }

  /* ====== UI Preferences ====== */

  /** 识别宿主形态：默认是浏览器侧边栏，?surface=page-panel 表示装在页面内大面板里。 */
  function applySurfaceMode() {
    try {
      const surface = new URLSearchParams(window.location.search).get("surface");
      if (surface) document.documentElement.dataset.surface = surface;
    } catch (error) {
      // 参数不可用时按默认侧边栏处理
    }
  }

  async function loadUiPrefs() {
    const defaults = { cardStyle: "a", highlightTextColor: "original" };
    try {
      const result = await new Promise(resolve => {
        chrome.storage.local.get("uiPrefs", data => resolve(data.uiPrefs || defaults));
      });
      state.uiPrefs = { ...defaults, ...result };
    } catch (e) {
      state.uiPrefs = { ...defaults };
    }
    applyCardStyle(state.uiPrefs.cardStyle);
    renderCardStyleOptions();
    renderTextColorOptions();
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

  async function loadThemeAccent() {
    try {
      const result = await new Promise(resolve => {
        chrome.storage.local.get("themeAccent", data => resolve(data.themeAccent || "#2dd4bf"));
      });
      state.themeAccent = result;
    } catch (e) {
      state.themeAccent = "#2dd4bf";
    }
    applyThemeAccent(state.themeAccent);
    renderAccentOptions();
  }

  function applyThemeAccent(color) {
    document.body.style.setProperty("--theme-accent", color);
    document.body.style.setProperty("--theme-accent-text", WAUtils.getTextColor(color));
  }

  async function setThemeAccent(color) {
    state.themeAccent = color;
    applyThemeAccent(color);
    renderAccentOptions();
    await chrome.storage.local.set({ themeAccent: color });
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: "THEME_ACCENT_UPDATED_CS", color }).catch(() => {});
    });
  }

  function renderCardStyleOptions() {
    if (!els.cardStyleOptions) return;
    els.cardStyleOptions.querySelectorAll(".card-style-opt").forEach(opt => {
      opt.classList.toggle("active", opt.dataset.cardStyle === state.uiPrefs.cardStyle);
    });
  }

  function renderTextColorOptions() {
    if (!els.textColorOptions) return;
    const mode = state.uiPrefs.highlightTextColor || "original";
    els.textColorOptions.querySelectorAll("[data-text-color]").forEach(opt => {
      opt.classList.toggle("active", opt.dataset.textColor === mode);
    });
  }

  function setHighlightTextColor(mode) {
    state.uiPrefs.highlightTextColor = mode;
    renderTextColorOptions();
    saveUiPrefs();
  }

  function renderAccentOptions() {
    if (!els.accentOptions) return;
    els.accentOptions.innerHTML = THEME_ACCENTS.map(item =>
      `<button type="button" class="accent-opt ${state.themeAccent === item.color ? "active" : ""}" data-accent="${item.color}" title="${item.name}"><span style="background:${item.color}"></span></button>`
    ).join("");
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

    // 词表页
    if (els.wordSearch) els.wordSearch.addEventListener("input", debounce(renderWords, 120));
    if (els.wordMergeForms) {
      els.wordMergeForms.addEventListener("change", () => {
        state.mergeWordForms = els.wordMergeForms.checked;
        renderWords();
      });
    }
    if (els.wordOnly) {
      els.wordOnly.checked = state.wordsOnly;
      els.wordOnly.addEventListener("change", () => {
        state.wordsOnly = els.wordOnly.checked;
        renderWords();
      });
    }
    if (els.exportWords) els.exportWords.addEventListener("click", exportWordList);
    if (els.copyWords) els.copyWords.addEventListener("click", copyWordList);
    if (els.wordList) {
      els.wordList.addEventListener("click", event => {
        const chip = event.target.closest(".wa-chip");
        if (chip) {
          toggleWordChip(chip.dataset.wordKey, chip);
          return;
        }
        const link = event.target.closest("[data-url]");
        if (link) {
          event.preventDefault();
          WAUtils.sendMessage({ type: "OPEN_URL_BG", data: { url: link.dataset.url } });
          return;
        }
        const toggle = event.target.closest(".wa-word-toggle");
        if (toggle) toggleWordCard(toggle);
      });
    }

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

    // 词条浮层：点外部 / 按 Esc / 滚动面板即关闭
    document.addEventListener("click", event => {
      if (!wordPopover) return;
      if (event.target.closest(".wa-word-pop") || event.target.closest(".wa-chip")) return;
      closeWordPopover();
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeWordPopover();
    });
    window.addEventListener("scroll", () => closeWordPopover(), true);

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
    els.exportCsvButton.addEventListener("click", exportCsv);
    els.exportPdfButton.addEventListener("click", exportPdf);
    els.importInput.addEventListener("change", importData);

    // Shortcuts
    els.shortcutOpen.addEventListener("click", showShortcutDialog);

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

    // Highlight text color mode
    if (els.textColorOptions) {
      els.textColorOptions.addEventListener("click", event => {
        const opt = event.target.closest("[data-text-color]");
        if (!opt) return;
        setHighlightTextColor(opt.dataset.textColor);
      });
    }

    if (els.accentOptions) {
      els.accentOptions.addEventListener("click", event => {
        const opt = event.target.closest("[data-accent]");
        if (!opt) return;
        setThemeAccent(opt.dataset.accent);
      });
    }

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

    // 统计每个网站的标注数量
    const siteCounts = {};
    state.marks.forEach(mark => {
      const targetUrl = mark.page_url || mark.full_url || mark.url;
      if (targetUrl) {
        const host = getHost(targetUrl);
        siteCounts[host] = (siteCounts[host] || 0) + 1;
      }
    });

    // 收集所有有标注的网站
    const allSites = new Set(Object.keys(siteCounts));
    state.sites.forEach(site => allSites.add(site.url));

    const sitesArray = Array.from(allSites).map(url => {
      const savedSite = state.sites.find(s => s.url === url);
      return {
        url: url,
        name: savedSite ? savedSite.name : url,
        description: savedSite ? savedSite.description : "",
        icon: savedSite && savedSite.icon ? savedSite.icon : getSiteIconForSite(url),
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
          <img src="${escapeHtml(site.icon || getDefaultSiteIcon())}" alt="" data-default-icon="${escapeHtml(getDefaultSiteIcon())}">
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
      item.querySelectorAll("img[data-default-icon]").forEach(img => {
        img.addEventListener("error", () => {
          img.src = img.dataset.defaultIcon;
        }, { once: true });
      });
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

    const result = await showSiteEditDialog(currentName, currentDesc);
    if (!result) return;

    const existingIndex = state.sites.findIndex(s => s.url === siteUrl);
    const siteData = {
      url: siteUrl,
      name: result.name || siteUrl,
      description: result.description || "",
      icon: site && site.icon ? site.icon : getSiteIconForSite(siteUrl)
    };

    if (existingIndex >= 0) {
      state.sites[existingIndex] = siteData;
    } else {
      state.sites.push(siteData);
    }

    await saveSites();
    await ensureSiteTagForMarks(siteUrl, siteData.name);
    await loadData();
    renderSites();
    showToast("网站信息已保存");
  }

  async function ensureSiteTagForMarks(siteUrl, siteName) {
    const name = String(siteName || "").trim();
    if (!name || name === siteUrl) return;
    const targetMarks = state.marks.filter(mark => getSiteKeyForMark(mark) === siteUrl);
    if (!targetMarks.length) return;
    const tag = await WAUtils.sendMessage({ type: "CREATE_TAG_BG", data: { name } });
    if (!tag || !tag.id) return;
    for (const mark of targetMarks) {
      await WAUtils.sendMessage({ type: "ADD_TAG_TO_MARK_BG", data: { markId: mark.id, tagId: tag.id } });
    }
  }

  function renderAll() {
    renderPages();
    renderMarks();
    renderWords();
    renderStylePage();
    renderSettingsPage();
    renderSites();
  }

  /* ====== Words Page（词表聚合） ====== */

  /** 词条归一化：折叠空白、去掉首尾标点、转小写；同一单词的多次标注靠它并成一条。 */
  function normalizeWordKey(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[\s"'“”‘’()\[\]{}<>《》〈〉.,;:!?、。，；：！？·—]+/u, "")
      .replace(/[\s"'“”‘’()\[\]{}<>《》.,;:!?、。，；：！？·—]+$/u, "")
      .toLowerCase();
  }

  /** 高亮文本的类别：word=单词，phrase=词组，other=单个字母 / 纯数字 / 纯符号 / 句子。 */
  function classifyWordEntry(text) {
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    if (!raw) return "other";
    // 先剥掉标点与装饰（括号、引号、序号点等），用"实义内容"判断：
    // 这样 [A]、(B)、"C"、A. 这类带装饰的单字母也会被正确识别为单个字母
    const core = raw.replace(/[^0-9A-Za-z\u4e00-\u9fff]/g, "");
    if (core.length <= 1) return "other";
    if (/^\d+$/.test(core)) return "other";
    const tokens = raw.split(" ").filter(Boolean);
    // 以句末标点收尾 + 词数够多 → 按句子处理（词表只收单词与词组）。
    // 门槛定在 6 个词：像 "out of date." 这种带句号的短语仍算词组，只有真句子才被排除
    if (tokens.length >= 6 && /[.!?]["'”’)\]]*$/.test(raw)) return "other";
    if (/[。！？…]$/.test(raw)) return "other";
    const cjkCount = (raw.match(/[\u4e00-\u9fff]/g) || []).length;
    if (cjkCount * 2 >= core.length) {
      // 中文条目：超过 20 个字基本就是整句了
      return core.length <= 20 ? "phrase" : "other";
    }
    if (tokens.length > 10 || raw.length > 70) return "other";
    return tokens.length === 1 ? "word" : "phrase";
  }

  /** 词形归并的候选形式（仅在开启"合并词形变化"时使用）。
   * 注意：这里只生成候选，真正归并时要求候选**本身也是已标注的词目**——
   * 这样 attributes 会并进 attribute，而 used 不会凭空变成 us。
   */
  function stemCandidates(key) {
    const word = key.replace(/['’]s$/, "");
    const undouble = value => value.replace(/([bcdfglmnprstz])\1$/, "$1");
    // 只有真的裁掉了后缀，才需要把尾部的双写辅音收成一个（running → run）
    const dropSuffix = (value, pattern, replacement) => {
      const stripped = value.replace(pattern, replacement);
      return stripped === value ? value : stripped;
    };
    const dropIng = value => {
      const stripped = value.replace(/ing$/, "");
      return stripped === value ? value : undouble(stripped);
    };
    const dropEd = value => {
      const stripped = value.replace(/ed$/, "");
      return stripped === value ? value : undouble(stripped);
    };
    const candidates = [
      word,
      dropSuffix(word, /([^aeiou])ies$/, "$1y"),
      dropSuffix(word, /(ch|sh|ss|x|z)es$/, "$1"),
      dropSuffix(word, /es$/, "e"),
      dropSuffix(word, /([^s])s$/, "$1"),
      dropIng(word),
      dropSuffix(word, /ed$/, "e"),
      dropEd(word),
      dropSuffix(word, /ly$/, "")
    ];
    return Array.from(new Set(candidates)).filter(value => Boolean(value) && value !== key && value.length >= 3);
  }

  /** 把屈折形式归并到已存在的词目上。 */
  function mergeVariantGroups(groups) {
    const keys = Array.from(groups.keys());
    const existing = new Set(keys);
    keys.forEach(key => {
      const entry = groups.get(key);
      if (!entry) return;
      for (const candidate of stemCandidates(key)) {
        if (!existing.has(candidate)) continue;
        const target = groups.get(candidate);
        if (!target || target === entry) continue;
        mergeWordEntries(target, entry);
        groups.delete(key);
        break;
      }
    });
  }

  /** 把 source 并入 target：出现记录、原始词形、标签全部累积。 */
  function mergeWordEntries(target, source) {
    target.occurrences.push(...source.occurrences);
    target.lastAt = Math.max(target.lastAt, source.lastAt);
    source.rawForms.forEach((count, form) => {
      target.rawForms.set(form, (target.rawForms.get(form) || 0) + count);
    });
    source.tags.forEach((count, name) => {
      target.tags.set(name, (target.tags.get(name) || 0) + count);
    });
    source.colors.forEach((count, color) => {
      target.colors.set(color, (target.colors.get(color) || 0) + count);
    });
  }

  /** 取标注上下文（原文前后各留一段），用于词条例句展示与导出。 */
  function buildWordContext(mark) {
    const text = mark.text || "";
    let prefix = "";
    let suffix = "";
    try {
      const selectors = JSON.parse(mark.select_info || "[]");
      const first = selectors.find(item => item.type === "TextQuoteSelector") || selectors[0] || {};
      prefix = first.prefix || "";
      suffix = first.suffix || "";
    } catch (error) {
      // 旧数据可能没有 select_info，忽略即可
    }
    const before = prefix ? "…" + prefix.slice(-80) : "";
    const after = suffix ? suffix.slice(0, 80) + "…" : "";
    return (before + text + after).replace(/\s+/g, " ").trim();
  }

  /** 标注关系 → 每个标注的标签名列表。 */
  function tagNamesByMarkId() {
    const nameById = new Map((state.tags || []).map(tag => [tag.id, tag.name]));
    const names = new Map();
    state.markTags.forEach((items, markId) => {
      names.set(markId, (items || []).map(item => nameById.get(item.tag_id)).filter(Boolean));
    });
    return names;
  }

  /** 把标注按词条聚合；开启合并词形时，同一词的屈折形式归到一条。 */
  function buildWordIndex(marks, tagNames, options) {
    const mergeForms = Boolean(options && options.mergeForms);
    const groups = new Map();
    (marks || []).forEach(mark => {
      const key = normalizeWordKey(mark.text || "");
      if (!key) return;
      let entry = groups.get(key);
      if (!entry) {
        entry = { key, rawForms: new Map(), occurrences: [], tags: new Map(), colors: new Map(), lastAt: 0 };
        groups.set(key, entry);
      }
      const raw = (mark.text || "").trim();
      entry.rawForms.set(raw, (entry.rawForms.get(raw) || 0) + 1);
      const colorBg = (mark.color && mark.color.bg) || "";
      if (colorBg) entry.colors.set(colorBg, (entry.colors.get(colorBg) || 0) + 1);
      (tagNames.get(mark.id) || []).forEach(name => {
        entry.tags.set(name, (entry.tags.get(name) || 0) + 1);
      });
      entry.lastAt = Math.max(entry.lastAt, mark.created_at || 0);
      entry.occurrences.push({
        id: mark.id,
        description: (mark.description || "").trim(),
        pageTitle: mark.page_title || "",
        pageUrl: mark.page_url || mark.url || "",
        createdAt: mark.created_at || 0,
        context: buildWordContext(mark),
        colorBg,
        tags: tagNames.get(mark.id) || []
      });
    });
    if (mergeForms) mergeVariantGroups(groups);
    return Array.from(groups.values()).map(entry => {
      const forms = Array.from(entry.rawForms.entries()).sort((a, b) => b[1] - a[1]);
      entry.occurrences.sort((a, b) => a.createdAt - b.createdAt);
      const meanings = Array.from(new Set(entry.occurrences.map(item => item.description).filter(Boolean)));
      const colors = Array.from(entry.colors.entries()).sort((a, b) => b[1] - a[1]);
      const display = forms.length ? forms[0][0] : entry.key;
      return {
        key: entry.key,
        display,
        kind: classifyWordEntry(display),
        colorBg: colors.length ? colors[0][0] : "#2dd4bf",
        variants: forms.map(item => item[0]).filter(text => text !== (forms[0] && forms[0][0])),
        count: entry.occurrences.length,
        meanings,
        tags: Array.from(entry.tags.keys()),
        lastAt: entry.lastAt,
        occurrences: entry.occurrences
      };
    }).sort((a, b) => b.count - a.count || b.lastAt - a.lastAt || a.display.localeCompare(b.display));
  }

  function filteredWordEntries() {
    const keyword = els.wordSearch ? els.wordSearch.value.trim().toLowerCase() : "";
    let entries = buildWordIndex(state.marks, tagNamesByMarkId(), { mergeForms: state.mergeWordForms });
    if (state.wordsOnly) {
      const kept = entries.filter(entry => entry.kind !== "other");
      state.wordFilteredOut = entries.length - kept.length;
      entries = kept;
    } else {
      state.wordFilteredOut = 0;
    }
    if (!keyword) return entries;
    const hit = text => String(text || "").toLowerCase().includes(keyword);
    return entries.filter(entry =>
      hit(entry.display) ||
      entry.meanings.some(hit) ||
      entry.tags.some(hit) ||
      entry.occurrences.some(item => hit(item.pageTitle) || hit(item.context)));
  }

  function renderWords() {
    if (!els.wordList) return;
    closeWordPopover();
    const entries = filteredWordEntries();
    state.wordEntries = entries;
    const total = entries.reduce((sum, entry) => sum + entry.count, 0);
    if (els.wordCount) {
      const skipped = state.wordsOnly && state.wordFilteredOut
        ? ' · 已过滤 <b>' + state.wordFilteredOut + "</b> 条非单词/词组"
        : "";
      const hint = entries.length ? " · 点胶囊看释义" : "";
      els.wordCount.innerHTML = "<b>" + entries.length + "</b> words · " + total + " occurrences" + skipped + hint;
    }
    if (!entries.length) {
      els.wordList.innerHTML = '<div class="empty wa-word-empty">还没有可聚合的标注。在真题页划词高亮之后，这里会自动汇成词表。</div>';
      return;
    }
    els.wordList.innerHTML = '<div class="wa-chip-cloud">' + entries.map(renderWordChip).join("") + "</div>";
  }

  function renderWordChip(entry) {
    const title = entry.meanings.length ? entry.meanings.join("；") : "还没写释义";
    return (
      '<button type="button" class="wa-chip"' +
        ' data-word-key="' + escapeHtml(entry.key) + '"' +
        ' style="--mark-color: ' + escapeHtml(entry.colorBg || "#2dd4bf") + '"' +
        ' aria-pressed="false"' +
        ' title="' + escapeHtml(title) + '">' +
        '<span class="wa-chip-dot"></span>' +
        '<span class="wa-chip-text">' + escapeHtml(entry.display) + "</span>" +
        (entry.count > 1 ? '<span class="wa-chip-count">' + entry.count + "</span>" : "") +
      "</button>"
    );
  }

  /* ---- 词条浮层：点胶囊就地弹出，不改变页面滚动位置 ---- */

  let wordPopover = null;

  function closeWordPopover() {
    if (!wordPopover) return;
    try {
      wordPopover.el.remove();
    } catch (error) {
      // 元素可能已随重渲染移除
    }
    wordPopover.chip.classList.remove("active");
    wordPopover.chip.setAttribute("aria-pressed", "false");
    wordPopover = null;
  }

  function openWordPopover(chip, entry) {
    closeWordPopover();
    const pop = document.createElement("div");
    pop.className = "wa-word-pop";
    pop.innerHTML = renderWordCard(entry, { withClose: true });
    pop.addEventListener("pointerdown", event => event.stopPropagation());
    pop.addEventListener("click", event => {
      if (event.target.closest(".wa-word-pop-close")) {
        event.preventDefault();
        closeWordPopover();
        return;
      }
      const link = event.target.closest("[data-url]");
      if (link) {
        event.preventDefault();
        WAUtils.sendMessage({ type: "OPEN_URL_BG", data: { url: link.dataset.url } });
        return;
      }
      const toggle = event.target.closest(".wa-word-toggle");
      if (toggle) toggleWordCard(toggle);
    });
    document.body.appendChild(pop);
    chip.classList.add("active");
    chip.setAttribute("aria-pressed", "true");
    wordPopover = { el: pop, chip, key: entry.key };
    positionWordPopover(pop, chip);
  }

  /** 贴着胶囊定位：优先放下方，放不下翻到上方，左右夹在视口内。 */
  function positionWordPopover(pop, chip) {
    const rect = chip.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 24);
    pop.style.width = width + "px";
    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    if (left < 8) left = 8;
    const height = pop.offsetHeight;
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - 8) {
      const above = rect.top - height - 8;
      top = above >= 8 ? above : Math.max(8, window.innerHeight - height - 8);
    }
    pop.style.left = left + "px";
    pop.style.top = top + "px";
  }

  /** 点胶囊：没开就弹出浮层，已开则收起（同一个胶囊再点一下即关）。 */
  function toggleWordChip(key, chip) {
    if (wordPopover && wordPopover.key === key) {
      closeWordPopover();
      return;
    }
    const entry = state.wordEntries.find(item => item.key === key);
    if (entry) openWordPopover(chip, entry);
  }

  function renderWordCard(entry, options) {
    const withClose = Boolean(options && options.withClose);
    const kindLabel = entry.kind === "phrase" ? "词组" : "单词";
    const meanings = entry.meanings.length
      ? entry.meanings.map(text => escapeHtml(text)).join(" ／ ")
      : '<span class="wa-word-muted">还没写释义</span>';
    const tags = entry.tags.map(name => '<span class="mark-tag">' + escapeHtml(name) + "</span>").join("");
    const variants = entry.variants.length
      ? '<span class="wa-word-variants">' + entry.variants.slice(0, 4).map(text => escapeHtml(text)).join(" · ") + "</span>"
      : "";
    // 每一处出现：只留上下文 + 打开原文按钮，不再显示页面标题
    const rows = entry.occurrences.map(item => (
      '<div class="wa-word-occ">' +
        (item.context ? '<div class="wa-word-occ-ctx">' + escapeHtml(item.context) + "</div>" : "") +
        '<div class="wa-word-occ-actions">' +
          (item.pageUrl ? '<button type="button" class="wa-word-open" data-url="' + escapeHtml(item.pageUrl) + '">打开原文</button>' : "") +
          '<span class="wa-word-occ-time">' + formatWordDate(item.createdAt) + "</span>" +
        "</div>" +
      "</div>"
    )).join("");
    return (
      '<article class="mark-card wa-word-item" style="--mark-color: ' + escapeHtml(entry.colorBg || "#2dd4bf") + '">' +
        '<div class="mark-topline">' +
          '<span class="mark-color"></span>' +
          '<span class="mark-type">' + kindLabel + "</span>" +
          '<span class="wa-word-count">' + entry.count + " 次</span>" +
          '<span class="mark-time">' + formatWordDate(entry.lastAt) + "</span>" +
          (withClose ? '<button type="button" class="wa-word-pop-close" title="关闭">✕</button>' : "") +
        "</div>" +
        '<div class="mark-text wa-word-text">' + escapeHtml(entry.display) + "</div>" +
        '<div class="mark-description wa-word-mean">' + meanings + "</div>" +
        (tags ? '<div class="mark-tags">' + tags + "</div>" : "") +
        (variants ? '<div class="wa-word-foot">' + variants + "</div>" : "") +
        '<button type="button" class="wa-word-toggle" aria-expanded="false">' +
          '<span class="wa-word-toggle-label">查看 ' + entry.count + " 处上下文</span>" +
        "</button>" +
        '<div class="wa-word-occs" hidden>' + rows + "</div>" +
      "</article>"
    );
  }

  /** 展开 / 收起某个词条的上下文。用受控开关而不是原生 details，保证"能开也一定能关"。 */
  function toggleWordCard(toggle) {
    const card = toggle.closest(".wa-word-item");
    if (!card) return;
    const body = card.querySelector(".wa-word-occs");
    if (!body) return;
    const willOpen = body.hidden;
    body.hidden = !willOpen;
    toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
    const label = toggle.querySelector(".wa-word-toggle-label");
    if (label) {
      label.textContent = willOpen ? "收起上下文" : "查看 " + body.querySelectorAll(".wa-word-occ").length + " 处上下文";
    }
  }

  function formatWordDate(ts) {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleDateString();
    } catch (error) {
      return "";
    }
  }

  /** Anki 友好格式：正面=词形，背面=释义+例句+出处（HTML），标签列放标签。 */
  function buildAnkiRows(entries) {
    return entries.map(entry => {
      const back = [];
      if (entry.meanings.length) back.push(escapeHtml(entry.meanings.join("；")));
      const example = entry.occurrences.find(item => item.context);
      if (example) back.push(escapeHtml(example.context));
      const sources = Array.from(new Set(entry.occurrences.map(item => item.pageTitle || item.pageUrl)))
        .filter(Boolean).slice(0, 4);
      if (sources.length) back.push(escapeHtml(sources.join(" · ")));
      return [entry.display, back.join("<br>"), entry.tags.join(" ")];
    });
  }

  function exportWordList() {
    const entries = state.wordEntries && state.wordEntries.length ? state.wordEntries : filteredWordEntries();
    if (!entries.length) return;
    const rows = buildAnkiRows(entries);
    const lines = [
      "#separator:tab",
      "#html:true",
      "#tags column:3",
      ["单词", "释义", "标签"].join("\t"),
      ...rows.map(row => row.join("\t"))
    ];
    // 字段内的换行会撑破 TSV 结构，统一压成空格
    const tsv = lines.map(line => line.replace(/[\r\n]+/g, " ")).join("\r\n");
    downloadBlob(new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" }), "xa-note-words-" + getExportDate() + ".txt");
  }

  async function copyWordList() {
    const entries = state.wordEntries && state.wordEntries.length ? state.wordEntries : filteredWordEntries();
    if (!entries.length) return;
    const text = entries.map(entry => entry.display + "\t" + (entry.meanings[0] || "")).join("\n");
    const ok = await copyText(text);
    if (els.copyWords) {
      const original = els.copyWords.textContent;
      els.copyWords.textContent = ok ? "已复制 " + entries.length + " 条" : "复制失败";
      setTimeout(() => { els.copyWords.textContent = original; }, 1600);
    }
  }

  /** 剪贴板写入：优先 Clipboard API，失败退回临时 textarea。 */
  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      // 继续走兜底
    }
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch (error) {
      return false;
    }
  }

  /* ====== Page Navigation ====== */

  function renderPages() {
    const pageIndex = { marks: 0, words: 1, style: 2, settings: 3 };
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
      marks = state.activeTagId.startsWith("site:")
        ? marks.filter(mark => getSiteKeyForMark(mark) === state.activeTagId.slice(5))
        : marks.filter(mark => (state.markTags.get(mark.id) || []).some(tag => tag.id === state.activeTagId));
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
    buttons.push(...getSiteTagFilters().map(tag =>
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
    if (els.shortcutSummary) {
      els.shortcutSummary.textContent = getShortcutItems().map(item => state.shortcuts[item.key] || item.defaultValue).join(" · ");
    }
  }

  /* ====== Actions ====== */

  function getShortcutItems() {
    return [
      { key: "addHighlight", label: "添加高亮", description: "选中文字后快速创建高亮", defaultValue: "Alt+S" },
      { key: "openPanel", label: "打开侧栏", description: "打开 XA-Note 管理侧栏", defaultValue: "Alt+W" },
      { key: "jumpToNote", label: "跳转备注", description: "打开最近高亮，或保存并关闭备注卡", defaultValue: "Alt+N" },
      { key: "deleteHighlight", label: "删除高亮", description: "删除当前备注卡或最近操作的高亮", defaultValue: "Alt+X" }
    ];
  }

  function showShortcutDialog() {
    const overlay = document.createElement("div");
    overlay.className = "pdf-export-overlay shortcut-overlay";
    overlay.innerHTML = `
      <div class="pdf-export-dialog shortcut-dialog" role="dialog" aria-modal="true">
        <div class="pdf-export-head">
          <div>
            <h3>快捷键设置</h3>
            <p>点击输入框后按下新的组合键</p>
          </div>
          <button type="button" class="pdf-export-close" data-action="cancel" aria-label="关闭">×</button>
        </div>
        <div class="shortcut-dialog-list">
          ${getShortcutItems().map(item => `
            <label class="shortcut-dialog-item">
              <span><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.description)}</small></span>
              <input type="text" readonly data-shortcut-key="${item.key}" value="${escapeHtml(state.shortcuts[item.key] || item.defaultValue)}">
            </label>
          `).join("")}
        </div>
        <div class="pdf-export-actions">
          <button type="button" data-action="cancel">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", event => {
      if (event.target === overlay || event.target.closest('[data-action="cancel"]')) overlay.remove();
    });
    overlay.addEventListener("keydown", async event => {
      const input = event.target.closest("input[data-shortcut-key]");
      if (!input) return;
      event.preventDefault();
      if (event.key === "Escape") {
        overlay.remove();
        return;
      }
      const shortcut = formatShortcut(event);
      if (!shortcut) return;
      state.shortcuts = { ...state.shortcuts, [input.dataset.shortcutKey]: shortcut };
      input.value = shortcut;
      renderSettingsPage();
      await WAUtils.sendMessage({ type: "SAVE_SHORTCUTS_BG", data: { shortcuts: state.shortcuts } });
    });
    const firstInput = overlay.querySelector("input[data-shortcut-key]");
    if (firstInput) firstInput.focus();
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

  function hexToRgba(hex, alpha) {
    const [r, g, b] = hexToRgb(hex || "#2dd4bf");
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    downloadBlob(blob, "xa-note-export-" + getExportDate() + ".json");
  }

  async function exportCsv() {
    const data = await WAUtils.sendMessage({ type: "EXPORT_DATA_BG" });
    const rows = buildExportRows(data);
    const csv = rowsToCsv([
      ["序号", "类型", "标注文本", "备注", "标签", "页面标题", "页面URL", "来源链接", "颜色", "样式", "收藏", "创建时间"],
      ...rows.map((row, index) => [
        index + 1,
        row.type,
        row.text,
        row.description,
        row.tags,
        row.pageTitle,
        row.pageUrl,
        row.linkUrl,
        row.color,
        row.style,
        row.favorite,
        row.createdAt
      ])
    ]);
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, "xa-note-export-" + getExportDate() + ".csv");
  }

  async function exportPdf() {
    const data = await WAUtils.sendMessage({ type: "EXPORT_DATA_BG" });
    const allRows = buildExportRows(data);
    const options = await showPdfExportOptions(allRows);
    if (!options) return;
    const rows = filterPdfRows(allRows, options);
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showToast("请允许弹出窗口后重试");
      return;
    }
    printWindow.document.write(buildPrintHtml(rows, options));
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => printWindow.print();
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

  function getDefaultPdfOptions() {
    return { tags: true, page: false, time: false, includeUnnoted: false, wordsOnly: true };
  }

  function showPdfExportOptions(rows) {
    return new Promise(resolve => {
      const current = getDefaultPdfOptions();
      const tags = getPdfFilterTags(rows);
      const pages = getPdfFilterPages(rows);
      const overlay = document.createElement("div");
      overlay.className = "pdf-export-overlay";
      overlay.innerHTML = `
        <div class="pdf-export-dialog" role="dialog" aria-modal="true">
          <div class="pdf-export-head">
            <div>
              <h3>PDF 导出内容</h3>
              <p>选择是否包含未备注高亮</p>
            </div>
            <button type="button" class="pdf-export-close" data-action="cancel" aria-label="关闭">×</button>
          </div>
          <div class="pdf-export-options">
            <label><input type="checkbox" data-field="wordsOnly" ${current.wordsOnly ? "checked" : ""}><span><b>只看单词与词组</b><small>过滤掉单个字母、纯数字与整句高亮</small></span></label>
            <label><input type="checkbox" data-field="includeUnnoted" ${current.includeUnnoted ? "checked" : ""}><span><b>包含未备注高亮</b><small>勾选后会导出只高亮但未备注的内容</small></span></label>
          </div>
          <div class="pdf-export-filter">
            <div class="filter-title">标签筛选</div>
            ${renderPdfSelect("tag", "全部标签", [{ value: "none", label: "无标签" }, ...tags.map(tag => ({ value: tag, label: tag }))])}
          </div>
          <div class="pdf-export-filter">
            <div class="filter-title">网页筛选</div>
            ${renderPdfSelect("page", "全部网页", pages.map(page => ({ value: page.url, label: page.title })))}
          </div>
          <div class="pdf-export-actions">
            <button type="button" data-action="cancel">取消</button>
            <button type="button" data-action="confirm">导出 PDF</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const close = value => {
        overlay.remove();
        resolve(value);
      };
      overlay.addEventListener("click", event => {
        if (event.target === overlay || event.target.closest('[data-action="cancel"]')) {
          close(null);
          return;
        }
        if (event.target.closest('[data-action="confirm"]')) {
          const options = { ...current };
          overlay.querySelectorAll("input[data-field]").forEach(input => {
            options[input.dataset.field] = input.checked;
          });
          options.tagFilter = overlay.querySelector('[data-filter="tag"] .pdf-select-value').dataset.value;
          options.pageFilter = overlay.querySelector('[data-filter="page"] .pdf-select-value').dataset.value;
          close(options);
        }
      });
      overlay.addEventListener("click", event => {
        const select = event.target.closest(".pdf-select");
        overlay.querySelectorAll(".pdf-select.open").forEach(item => {
          if (item !== select) item.classList.remove("open");
        });
        if (!select) return;
        const option = event.target.closest(".pdf-select-option");
        if (option) {
          const value = select.querySelector(".pdf-select-value");
          value.dataset.value = option.dataset.value;
          value.textContent = option.textContent;
          select.classList.remove("open");
          return;
        }
        if (event.target.closest(".pdf-select-trigger")) select.classList.toggle("open");
      });
    });
  }

  function renderPdfSelect(name, defaultLabel, options) {
    return `
      <div class="pdf-select" data-filter="${name}">
        <button type="button" class="pdf-select-trigger">
          <span class="pdf-select-value" data-value="all">${escapeHtml(defaultLabel)}</span>
          <span class="pdf-select-arrow">⌄</span>
        </button>
        <div class="pdf-select-menu">
          <button type="button" class="pdf-select-option" data-value="all">${escapeHtml(defaultLabel)}</button>
          ${options.map(option => `<button type="button" class="pdf-select-option" data-value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`).join("")}
        </div>
      </div>
    `;
  }

  function showSiteEditDialog(currentName, currentDesc) {
    return new Promise(resolve => {
      const overlay = document.createElement("div");
      overlay.className = "pdf-export-overlay site-edit-overlay";
      overlay.innerHTML = `
        <div class="pdf-export-dialog site-edit-dialog" role="dialog" aria-modal="true">
          <div class="pdf-export-head">
            <div>
              <h3>编辑网站分类</h3>
              <p>网站名称会同步作为标注筛选标签</p>
            </div>
            <button type="button" class="pdf-export-close" data-action="cancel" aria-label="关闭">×</button>
          </div>
          <div class="site-edit-fields">
            <label><span>网站名称</span><input data-field="name" type="text" value="${escapeHtml(currentName)}"></label>
            <label><span>网站备注</span><textarea data-field="description" rows="3">${escapeHtml(currentDesc)}</textarea></label>
          </div>
          <div class="pdf-export-actions">
            <button type="button" data-action="cancel">取消</button>
            <button type="button" data-action="confirm">保存</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const nameInput = overlay.querySelector('[data-field="name"]');
      nameInput.focus();
      nameInput.select();
      const close = value => {
        overlay.remove();
        resolve(value);
      };
      overlay.addEventListener("click", event => {
        if (event.target === overlay || event.target.closest('[data-action="cancel"]')) {
          close(null);
          return;
        }
        if (event.target.closest('[data-action="confirm"]')) {
          close({
            name: overlay.querySelector('[data-field="name"]').value.trim(),
            description: overlay.querySelector('[data-field="description"]').value.trim()
          });
        }
      });
      overlay.addEventListener("keydown", event => {
        if (event.key === "Escape") close(null);
      });
    });
  }

  function buildExportRows(data) {
    const tagById = new Map((data.tags || []).map(tag => [tag.id, tag]));
    const tagsByMarkId = new Map();
    (data.markTags || []).forEach(item => {
      const tag = tagById.get(item.tag_id);
      if (!tag) return;
      const list = tagsByMarkId.get(item.mark_id) || [];
      list.push(tag.name);
      tagsByMarkId.set(item.mark_id, list);
    });
    return (data.marks || []).slice().sort((a, b) => (a.created_at || 0) - (b.created_at || 0)).map(mark => ({
      siteKey: getSiteKeyForMark(mark),
      type: getTypeLabel(mark.type),
      text: mark.text || "",
      description: mark.description || "",
      tags: (tagsByMarkId.get(mark.id) || []).join(", "),
      tagList: tagsByMarkId.get(mark.id) || [],
      pageTitle: mark.page_title || "",
      pageUrl: mark.page_url || mark.url || "",
      linkUrl: mark.link_url || "",
      color: mark.color && mark.color.bg ? mark.color.bg : "",
      style: mark.color && mark.color.style ? mark.color.style : "",
      favorite: mark.is_favorite ? "是" : "否",
      createdAt: mark.created_at ? new Date(mark.created_at).toLocaleString() : ""
    }));
  }

  function rowsToCsv(rows) {
    return rows.map(row => row.map(value => '"' + String(value ?? "").replace(/"/g, '""') + '"').join(",")).join("\r\n");
  }

  function filterPdfRows(rows, options) {
    return rows.filter(row => {
      if (options.wordsOnly && classifyWordEntry(row.text) === "other") return false;
      if (!options.includeUnnoted && !row.description.trim()) return false;
      if (options.tagFilter === "none" && row.tagList.length) return false;
      if (options.tagFilter && options.tagFilter !== "all" && options.tagFilter !== "none" && !row.tagList.includes(options.tagFilter) && getSiteDisplayName(row.siteKey) !== options.tagFilter) return false;
      if (options.pageFilter && options.pageFilter !== "all" && row.pageUrl !== options.pageFilter) return false;
      return true;
    });
  }

  function getPdfFilterTags(rows) {
    return Array.from(new Set(rows.flatMap(row => row.tagList).concat(getSiteTagFilters().map(tag => tag.name)))).sort((a, b) => a.localeCompare(b));
  }

  function getPdfFilterPages(rows) {
    const pages = new Map();
    rows.forEach(row => {
      if (!row.pageUrl || pages.has(row.pageUrl)) return;
      pages.set(row.pageUrl, { url: row.pageUrl, title: row.pageTitle || getHost(row.pageUrl) });
    });
    return Array.from(pages.values()).sort((a, b) => a.title.localeCompare(b.title));
  }

  function orderPrintRows(items) {
    return items.map(item => ({ ...item, metrics: getPrintCardMetrics(item.row) }))
      .sort((a, b) => {
        const aNormal = a.metrics.height === 86;
        const bNormal = b.metrics.height === 86;
        if (aNormal !== bNormal) return aNormal ? -1 : 1;
        if (!aNormal && a.metrics.height !== b.metrics.height) return a.metrics.height - b.metrics.height;
        return a.originalIndex - b.originalIndex;
      });
  }

  function getPrintCardMetrics(row) {
    const quoteLines = estimatePrintLines(row.text, 58, 1, 6);
    const noteLines = row.description ? estimatePrintLines(row.description, 70, 1, 4) : 0;
    const extraQuoteLines = Math.max(0, quoteLines - 1);
    const extraNoteLines = Math.max(0, noteLines - 1);
    return {
      quoteLines,
      noteLines,
      height: 112 + extraQuoteLines * 16 + extraNoteLines * 13
    };
  }

  function estimatePrintLines(text, charsPerLine, minLines, maxLines) {
    const normalized = String(text || "").trim();
    if (!normalized) return 0;
    const explicitLines = normalized.split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
    return Math.min(maxLines, Math.max(minLines, explicitLines));
  }

  function buildPrintHtml(rows, options = getDefaultPdfOptions()) {
    const accent = state.themeAccent || "#2dd4bf";
    const accentSoft = hexToRgba(accent, 0.12);
    const accentTag = hexToRgba(accent, 0.14);
    const accentTagText = WAUtils.getTextColor(accent) === "#ffffff" ? accent : "#17201f";
    const printableRows = orderPrintRows(rows.map((row, index) => ({ row, originalIndex: index })));
    const cards = printableRows.map((item, index) => {
      const metrics = getPrintCardMetrics(item.row);
      return `
      <article class="card" style="--card-height:${metrics.height}px;--quote-lines:${metrics.quoteLines};--note-lines:${metrics.noteLines};">
        <div class="card-head">
          <span class="index">${String(index + 1).padStart(2, "0")}</span>
          ${item.row.favorite === "是" ? `<span class="favorite">Favorite</span>` : ""}
          ${options.time ? `<time>${escapeHtml(item.row.createdAt)}</time>` : ""}
        </div>
        ${options.tags && item.row.tags ? `<div class="tags">${item.row.tags.split(", ").map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        <blockquote>${escapeHtml(item.row.text || "-")}</blockquote>
        ${item.row.description ? `<section class="note"><span>Note</span><p>${escapeHtml(item.row.description)}</p></section>` : ""}
        ${options.page ? `<footer><strong>${escapeHtml(item.row.pageTitle || "Untitled page")}</strong></footer>` : ""}
      </article>
    `;
    }).join("");
    return `<div class="pdf-document">
      <style>
        * { box-sizing: border-box; }
        .pdf-document { margin: 0; color: #17201f; font-family: Inter, "Segoe UI", Arial, "Microsoft YaHei", sans-serif; background: #ffffff; }
        .sheet { width: 794px; min-height: 1123px; margin: 0 auto; padding: 18px 18px 24px; background: #ffffff; }
        .hero { position: relative; overflow: hidden; padding: 18px 22px; border-radius: 18px; background: linear-gradient(135deg, #102421 0%, #16473f 52%, ${accent} 130%); color: #fff; box-shadow: 0 14px 34px rgba(15, 47, 42, .12); }
        .hero:after { content: ""; position: absolute; right: -60px; top: -80px; width: 240px; height: 240px; border-radius: 999px; background: rgba(255,255,255,.12); }
        .brand-row { position: relative; display: flex; justify-content: space-between; gap: 12px; margin: 0 0 8px; font-size: 11px; letter-spacing: .18em; text-transform: uppercase; opacity: .78; }
        .brand, .author { margin: 0; }
        h1 { position: relative; margin: 0; font-size: 24px; line-height: 1.1; letter-spacing: -.04em; }
        .summary { position: relative; margin: 8px 0 0; color: rgba(255,255,255,.78); font-size: 12px; }
        .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; gap: 8px 10px; margin-top: 14px; }
        .card { position: relative; break-inside: avoid; page-break-inside: avoid; height: var(--card-height, 124px); overflow: hidden; padding: 11px 12px 10px; border: 1px solid #d8e3df; border-radius: 13px; background: linear-gradient(180deg, #fbfdfc 0%, #f5f8f7 100%); box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 7px 18px rgba(21, 45, 39, .075); }
        .card:before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: ${accent}; opacity: .78; }
        .card-head { display: flex; align-items: center; gap: 8px; min-height: 20px; color: #687571; font-size: 11px; }
        .index { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 19px; border-radius: 999px; background: ${accentSoft}; color: ${accent}; font-size: 10px; font-weight: 800; }
        .favorite { padding: 3px 7px; border-radius: 999px; background: #fff1f2; color: #be123c; font-size: 10px; font-weight: 700; }
        time { margin-left: auto; }
        blockquote { display: -webkit-box; -webkit-line-clamp: var(--quote-lines, 1); -webkit-box-orient: vertical; overflow: hidden; margin: 9px 0 0; padding: 0 0 0 10px; border-left: 3px solid ${accent}; color: #12211e; font-size: 11.5px; line-height: 1.42; font-weight: 650; }
        .note { margin-top: 7px; padding: 0; background: transparent; }
        .note span { display: none; }
        .note p { display: -webkit-box; -webkit-line-clamp: var(--note-lines, 1); -webkit-box-orient: vertical; overflow: hidden; margin: 0; color: #25332f; font-size: 9.5px; line-height: 1.42; white-space: pre-wrap; }
        .tags { position: absolute; top: 10px; right: 11px; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 3px; max-width: 50%; max-height: 20px; overflow: hidden; }
        .tags span { padding: 2px 6px; border-radius: 999px; background: ${accentTag}; color: ${accentTagText}; font-size: 8px; font-weight: 700; }
        footer { margin-top: 5px; padding-top: 4px; border-top: 1px dashed #d6dedb; }
        footer strong { display: block; overflow: hidden; color: #65716d; font-size: 8px; line-height: 1.2; white-space: nowrap; text-overflow: ellipsis; }
      </style>
      <main class="sheet">
        <header class="hero" style="display:${options.pageNumber && options.pageNumber > 1 ? "none" : "block"}">
          <div class="brand-row"><p class="brand">XA-Note</p><p class="author">ANJIU</p></div>
          <h1>标注摘录</h1>
          <p class="summary">当前页面共 ${options.totalRows || rows.length} 条标注</p>
        </header>
        <section class="cards">${cards || "<p>暂无标注</p>"}</section>
      </main>
      </div>`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function getExportDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function getSiteKeyForMark(mark) {
    const targetUrl = mark && (mark.page_url || mark.full_url || mark.url);
    return targetUrl ? getHost(targetUrl) : "";
  }

  function getSiteIconForSite(siteKey) {
    const mark = state.marks.find(item => getSiteKeyForMark(item) === siteKey && item.page_icon);
    if (mark && mark.page_icon) return mark.page_icon;
    return getFallbackFavicon(siteKey);
  }

  function getFallbackFavicon(siteKey) {
    if (!siteKey || siteKey === "Unknown page") return "";
    const host = siteKey.replace(/^https?:\/\//, "").split("/")[0];
    return host ? `https://${host}/favicon.ico` : "";
  }

  function getDefaultSiteIcon() {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 36'%3E%3Cpath fill='%23F4ABBA' d='M31.298 20.807c4.197-1.363 5.027-3.182 4.191-6.416-.952.308-2.105-.001-2.272-.518-.168-.513.581-1.443 1.533-1.753-1.223-3.107-2.964-4.089-7.161-2.727-1.606.522-3.238 1.492-4.655 2.635C23.582 10.327 24 8.475 24 6.786c0-4.412-1.473-5.765-4.807-5.968 0 1-.652 2-1.193 2s-1.194-1-1.194-2C13.472 1.021 12 2.374 12 6.786c0 1.689.417 3.541 1.066 5.241-1.416-1.142-3.049-2.111-4.655-2.633-4.197-1.364-5.938-.381-7.162 2.727.951.31 1.701 1.238 1.534 1.753-.167.515-1.32.826-2.271.518-.837 3.233-.005 5.052 4.19 6.415 1.606.521 3.497.697 5.314.605-1.524.994-2.95 2.247-3.943 3.613-2.594 3.57-2.197 5.53.381 7.654.588-.809 1.703-1.235 2.142-.917.438.317.378 1.511-.21 2.32 2.816 1.795 4.803 1.565 7.396-2.003.993-1.366 1.743-3.111 2.218-4.867.475 1.757 1.226 3.501 2.218 4.867 2.594 3.57 4.58 3.798 7.397 2.003-.587-.81-.649-2.002-.21-2.321.437-.317 1.553.107 2.142.917 2.577-2.123 2.973-4.083.381-7.653-.993-1.366-2.42-2.619-3.943-3.613 1.816.092 3.706-.084 5.313-.605z'/%3E%3Ccircle fill='%23FFCC4D' cx='18' cy='18.818' r='4'/%3E%3C/svg%3E";
  }

  function getSiteDisplayName(siteKey) {
    const site = state.sites.find(item => item.url === siteKey);
    return site && site.name ? site.name : siteKey;
  }

  function getSiteTagFilters() {
    const counts = new Map();
    state.marks.forEach(mark => {
      const siteKey = getSiteKeyForMark(mark);
      if (!siteKey) return;
      const name = getSiteDisplayName(siteKey);
      if (!name || name === siteKey) return;
      counts.set(siteKey, (counts.get(siteKey) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([siteKey, count]) => ({
      id: "site:" + siteKey,
      name: getSiteDisplayName(siteKey),
      count
    }));
  }

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
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (error) {
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
