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

function refLine(source = {}) {
  const doc =
    styleReferenceKey(source) ||
    source.filename ||
    source.docSource ||
    "Unknown style reference";

  const sheet = source.sheet ? `sheet:${source.sheet}` : null;
  const table = source.table_index ? `table:${source.table_index}` : null;
  const rows =
    source.chunk_row_start && source.chunk_row_end
      ? `rows:${source.chunk_row_start}-${source.chunk_row_end}`
      : null;

  const loc = [sheet, table, rows].filter(Boolean).join(", ");
  return `[${doc} | ${loc || "section: n/a"}]`;
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
      __cleanText: text,
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
  styleReferenceKey,
  formatStyleReferenceSnippets,
};
