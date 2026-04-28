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
  const metadataSignals = [
    styleReferenceKey(source),
    source.docSource,
    source.chunkSource,
    source.sourceType,
    source.source_type,
    source.collection,
    source.folder,
    source.workspace_slug,
    source.tag,
    source.category,
    source.label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    metadataSignals.startsWith(STYLE_REFERENCE_PREFIX) ||
    metadataSignals.includes("style_ref_financial-info") ||
    /\bstyle(?:[_\s-]+ref(?:erence)?)\b/i.test(metadataSignals) ||
    metadataSignals.includes("completed financial information chapter")
  );
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
  const sanitized = cleanText(txt)
    .replace(/\u00a0/g, " ")
    .replace(
      /\b(?:The following table sets out|The table below (?:sets out|summaris(?:es|es))|Set out below is)\b[^.\n]*[.\n]?/gi,
      "[TABLE_INTRO_PATTERN]. "
    )
    .replace(
      /\bThe selected financial information\b[^.\n]*[.\n]?/gi,
      ""
    )
    .replace(
      /\b(?:This should be read together with|The following discussion should be read together with)\b[^.\n]*[.\n]?/gi,
      "[READING_REFERENCE_PATTERN]. "
    )
    .replace(/\bReaders are referred to\b[^.\n]*[.\n]?/gi, "")
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

  return sanitizeStyleTablePatterns(sanitized);
}

function sanitizeStyleTableCell(cell = "", index = 0) {
  const trimmed = String(cell || "").trim();
  if (!trimmed) return "";
  if (/^:?-{3,}:?$/.test(trimmed)) return "---";
  if (
    /\[table_intro_pattern\]|\[reading_reference_pattern\]|\[placeholder\]/i.test(
      trimmed
    )
  ) {
    return trimmed;
  }
  if (/\[currency_unit\]/i.test(trimmed)) return "[UNIT]";
  if (
    /\b(?:fye|fpe|fy)\b/i.test(trimmed) ||
    /\[year\]|\[date\]|\[audited\]|\[unaudited\]/i.test(trimmed)
  ) {
    return "[PERIOD]";
  }
  if (/\[note\]|\[section\]/i.test(trimmed)) return "[NOTE]";
  return index === 0 ? "[ROW_LABEL]" : "[VALUE]";
}

function sanitizeStyleTableLine(line = "") {
  const raw = String(line || "");
  if (!raw.includes("|")) return raw;

  const parts = raw.split("|");
  if (parts.length < 3) return raw;

  const innerCells = parts.slice(1, -1);
  const sanitizedCells = innerCells.map((cell, index) =>
    sanitizeStyleTableCell(cell, index)
  );

  return `| ${sanitizedCells.join(" | ")} |`;
}

function sanitizeStyleTablePatterns(text = "") {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => sanitizeStyleTableLine(line))
    .join("\n")
    .replace(/(?:\| --- )+\|/g, (match) => match.replace(/---/g, "---"));
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
  return `[Style reference - non-factual | ${loc || "section: n/a"}]`;
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
  sanitizeStyleTablePatterns,
  styleReferenceKey,
  formatStyleReferenceSnippets,
};
