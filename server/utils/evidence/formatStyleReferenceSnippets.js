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

  const loc = [sheet, table, rows].filter(Boolean).join(", ");
  return `[Style reference | ${loc || "section: n/a"}]`;
}

function formatStyleReferenceSnippets(sources = [], opts = {}) {
  const { maxSnippets = 3, maxCharsPerSnippet = 1200 } = opts;
  const picked = [];
  const seen = new Set();

  for (const source of Array.isArray(sources) ? sources : []) {
    const text = cleanText(source?.text);
    if (!text || !isStyleReferenceSource(source)) continue;

    const key = styleReferenceKey(source).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    picked.push({
      ...source,
      __cleanText: sanitizeStyleReferenceText(text),
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
  isStyleReferenceSource,
  sanitizeStyleReferenceText,
  styleReferenceKey,
  formatStyleReferenceSnippets,
};
