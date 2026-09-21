const CONFIG = Object.freeze({
  id: "hqnow-ptbr-v1",
  name: "HQ Now PT-BR",
  baseURL: "https://www.hq-now.com",
  graphQLURL: "https://admin.hq-now.com/graphql"
});async function fetchChapterReaderMetadata(chapterId) {
  const payload = await graphql(
    "getChapterById",
    `
      query getChapterById($chapterId: Int!) {
        getChapterById(chapterId: $chapterId) {
          name
          number
          oneshot
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
        ? value.url ||
          value.src ||
          value.image ||
          value.pictureUrl
        : "";

  const url = String(rawURL || "").trim();

  if (!url.startsWith("https://")) {
    return null;
  }

  return {
    url,
    headers: {
      Accept: "image/avif,image/webp,image/*,*/*",
      Referer: `${CONFIG.baseURL}/`
    },
    index
  };
}

async function resolveAuthorizedPages(context) {
  const chapterId = context?.chapterId;

  if (!Number.isFinite(Number(chapterId))) {
    throw sourceError(
      "INVALID_CHAPTER_ID",
      "ID da edição inválido."
    );
  }

  /*
   * METE AQUI O ENDPOINT AUTORIZADO
   * FORNECIDO PELO SYNTHETIQ.
   *
   * Exemplo estrutural:
   *
   * https://api.exemplo.com/reader/{chapterId}
   */

  const LICENSED_READER_ENDPOINT =
    "https://METE-AQUI-O-ENDPOINT-AUTORIZADO/{chapterId}";

  const endpoint = LICENSED_READER_ENDPOINT.replace(
    "{chapterId}",
    encodeURIComponent(String(chapterId))
  );

  const response = await globalThis.fetchv2(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Referer: `${CONFIG.baseURL}/`
    }
  });

  const status = Number(response?.status || 0);

  if (status < 200 || status >= 300) {
    throw sourceError(
      "READER_HTTP_ERROR",
      `Reader autorizado devolveu HTTP ${status}.`,
      {
        chapterId,
        status
      }
    );
  }

  let payload;

  try {
    payload =
      typeof response?.data === "object" &&
      response.data !== null
        ? response.data
        : JSON.parse(
            String(
              response?.body ??
              response?.text ??
              ""
            )
          );
  } catch {
    throw sourceError(
      "INVALID_READER_RESPONSE",
      "O reader autorizado devolveu uma resposta inválida.",
      { chapterId }
    );
  }

  /*
   * Suporta os formatos mais comuns:
   *
   * { pages: [...] }
   * { images: [...] }
   * { data: { pages: [...] } }
   * [...]
   */

  const pages =
    Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.pages)
        ? payload.pages
        : Array.isArray(payload?.images)
          ? payload.images
          : Array.isArray(payload?.data?.pages)
            ? payload.data.pages
            : [];

  return pages;
}

async function extractImages(chapterURLOrID) {
  const chapterId = parseChapterID(chapterURLOrID);

  const chapter = await fetchChapterReaderMetadata(
    chapterId
  );

  const rawPages = await resolveAuthorizedPages({
    chapterId,
    chapter,
    chapterURLOrID: String(chapterURLOrID || "")
  });

  if (!Array.isArray(rawPages) || !rawPages.length) {
    throw sourceError(
      "NO_READER_PAGES",
      "O reader autorizado não devolveu páginas.",
      {
        chapterId,
        chapterName: String(chapter?.name || ""),
        chapterNumber: String(chapter?.number || ""),
        source: CONFIG.id
      }
    );
  }

  const pages = rawPages
    .map((page, index) =>
      normalizeReaderPage(page, index)
    )
    .filter(Boolean);

  if (!pages.length) {
    throw sourceError(
      "NO_VALID_IMAGES",
      "O reader não recebeu URLs HTTPS válidas.",
      {
        chapterId,
        source: CONFIG.id
      }
    );
  }

  return pages;
}
