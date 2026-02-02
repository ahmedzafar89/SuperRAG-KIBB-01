function formatEvidenceSnippets(sources = [], opts = {}) {
  const {
    maxSnippets = 12,
    maxCharsPerSnippet = 1800,
  } = opts;

  // Heuristic: prefer statement/pivot tables over transaction dumps
  function scoreSource(s) {
    const sheet = (s.sheet || s.docTitle || "").toLowerCase();
    const cols = Array.isArray(s.columns) ? s.columns.join(" | ").toLowerCase() : "";
    const text = (s.text || "").toLowerCase();

    let score = (s.score ?? 0);

    // boost financial statement-ish content
    if (sheet.includes("revenue") || sheet.includes("cos") || sheet.includes("gross")) score += 0.15;
    if (text.includes("fy202") || text.includes("fye")) score += 0.10;
    if (cols.includes("revenue") || cols.includes("cost") || cols.includes("gross")) score += 0.10;

    // penalize raw transaction-style (you can tune this once you add table_type)
    if (cols.includes("post date") || cols.includes("invoice") || text.includes("post date")) score -= 0.10;

    return score;
  }

  // Basic dedupe by normalized text prefix
  const seen = new Set();
  const picked = [];

  const ranked = [...sources]
    .filter((s) => s && s.text && s.text.trim().length > 0)
    .sort((a, b) => scoreSource(b) - scoreSource(a));

  for (const s of ranked) {
    const norm = s.text.replace(/\s+/g, " ").trim().slice(0, 200).toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);

    picked.push(s);
    if (picked.length >= maxSnippets) break;
  }

  // Format [doc_name | page/section] line
  function refLine(s) {
    // Prefer your metadata if present; fallback to whatever exists
    const doc = s.docTitle || s.title || s.filename || s.docSource || "Unknown document";

    // For Excel: map to sheet/table/rows style references
    // (these fields come from the finance-grade xlsx pipeline I suggested)
    const sheet = s.sheet ? `sheet:${s.sheet}` : null;
    const table = s.table_index ? `table:${s.table_index}` : null;
    const rows =
      s.chunk_row_start && s.chunk_row_end
        ? `rows:${s.chunk_row_start}-${s.chunk_row_end}`
        : null;

    const loc = [sheet, table, rows].filter(Boolean).join(", ");
    return `[${doc} | ${loc || "section: n/a"}]`;
  }

  return picked
    .map((s) => {
      const txt = s.text.trim().slice(0, maxCharsPerSnippet);
      return `${refLine(s)}\n${txt}`;
    })
    .join("\n\n");
}
module.exports = { formatEvidenceSnippets };
