importScripts("utils.js");

class WebAnnotatorDatabase {
  constructor() {
    this.name = "WebAnnotatorExtension";
    this.version = 1;
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, this.version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = event => this.upgrade(event.target.result);
    });
    return this.db;
  }

  upgrade(db) {
    const marks = db.createObjectStore("marks", { keyPath: "id" });
    marks.createIndex("url", "url", { unique: false });
    marks.createIndex("created_at", "created_at", { unique: false });

    const tags = db.createObjectStore("tags", { keyPath: "id" });
    tags.createIndex("name", "name", { unique: true });

    const markTags = db.createObjectStore("mark_tags", { keyPath: "id" });
    markTags.createIndex("mark_id", "mark_id", { unique: false });
    markTags.createIndex("tag_id", "tag_id", { unique: false });

    db.createObjectStore("color_settings", { keyPath: "id" });
  }

  async tx(storeNames, mode, callback) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      const stores = Array.isArray(storeNames)
        ? storeNames.map(name => tx.objectStore(name))
        : tx.objectStore(storeNames);
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve(result);
      let result;
      try {
        result = callback(stores, tx);
      } catch (error) {
        reject(error);
      }
    });
  }

  request(request) {
    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async put(store, value) {
    await this.tx(store, "readwrite", objectStore => objectStore.put(value));
    return value;
  }

  async delete(store, id) {
    await this.tx(store, "readwrite", objectStore => objectStore.delete(id));
    return true;
  }

  async get(store, id) {
    const db = await this.open();
    return this.request(db.transaction(store, "readonly").objectStore(store).get(id));
  }

  async getAll(store) {
    const db = await this.open();
    return this.request(db.transaction(store, "readonly").objectStore(store).getAll());
  }

  async addMark(mark) {
    return this.put("marks", mark);
  }

  async updateMark(mark) {
    return this.put("marks", { ...mark, updated_at: Date.now() });
  }

  async getMarkById(id) {
    return this.get("marks", id);
  }

  async getMarksByUrl(url, exact = true) {
    const marks = await this.getAll("marks");
    return marks.filter(mark => exact ? mark.url === url : mark.url.includes(url));
  }

  async getMarks() {
    return this.getAll("marks");
  }

  async deleteMark(id) {
    const markTags = await this.getMarkTagsByMark(id);
    await this.tx(["marks", "mark_tags"], "readwrite", ([marksStore, markTagsStore]) => {
      marksStore.delete(id);
      markTags.forEach(item => markTagsStore.delete(item.id));
    });
    return true;
  }

  async getStats() {
    const [marks, tags, markTags, colorSettings] = await Promise.all([
      this.getAll("marks"),
      this.getAll("tags"),
      this.getAll("mark_tags"),
      this.getColorSettings()
    ]);
    return {
      marks: marks.length,
      tags: tags.length,
      relations: markTags.length,
      colors: colorSettings.colors.length
    };
  }

  async addTag(tag) {
    return this.put("tags", tag);
  }

  async deleteTag(id) {
    const allRelations = await this.getAll("mark_tags");
    const relations = allRelations.filter(item => item.tag_id === id);
    await this.tx(["tags", "mark_tags"], "readwrite", ([tagsStore, markTagsStore]) => {
      tagsStore.delete(id);
      relations.forEach(item => markTagsStore.delete(item.id));
    });
    return true;
  }

  async getTags() {
    return this.getAll("tags");
  }

  async getTagByName(name) {
    const tags = await this.getTags();
    return tags.find(tag => tag.name.toLowerCase() === name.toLowerCase());
  }

  async addTagToMark(markId, tagId) {
    const existing = (await this.getMarkTagsByMark(markId)).find(item => item.tag_id === tagId);
    if (existing) return existing;
    const item = { id: WAUtils.generateId(), mark_id: markId, tag_id: tagId, created_at: Date.now() };
    return this.put("mark_tags", item);
  }

  async removeTagFromMark(markId, tagId) {
    const existing = (await this.getMarkTagsByMark(markId)).find(item => item.tag_id === tagId);
    if (!existing) return false;
    await this.delete("mark_tags", existing.id);
    return true;
  }

  async getMarkTagsByMark(markId) {
    const all = await this.getAll("mark_tags");
    return all.filter(item => item.mark_id === markId);
  }

  async getTagsForMark(markId) {
    const [tags, markTags] = await Promise.all([this.getTags(), this.getMarkTagsByMark(markId)]);
    const tagIds = new Set(markTags.map(item => item.tag_id));
    return tags.filter(tag => tagIds.has(tag.id));
  }

  async getTagsWithCount() {
    const [tags, markTags] = await Promise.all([this.getTags(), this.getAll("mark_tags")]);
    return tags
      .map(tag => ({ ...tag, count: markTags.filter(item => item.tag_id === tag.id).length }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  async getColorSettings() {
    return (await this.get("color_settings", "default")) || WAUtils.getDefaultColorSettings();
  }

  async saveColorSettings(settings) {
    return this.put("color_settings", { ...settings, id: "default", updated_at: Date.now() });
  }

  async exportData() {
    const [marks, tags, markTags, colorSettings] = await Promise.all([
      this.getAll("marks"),
      this.getAll("tags"),
      this.getAll("mark_tags"),
      this.getColorSettings()
    ]);
    return {
      version: 1,
      exported_at: Date.now(),
      marks,
      tags,
      markTags,
      colorSettings,
      legacyAnnotations: this.toLegacyAnnotations(marks)
    };
  }

  async importData(data) {
    if (Array.isArray(data) && data.some(item => item && item.url && item.type)) {
      await this.importWebAnnotatorRecords(data);
      return true;
    }
    if (data && data.colors && data.defaultColorId) {
      await this.saveColorSettings({ ...data, id: "default" });
      return true;
    }
    if (this.isLegacyExport(data)) {
      await this.importLegacyData(data.legacyAnnotations || data);
      return true;
    }
    for (const tag of data.tags || []) await this.addTag(tag);
    for (const mark of data.marks || []) await this.addMark(mark);
    for (const markTag of data.markTags || []) await this.put("mark_tags", markTag);
    if (data.colorSettings) await this.saveColorSettings(data.colorSettings);
    if (data.legacyAnnotations) await this.importLegacyData(data.legacyAnnotations);
    return true;
  }

  isLegacyExport(data) {
    if (!data || typeof data !== "object") return false;
    if (data.legacyAnnotations) return true;
    if (data.version || data.marks || data.tags || data.markTags) return false;
    return Object.values(data).some(value => Array.isArray(value) && value.some(item => item && typeof item === "object" && item.type));
  }

  toLegacyAnnotations(marks) {
    return marks.reduce((result, mark) => {
      const pageUrl = mark.page_url || mark.url;
      if (!pageUrl) return result;
      if (!result[pageUrl]) result[pageUrl] = [];
      result[pageUrl].push({
        id: mark.id,
        type: mark.type === "page" ? "note" : "highlight",
        color: mark.color && mark.color.bg ? mark.color.bg : "#FFEB3B",
        text: mark.text || "",
        content: mark.description || mark.text || "",
        timestamp: mark.created_at || Date.now()
      });
      return result;
    }, {});
  }

  async importLegacyData(legacyData) {
    for (const [pageUrl, annotations] of Object.entries(legacyData || {})) {
      if (!Array.isArray(annotations)) continue;
      for (const annotation of annotations) {
        if (!annotation || !annotation.type) continue;
        const mark = this.legacyAnnotationToMark(pageUrl, annotation);
        if (mark) await this.addMark(mark);
      }
    }
  }

  legacyAnnotationToMark(pageUrl, annotation) {
    const text = annotation.text || annotation.content || "";
    if (!text && annotation.type !== "note") return null;
    const isHighlight = annotation.type === "highlight";
    const createdAt = annotation.timestamp || Date.now();
    return {
      id: annotation.id || WAUtils.generateId(),
      url: WAUtils.normalizeUrl(pageUrl),
      page_url: pageUrl,
      type: isHighlight ? "text" : "page",
      text: text || "旧插件备注",
      description: annotation.content && annotation.content !== text ? annotation.content : "",
      color: {
        id: `legacy-${(annotation.color || "#FFEB3B").replace("#", "")}`,
        name: "Legacy",
        bg: annotation.color || "#FFEB3B",
        text: WAUtils.getTextColor(annotation.color || "#FFEB3B"),
        style: "background"
      },
      select_info: isHighlight ? JSON.stringify([{
        type: "TextQuoteSelector",
        exact: text,
        prefix: "",
        suffix: "",
        extra: {}
      }]) : "[]",
      page_title: pageUrl,
      page_icon: "",
      is_favorite: false,
      link_url: "",
      created_at: createdAt,
      updated_at: createdAt
    };
  }

  async importWebAnnotatorRecords(records) {
    for (const record of records) {
      const mark = this.webAnnotatorRecordToMark(record);
      if (mark) await this.addMark(mark);
    }
  }

  webAnnotatorRecordToMark(record) {
    if (!record || !record.url) return null;
    const createdAt = record.created_at || record.createdAt || Date.now();
    const color = record.color || record.mark_color || WAUtils.DEFAULT_COLORS[0];
    const isDrawable = record.type === "tldraw" || record.type === "drawing" || record.tldraw_snapshot_key;
    const text = record.text || record.content || record.title || (isDrawable ? "旧版涂鸦/截图记录" : "旧版标注");
    return {
      id: record.id || WAUtils.generateId(),
      url: WAUtils.normalizeUrl(record.url),
      page_url: record.url,
      type: record.type === "link" ? "link" : record.type === "text" ? "text" : "page",
      text,
      description: this.buildImportedRecordDescription(record),
      color: {
        id: color.id || `imported-${(color.bg || color || "#2dd4bf").replace("#", "")}`,
        name: color.name || "Imported",
        bg: color.bg || color || "#2dd4bf",
        text: color.text || WAUtils.getTextColor(color.bg || color || "#2dd4bf"),
        style: color.style || "background"
      },
      select_info: this.normalizeImportedSelectInfo(record.select_info || record.selectInfo),
      page_title: record.page_title || record.pageTitle || record.url,
      page_icon: record.page_icon || record.pageIcon || "",
      is_favorite: Boolean(record.is_favorite || record.isFavorite),
      link_url: record.link_url || record.linkUrl || "",
      created_at: createdAt,
      updated_at: record.updated_at || record.updatedAt || createdAt
    };
  }

  buildImportedRecordDescription(record) {
    const parts = [];
    if (record.description) parts.push(record.description);
    if (record.type === "tldraw" || record.tldraw_snapshot_key) parts.push("从旧版备份导入：涂鸦/截图记录，本插件不渲染画布内容。");
    if (record.snapshot) parts.push(`截图资源：images/${record.snapshot}.png`);
    if (record.tldraw_snapshot_key) parts.push(`画布资源：tldraw/${record.tldraw_snapshot_key}.json`);
    return parts.join("\n");
  }

  normalizeImportedSelectInfo(selectInfo) {
    if (!selectInfo) return "[]";
    try {
      const parsed = typeof selectInfo === "string" ? JSON.parse(selectInfo) : selectInfo;
      if (Array.isArray(parsed)) return JSON.stringify(parsed);
      if (Array.isArray(parsed.select_info)) return JSON.stringify(parsed.select_info);
      return JSON.stringify([parsed]);
    } catch (error) {
      return "[]";
    }
  }
}

globalThis.WADatabase = new WebAnnotatorDatabase();
