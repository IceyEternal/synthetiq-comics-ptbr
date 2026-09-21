(() => {
  "use strict";

  const CONFIG = Object.freeze({
    id: "hqnow-ptbr-v1",
    name: "HQ Now PT-BR",
    baseURL: "https://www.hq-now.com",
    graphQLURL: "https://admin.hq-now.com/graphql"
  });

  function sourceError(code, message, extra = {}) {
    return Object.assign(new Error(message), { code, ...extra });
  }

  function absoluteURL(value, base = CONFIG.baseURL) {
    try { return new URL(String(value), base).toString(); }
    catch { return null; }
  }

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase();
  }

  function mapStatus(value) {
    const text = String(value || "").trim();
    if (/conclu[ií]do|finalizado|completo/i.test(text)) return "Completo";
    if (/andamento|publica[cç][aã]o|ongoing/i.test(text)) return "Em publicação";
    return text || "Desconhecido";
  }

  function parseComicID(value) {
    const text = String(value || "");
    const match =
      text.match(/\/hq\/(\d+)(?:\/|$)/i) ||
      text.match(/^\s*(\d+)\s*$/);
    if (!match) {
      throw sourceError("INVALID_COMIC_ID", "Identificador HQ Now inválido.");
    }
    return Number(match[1]);
  }

  function parseChapterID(value) {
    const text = String(value || "");
    const match =
      text.match(/\/chapter\/(\d+)(?:\/|$)/i) ||
      text.match(/^\s*(\d+)\s*$/);
    if (!match) {
      throw sourceError("INVALID_CHAPTER_ID", "Identificador de edição HQ Now inválido.");
    }
    return Number(match[1]);
  }

  async function requestJSON(url, options = {}) {
    const target = absoluteURL(url, CONFIG.graphQLURL);
    if (!target?.startsWith("https://")) {
      throw sourceError("INVALID_URL", "URL HTTPS inválida.");
    }

    if (typeof globalThis.fetchv2 !== "function") {
      throw sourceError("RUNTIME_FETCH_UNAVAILABLE", "fetchv2 indisponível.");
    }

    const response = await globalThis.fetchv2(target, {
      method: options.method || "GET",
      headers: {
        Accept: "application/json",
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
      throw sourceError("HTTP_ERROR", `HQ Now: HTTP ${status}`, {
        status,
        url: target
      });
    }

    let parsed;
    try {
      parsed = typeof response?.data === "object" && response.data !== null
        ? response.data
        : JSON.parse(body);
    } catch {
      throw sourceError("INVALID_JSON", "HQ Now devolveu JSON inválido.", {
        url: target
      });
    }

    if (Array.isArray(parsed?.errors) && parsed.errors.length) {
      const message = parsed.errors
        .map(error => String(error?.message || "Erro GraphQL"))
        .join("; ");
      throw sourceError("GRAPHQL_ERROR", message, {
        url: target,
        errors: parsed.errors
      });
    }

    return parsed;
  }

  async function graphql(operationName, query, variables = {}) {
    const payload = JSON.stringify({
      operationName,
      query,
      variables
    });

    return requestJSON(CONFIG.graphQLURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: payload
    });
  }

  function comicItem(item) {
    const id = Number(item?.id);
    const title = String(item?.name || "").trim();

    if (!Number.isFinite(id) || !title) return null;

    const href = `${CONFIG.baseURL}/hq/${id}/${slugify(title)}`;

    return {
      id: href,
      href,
      url: href,
      title,
      image: String(item?.hqCover || item?.cover || ""),
      status: mapStatus(item?.status)
    };
  }

  async function searchResults(query, page = 1) {
    const text = String(query || "").trim();
    void page;

    if (!text) return { items: [], hasMore: false };

    const payload = await graphql(
      "getHqsByName",
      `
        query getHqsByName($name: String!) {
          getHqsByName(name: $name) {
            id
            name
            editoraId
            status
            publisherName
            impressionsCount
            hqCover
          }
        }
      `,
      { name: text }
    );

    const rows = Array.isArray(payload?.data?.getHqsByName)
      ? payload.data.getHqsByName
      : [];

    const seen = new Set();
    const items = [];

    for (const row of rows) {
      const mapped = comicItem(row);
      if (!mapped || seen.has(mapped.id)) continue;
      seen.add(mapped.id);
      items.push(mapped);
    }

    return { items, hasMore: false };
  }

  async function fetchComicDetails(value) {
    const id = parseComicID(value);

    const payload = await graphql(
      "getHqsById",
      `
        query getHqsById($id: Int!) {
          getHqsById(id: $id) {
            id
            name
            synopsis
            editoraId
            status
            publisherName
            hqCover
            impressionsCount
            capitulos {
              name
              id
              number
            }
          }
        }
      `,
      { id }
    );

    const rows = Array.isArray(payload?.data?.getHqsById)
      ? payload.data.getHqsById
      : [];

    const comic = rows[0];
    if (!comic || !comic.name) {
      throw sourceError("COMIC_NOT_FOUND", "HQ Now não devolveu esta HQ.", { id });
    }

    return comic;
  }

  async function extractDetails(value) {
    const comic = await fetchComicDetails(value);
    const id = Number(comic.id);
    const title = String(comic.name || "").trim();
    const href = `${CONFIG.baseURL}/hq/${id}/${slugify(title)}`;
    const publisher = String(comic.publisherName || "").trim();

    return {
      id: href,
      href,
      url: href,
      title,
      description: String(comic.synopsis || "").trim(),
      image: String(comic.hqCover || ""),
      author: publisher,
      authors: publisher ? [publisher] : [],
      genres: publisher ? [publisher] : [],
      status: mapStatus(comic.status),
      publisher
    };
  }

  function chapterFromObject(chapter, comic) {
    const chapterId = Number(chapter?.id);
    if (!Number.isFinite(chapterId)) return null;

    const comicId = Number(comic.id);
    const comicTitle = String(comic.name || "").trim();
    const chapterName = String(chapter?.name || "").trim();
    const rawNumber = String(chapter?.number || "").trim();
    const number = Number(rawNumber);

    const title =
      `#${rawNumber || "?"}` +
      (chapterName ? ` - ${chapterName}` : "");

    const href =
      `${CONFIG.baseURL}/hq-reader/${comicId}/${slugify(comicTitle)}` +
      `/chapter/${chapterId}/page/1`;

    return {
      id: href,
      href,
      url: href,
      title,
      number: Number.isFinite(number) ? number : null,
      releaseDate: null,
      language: "pt-BR",
      type: "comic"
    };
  }

  async function extractChapters(value) {
    const comic = await fetchComicDetails(value);
    const rows = Array.isArray(comic?.capitulos) ? comic.capitulos : [];

    const seen = new Set();
    const chapters = [];

    for (const row of rows) {
      const mapped = chapterFromObject(row, comic);
      if (!mapped || seen.has(mapped.id)) continue;
      seen.add(mapped.id);
      chapters.push(mapped);
    }

    if (!chapters.length) {
      throw sourceError(
        "NO_CHAPTERS_FOUND",
        "HQ Now não devolveu edições para esta HQ.",
        { comicID: comic.id }
      );
    }

    return chapters.reverse();
  }

  async function fetchChapterReaderMetadata(chapterId) {
    const payload = await graphql(
      "getChapterById",
      `
        query getChapterById($chapterId: Int!) {
          getChapterById(chapterId: $chapterId) {
            name
            number
            oneshot
            pictures {
              pictureUrl
            }
          }
        }
      `,
      { chapterId }
    );

    const chapter = payload?.data?.getChapterById;
    if (!chapter) {
      throw sourceError(
        "CHAPTER_NOT_FOUND",
        "HQ Now não devolveu esta edição.",
        { chapterId }
      );
    }

    return chapter;
  }

  function normalizeReaderPage(value, index) {
    const rawURL =
      typeof value === "string"
        ? value
        : value && typeof value === "object"
          ? value.url || value.src || value.image
          : "";

    const url = String(rawURL || "").trim();
    if (!url.startsWith("https://")) return null;

    return {
      url,
      headers: {
        Accept: "image/avif,image/webp,image/*,*/*"
      },
      index
    };
  }

  async function resolveAuthorizedPages(context) {
    const chapter = context?.chapter;
    const pictures = Array.isArray(chapter?.pictures) ? chapter.pictures : [];

    return pictures
      .map(pic => pic?.pictureUrl)
      .filter(url => typeof url === "string" && url.trim().length > 0);
  }

  async function extractImages(chapterURLOrID) {
    const chapterId = parseChapterID(chapterURLOrID);
    const chapter = await fetchChapterReaderMetadata(chapterId);

    const rawPages = await resolveAuthorizedPages({
      chapterId,
      chapter,
      chapterURLOrID: String(chapterURLOrID || "")
    });

    if (!Array.isArray(rawPages) || !rawPages.length) {
      throw sourceError(
        "READER_SOURCE_REQUIRED",
        "A edição existe no HQ Now, mas ainda falta ligar a origem das páginas.",
        {
          chapterId,
          chapterName: String(chapter?.name || ""),
          chapterNumber: String(chapter?.number || ""),
          source: CONFIG.id
        }
      );
    }

    const pages = rawPages
      .map((page, index) => normalizeReaderPage(page, index))
      .filter(Boolean);

    if (!pages.length) {
      throw sourceError(
        "NO_VALID_IMAGES",
        "A origem do reader não devolveu URLs HTTPS válidas.",
        { chapterId, source: CONFIG.id }
      );
    }

    return pages;
  }

  globalThis.SynthetiqModule = Object.freeze({
    searchResults,
    extractDetails,
    extractChapters,
    extractImages
  });
})();
