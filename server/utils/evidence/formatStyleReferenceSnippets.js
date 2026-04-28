const STYLE_REFERENCE_PREFIX = "style_ref_financial-info_";

function styleReferenceKey(source = {}) {
  return (
    source.docTitle ||
    source.title ||
    source.filename ||
    source.docSource ||
    source.sourceDocument ||
    ""
  )
    .toString()
    .trim();
}

function isStyleReferenceSource(source = {}) {
  return styleReferenceKey(source).toLowerCase().startsWith(STYLE_REFERENCE_PREFIX);
}

function cleanText(txt = "") {
  return String(txt || "")
    .replace(/<document_metadata>[\s\S]*?<\/document_metadata>\s*/g, "")
    .replace(/\s+\n/g, "\n")
    .trim();
}

function normalizeSource(source = {}) {
  const metadata =
    source && source.metadata && typeof source.metadata === "object"
      ? source.metadata
      : {};
  const merged = { ...metadata, ...source };
  delete merged.metadata;
  const text = cleanText(
    source.text ||
      source.pageContent ||
      metadata.text ||
      metadata.pageContent ||
      ""
  );

  return {
    ...merged,
    text,
    __cleanText: text,
  };
}

function sanitizeStyleReferenceText(txt = "") {
  return cleanText(txt)
    .replace(/\u00a0/g, " ")
    .replace(/●|\[●\]/g, "[PLACEHOLDER]")
    .replace(
      /\b[A-Z][A-Za-z&.\-]*(?:\s+[A-Z][A-Za-z&.\-]*){0,4}\s+(?:Berhad|Bhd|Sdn\.?\s*Bhd\.?|Ltd\.?|Limited|Inc\.?|Corp\.?|Corporation|PLC)\b/g,
      "[ENTITY]"
    )
    .replace(/\bSection\s+\d+(?:\.\d+)*/gi, "Section [SECTION]")
    .replace(/\bNotes?\s+\d+(?:\.\d+)*/gi, "Note [NOTE]")
    .replace(/<sup>\(\d+\)<\/sup>/gi, "<sup>([NOTE])</sup>")
    .replace(/\b(?:FYE|FPE|FY)\s+20\d{2}\b/gi, (match) =>
      match.replace(/20\d{2}/, "[YEAR]")
    )
    .replace(
      /\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/gi,
      "[DATE]"
    )
    .replace(
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
      "[DATE]"
    )
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "[DATE]")
    .replace(
      /\b(?:RM|MYR|USD|US\$|SGD|EUR|GBP)\s?[0-9][0-9,]*(?:\.\d+)?(?:\s?(?:million|billion|thousand|m))?\b/gi,
      "[CURRENCY_AMOUNT]"
    )
    .replace(/\b(?:RM|MYR|USD|US\$|SGD|EUR|GBP)[’']?0{3}\b/gi, "[CURRENCY_UNIT]")
    .replace(/\b\d+(?:\.\d+)?%/g, "[PERCENTAGE]")
    .replace(/\b20\d{2}\b/g, "[YEAR]")
    .replace(/\b\d+\.\d+(?:\.\d+)*\b/g, "[SECTION_NUMBER]")
    .replace(/\b\d[\d,]*(?:\.\d+)?\b/g, "[NUMBER]")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function refLine(source = {}) {
  const sheet = source.sheet ? `sheet:${source.sheet}` : null;
  const table = source.table_index ? `table:${source.table_index}` : null;
  const rows =
    source.chunk_row_start && source.chunk_row_end
      ? `rows:${source.chunk_row_start}-${source.chunk_row_end}`
      : null;
  const page = source.page_number ? `page:${source.page_number}` : null;
  const section = source.source_section
    ? `section:${source.source_section}`
    : null;

  const loc = [sheet, table, rows, page, section].filter(Boolean).join(", ");
  return `[Style reference | ${loc || "section: n/a"}]`;
}

function normalizeTerms(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/^\s*\d+(?:\.\d+)*\s+/, "")
    .replace(/\b(?:consolidated|combined|our|group|section|statements?|of|and|the)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function lineStartIndexes(text = "") {
  const lines = String(text || "").split(/\r?\n/);
  const indexed = [];
  let cursor = 0;
  for (const line of lines) {
    indexed.push({ line, index: cursor });
    cursor += line.length + 1;
  }
  return indexed;
}

function scoreHeadingLine(line = "", promptContext = {}) {
  if (!/^\s*\d{1,2}(?:\.\d+){0,3}\s+/.test(line)) return 0;

  const targetTerms = new Set(normalizeTerms(promptContext.heading));
  const lineTerms = new Set(normalizeTerms(line));
  let overlap = 0;
  for (const term of targetTerms) {
    if (lineTerms.has(term)) overlap += 1;
  }

  const targetSuffix = (promptContext.sectionNumber || "")
    .split(".")
    .slice(1)
    .join(".");
  const sourceSuffix = (line.match(/^\s*\d{1,2}((?:\.\d+){0,3})/)?.[1] || "")
    .replace(/^\./, "");
  if (targetSuffix && sourceSuffix === targetSuffix) overlap += 2;

  return overlap;
}

function extractRelevantStyleText(source = {}, promptContext = {}, maxChars = 1200) {
  const text = cleanText(source.text || "");
  if (!text || !promptContext?.heading) return text;

  const indexedLines = lineStartIndexes(text);
  const scored = indexedLines
    .map(({ line, index }) => ({
      line,
      index,
      score: scoreHeadingLine(line, promptContext),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (!scored.length) return text;

  const start = scored[0].index;
  const nextHeading = indexedLines.find(
    ({ index, line }) =>
      index > start && /^\s*\d{1,2}(?:\.\d+){0,3}\s+/.test(line)
  );
  const end = nextHeading ? nextHeading.index : start + maxChars;
  return text.slice(start, Math.min(end, start + maxChars * 2)).trim();
}

function formatStyleReferenceSnippets(sources = [], opts = {}) {
  const {
    maxSnippets = 3,
    maxCharsPerSnippet = 1200,
    promptContext = null,
  } = opts;

  const candidates = (Array.isArray(sources) ? sources : [])
    .map(normalizeSource)
    .filter((source) => source.__cleanText && isStyleReferenceSource(source))
    .map((source) => {
      const relevantText = extractRelevantStyleText(
        source,
        promptContext,
        maxCharsPerSnippet
      );
      return {
        ...source,
        __relevantText: relevantText,
        __score: promptContext
          ? scoreHeadingLine(relevantText.split(/\r?\n/)[0] || "", promptContext)
          : 0,
      };
    })
    .sort((a, b) => b.__score - a.__score);

  const picked = [];
  const seen = new Set();
  for (const source of candidates) {
    const locationKey = [
      styleReferenceKey(source).toLowerCase(),
      source.page_number || "",
      source.source_section || "",
      source.__relevantText.slice(0, 120).toLowerCase(),
    ].join("|");
    if (seen.has(locationKey)) continue;
    seen.add(locationKey);
    picked.push({
      ...source,
      __cleanText: sanitizeStyleReferenceText(source.__relevantText),
    });
    if (picked.length >= maxSnippets) break;
  }

  return picked
    .map((source) => {
      const txt = source.__cleanText.slice(0, maxCharsPerSnippet);
      return `${refLine(source)}\n${txt}`;
    })
    .join("\n\n");
}

module.exports = {
  STYLE_REFERENCE_PREFIX,
  cleanText,
  extractRelevantStyleText,
  isStyleReferenceSource,
  sanitizeStyleReferenceText,
  styleReferenceKey,
  formatStyleReferenceSnippets,
};
