(() => {
  "use strict";

  const CONFIG = Object.freeze({
    id: "hqnow-ptbr-v1",
    name: "HQ Now PT-BR",
    baseURL: "https://www.hq-now.com"
  });

  function sourceError(code, message, extra = {}) {
    return Object.assign(new Error(message), { code, ...extra });
  }

  function absoluteURL(value, base = CONFIG.baseURL) {
    try { return new URL(String(value), base).toString(); }
    catch { return null; }
  }

  function stripHTML(value) {
    return String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stableID(prefix, value) {
    let hash = 2166136261;
    for (const ch of String(value || "").trim().toLowerCase()) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  async function fetchText(url, options = {}) {
    const target = absoluteURL(url);
    if (!target?.startsWith("https://")) {
      throw sourceError("INVALID_URL", "URL HTTPS inválida.");
    }
    if (typeof globalThis.fetchv2 !== "function") {
      throw sourceError("RUNTIME_FETCH_UNAVAILABLE", "fetchv2 indisponível.");
    }
    const response = await globalThis.fetchv2(target, {
      method: options.method || "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        ...(options.headers || {})
      },
      body: options.body
    });
    const status = Number(response?.status || 0);
    const body = String(response?.body ?? response?.text ?? response?.data ?? response?.responseText ?? "");
    if (status < 200 || status >= 300) {
      throw sourceError("HTTP_ERROR", `HTTP ${status}`, { status, url: target });
    }
    if (!body.trim()) throw sourceError("EMPTY_RESPONSE", "Resposta vazia.", { url: target });
    return { url: target, status, body, response };
  }

  function todo(stage) {
    throw sourceError(
      "SOURCE_IMPLEMENTATION_REQUIRED",
      `${CONFIG.name}: falta implementar ${stage} para a estrutura atual do site.`,
      { stage, source: CONFIG.id }
    );
  }

  async function searchResults(query, page) {
    void query; void page;
    return todo("searchResults");
  }

  async function extractDetails(urlOrID) {
    void urlOrID;
    return todo("extractDetails");
  }

  async function extractChapters(urlOrID) {
    void urlOrID;
    return todo("extractChapters");
  }

  async function extractImages(chapterURLOrID) {
    void chapterURLOrID;
    return todo("extractImages");
  }

  globalThis.SynthetiqModule = Object.freeze({
    searchResults,
    extractDetails,
    extractChapters,
    extractImages
  });

  globalThis.__COMICS_PTBR_HELPERS__ = Object.freeze({
    absoluteURL,
    stripHTML,
    stableID,
    fetchText
  });
})();
