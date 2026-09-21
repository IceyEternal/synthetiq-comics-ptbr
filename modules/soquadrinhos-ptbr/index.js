(() => {
  "use strict";

  const CONFIG = Object.freeze({
    id: "soquadrinhos-ptbr-v1",
    name: "Só Quadrinhos PT-BR",
    baseURL: "https://site.soquadrinhos.com"
  });

  function sourceError(code, message, extra = {}) {
    return Object.assign(new Error(message), { code, ...extra });
  }

  function decodeEntities(value) {
    return String(value || "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n) || 0))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16) || 0));
  }

  function stripHTML(value) {
    return decodeEntities(String(value || ""))
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function htmlLines(value) {
    return decodeEntities(String(value || ""))
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<(?:br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(?:p|div|li|tr|td|th|h[1-6]|section|article|table|ul|ol)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .split(/\n+/)
      .map(line => line.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function absoluteURL(value, base = CONFIG.baseURL) {
    try { return new URL(String(value), base).toString(); }
    catch { return null; }
  }

  function stableID(prefix, value) {
    let hash = 2166136261;
    for (const ch of String(value || "").trim().toLowerCase()) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function attr(tag, name) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = String(tag || "").match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"));
    return match ? decodeEntities(match[2]) : "";
  }

  function metaContent(html, key) {
    const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta\\b[^>]*(?:property|name)=(["'])${escaped}\\1[^>]*content=(["'])([^"']*)\\2`, "i"),
      new RegExp(`<meta\\b[^>]*content=(["'])([^"']*)\\1[^>]*(?:property|name)=(["'])${escaped}\\3`, "i")
    ];
    for (const pattern of patterns) {
      const match = String(html || "").match(pattern);
      if (match) return decodeEntities(match[3] || match[2] || "");
    }
    return "";
  }

  function firstImage(html) {
    const tag = (String(html || "").match(/<img\b[^>]*>/i) || [])[0] || "";
    return absoluteURL(attr(tag, "data-src") || attr(tag, "data-lazy-src") || attr(tag, "src")) || "";
  }

  function sameSite(url) {
    try {
      const parsed = new URL(url);
      return parsed.hostname === "site.soquadrinhos.com" || parsed.hostname.endsWith(".soquadrinhos.com");
    } catch {
      return false;
    }
  }

  function isContentURL(url) {
    if (!sameSite(url)) return false;
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/\/+$/, "") || "/";
      if (path === "/") return false;
      return !/^\/(?:category|tag|author|page|wp-|links-quebrados|parceiros|recrutamento)(?:\/|$)/i.test(path);
    } catch {
      return false;
    }
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
    const body = String(
      response?.body ??
      response?.text ??
      response?.data ??
      response?.responseText ??
      ""
    );

    if (status < 200 || status >= 300) {
      throw sourceError("HTTP_ERROR", `HTTP ${status}`, { status, url: target });
    }
    if (!body.trim()) {
      throw sourceError("EMPTY_RESPONSE", "Resposta vazia.", { url: target });
    }

    return { url: target, status, body, response };
  }

  function articleBlocks(html) {
    const blocks = String(html || "").match(/<article\b[\s\S]*?<\/article>/gi) || [];
    return blocks.length ? blocks : [String(html || "")];
  }

  function headingLink(block) {
    const patterns = [
      /<h[1-6]\b[^>]*>[\s\S]*?<a\b[^>]*href=(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h[1-6]>/i,
      /<a\b[^>]*rel=(["'])[^"']*bookmark[^"']*\1[^>]*href=(["'])([^"']+)\2[^>]*>([\s\S]*?)<\/a>/i,
      /<a\b[^>]*href=(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/a>/i
    ];

    for (const pattern of patterns) {
      const match = String(block || "").match(pattern);
      if (!match) continue;
      const href = match[2] || match[3] || "";
      const titleHTML = match[3] || match[4] || "";
      const url = absoluteURL(href);
      const title = stripHTML(titleHTML);
      if (url && title && isContentURL(url)) return { url, title };
    }
    return null;
  }

  async function searchResults(query, page = 1) {
    const text = String(query || "").trim();
    if (!text) return { items: [], hasMore: false };

    const currentPage = Math.max(1, Number(page) || 1);
    const searchURL = `${CONFIG.baseURL}/?s=${encodeURIComponent(text)}&paged=${currentPage}`;
    const { body } = await fetchText(searchURL);

    const seen = new Set();
    const items = [];

    for (const block of articleBlocks(body)) {
      const link = headingLink(block);
      if (!link || seen.has(link.url)) continue;

      const imageTag = (block.match(/<img\b[^>]*>/i) || [])[0] || "";
      const image = absoluteURL(
        attr(imageTag, "data-src") ||
        attr(imageTag, "data-lazy-src") ||
        attr(imageTag, "src")
      ) || "";

      items.push({
        id: link.url,
        href: link.url,
        url: link.url,
        title: link.title,
        image,
        status: ""
      });
      seen.add(link.url);
    }

    const hasMore =
      /rel=(["'])next\1/i.test(body) ||
      /class=(["'])[^"']*(?:next|nav-next)[^"']*\1/i.test(body) ||
      new RegExp(`(?:paged=|/page/)${currentPage + 1}(?:\\D|$)`, "i").test(body);

    return { items, hasMore };
  }

  function fieldFromHTML(html, label) {
    const wanted = String(label).trim().toLowerCase();

    for (const row of String(html || "").match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
      const cells = [...row.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)]
        .map(match => stripHTML(match[1]))
        .filter(Boolean);
      if (cells.length >= 2 && cells[0].toLowerCase() === wanted) {
        return cells.slice(1).join(" ").trim();
      }
    }

    const lines = htmlLines(html);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const lower = line.toLowerCase();
      if (lower === wanted) return lines[i + 1] || "";
      if (lower.startsWith(`${wanted}:`)) return line.slice(label.length + 1).trim();
      if (lower.startsWith(`${wanted} `)) return line.slice(label.length).trim();
    }

    return "";
  }

  function pageTitle(html) {
    const heading = String(html || "").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    return stripHTML(heading?.[1] || "") || metaContent(html, "og:title").replace(/\s+[–-]\s+S[oó] ?Quadrinhos.*$/i, "").trim();
  }

  function mapStatus(value) {
    const text = String(value || "").trim();
    if (/andamento/i.test(text)) return "Em publicação";
    if (/cancelad|terminad|complet/i.test(text)) return "Completo";
    return text || "Desconhecido";
  }

  async function extractDetails(value) {
    const href = absoluteURL(value);
    if (!href || !isContentURL(href)) {
      throw sourceError("INVALID_TITLE_URL", "URL de título inválida.");
    }

    const { body } = await fetchText(href);

    const title = fieldFromHTML(body, "Nome") || pageTitle(body) || "Sem título";
    const originalTitle = fieldFromHTML(body, "Nome Original");
    const publisher = fieldFromHTML(body, "Editora");
    const publication = fieldFromHTML(body, "Publicação");
    const status = fieldFromHTML(body, "Status");
    const issues = fieldFromHTML(body, "Edições");
    const description = fieldFromHTML(body, "Sinopse") || metaContent(body, "description") || metaContent(body, "og:description");
    const image = absoluteURL(metaContent(body, "og:image")) || firstImage(body);

    return {
      id: href,
      href,
      url: href,
      title,
      description: String(description || "").trim(),
      image: image || "",
      author: "",
      authors: [],
      genres: [publisher, publication].filter(Boolean),
      status: mapStatus(status),
      originalTitle: originalTitle || "",
      publisher: publisher || "",
      publication: publication || "",
      issueCount: issues || ""
    };
  }

  function extractIssueLines(html) {
    const lines = htmlLines(html);
    const stopWords = /^(?:nota|acessar|coment[aá]rios?|links quebrados|parceiros|recrutamento)$/i;

    let start = lines.findIndex(line => /ordem de leitura/i.test(line));
    if (start < 0) start = lines.findIndex(line => /^link direto$/i.test(line));
    if (start < 0) start = 0;

    const results = [];
    const seen = new Set();

    for (let i = start + 1; i < lines.length && results.length < 2000; i += 1) {
      const line = lines[i].trim();
      if (!line) continue;
      if (results.length && stopWords.test(line)) break;

      let match = line.match(/^(\d{1,4})\s+(.{2,240})$/);
      if (!match && /#\s*\d+/i.test(line)) {
        match = [line, String(results.length + 1), line];
      }
      if (!match) continue;

      const order = Number(match[1]);
      const title = String(match[2]).replace(/\s+/g, " ").trim();
      if (!title || seen.has(title.toLowerCase())) continue;

      results.push({
        order: Number.isFinite(order) ? order : results.length + 1,
        title
      });
      seen.add(title.toLowerCase());
    }

    return results;
  }

  async function extractChapters(value) {
    const href = absoluteURL(value);
    if (!href || !isContentURL(href)) {
      throw sourceError("INVALID_TITLE_URL", "URL de título inválida.");
    }

    const { body } = await fetchText(href);
    const entries = extractIssueLines(body);

    if (!entries.length) {
      throw sourceError(
        "NO_ISSUES_FOUND",
        "Não foi possível detetar a lista de edições nesta página.",
        { url: href }
      );
    }

    return entries.map((entry, index) => {
      const numberMatch = entry.title.match(/#\s*0*(\d+(?:\.\d+)?)/);
      const issueNumber = numberMatch ? Number(numberMatch[1]) : null;
      const ref = `${href.split("#")[0]}#sq-issue-${String(index + 1).padStart(4, "0")}`;

      return {
        id: ref,
        href: ref,
        url: ref,
        title: entry.title,
        number: Number.isFinite(issueNumber) ? issueNumber : entry.order,
        releaseDate: null,
        language: "pt-BR",
        type: "comic"
      };
    });
  }

  async function extractImages(chapterURLOrID) {
    void chapterURLOrID;
    throw sourceError(
      "SOURCE_IMPLEMENTATION_REQUIRED",
      `${CONFIG.name}: falta implementar extractImages para a origem concreta das páginas.`,
      { stage: "extractImages", source: CONFIG.id }
    );
  }

  globalThis.SynthetiqModule = Object.freeze({
    searchResults,
    extractDetails,
    extractChapters,
    extractImages
  });
})();
