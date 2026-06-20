(function initUtils(global) {
  const DEFAULT_COLORS = [
    { id: "color-12", name: "Teal",   bg: "#5ee5e5", text: "#000000" },
    { id: "color-1", name: "Gold",    bg: "#facc15", text: "#000000" },
    { id: "color-2", name: "Coral",   bg: "#fb923c", text: "#000000" },
    { id: "color-3", name: "Rose",    bg: "#fb7185", text: "#000000" },
    { id: "color-4", name: "Lavender",bg: "#a78bfa", text: "#ffffff" },
    { id: "color-5", name: "Indigo",  bg: "#818cf8", text: "#ffffff" },
    { id: "color-6", name: "Sky",     bg: "#38bdf8", text: "#000000" },
    { id: "color-7", name: "Emerald", bg: "#34d399", text: "#000000" },
    { id: "color-8", name: "Lime",    bg: "#a3e635", text: "#000000" },
    { id: "color-9", name: "Amber",   bg: "#fbbf24", text: "#000000" },
    { id: "color-10", name: "Slate",  bg: "#94a3b8", text: "#000000" },
    { id: "color-11", name: "Navy",   bg: "#6366f1", text: "#ffffff" }
  ];

  function generateId() {
    const random = crypto.getRandomValues(new Uint8Array(10));
    return `${Date.now().toString(36)}-${Array.from(random, b => b.toString(36).padStart(2, "0")).join("")}`;
  }

  function normalizeUrl(url) {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      parsed.search = "";
      return `${parsed.origin}${parsed.pathname}`;
    } catch (error) {
      return url;
    }
  }

  function getTextColor(bgColor) {
    const hex = bgColor.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? "#ffffff" : "#000000";
  }

  function getDefaultColorSettings() {
    return {
      id: "default",
      colors: DEFAULT_COLORS,
      defaultColorId: "color-12",
      defaultStyle: "background",
      updated_at: Date.now()
    };
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      const chromeApi = global && global.chrome;
      const runtime = chromeApi && chromeApi.runtime;
      const send = runtime && runtime.sendMessage;
      if (typeof send !== "function") {
        reject(new Error("Extension runtime is unavailable. Please reload this page."));
        return;
      }
      try {
        send.call(runtime, message, response => {
          const error = runtime && runtime.lastError;
          if (error) {
            reject(error);
            return;
          }
          if (response && response.success === false) {
            reject(new Error(response.error || "Unknown extension error"));
            return;
          }
          resolve(response ? response.data : undefined);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  global.WAUtils = {
    DEFAULT_COLORS,
    generateId,
    normalizeUrl,
    getTextColor,
    getDefaultColorSettings,
    sendMessage
  };
})(globalThis);
