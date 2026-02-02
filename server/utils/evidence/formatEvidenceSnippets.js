function formatEvidenceSnippets(sources = [], opts = {}) {
  const {
    maxSnippets = 12,
    maxCharsPerSnippet = 1800,

    // Finance-grade defaults:
    allowTransactions = false,          // keep raw transaction row chunks OUT by default
    minDateRowsToFlag = 3,              // how many date-like rows means "transaction dump"
    hardExcludeTransactions = true,     // if true, exclude; else just downscore
  } = opts;

  const cleanText = (txt = "") =>
    String(txt || "")
      // remove AnythingLLM / TextSplitter metadata wrappers
      .replace(/<document_metadata>[\s\S]*?<\/document_metadata>\s*/g, "")
      .replace(/\s+\n/g, "\n")
      .trim();

  // Detect transaction-like chunks: markdown rows that start with a date in first column.
  function countDateRows(text) {
    // matches lines like: | 2023-05-12 | ...
    const matches = cleanText(text).match(/^\|\s*\d{4}-\d{2}-\d{2}\s*\|/gm);
    return matches ? matches.length : 0;
  }

  function isLikelyTransactionDump(s) {
    const text = s?.text || "";
    const hits = countDateRows(text);

    // also catch if header column names exist (when present)
    const cols = Array.isArray(s.columns) ? s.columns.join(" | ").toLowerCase() : "";
    const headerSignals =
      cols.includes("post date") ||
      cols.includes("invoice") ||
      cols.includes("receipt") ||
      cols.includes("transaction") ||
      cols.includes("date");

    return hits >= minDateRowsToFlag || headerSignals;
  }

  function scoreSource(s) {
    const sheet = (s.sheet || "").toLowerCase();
    const title = (s.title || s.docTitle || "").toLowerCase();
    const cols = Array.isArray(s.columns) ? s.columns.join(" | ").toLowerCase() : "";
    const text = cleanText(s.text || "").toLowerCase();

    let score = typeof s.score === "number" ? s.score : 0;

    // Boost statement-style / disclosure-ish tables
    if (sheet.includes("revenue") || title.includes("revenue")) score += 0.15;
    if (sheet.includes("cos") || title.includes("cost of sales") || title.includes("cos")) score += 0.15;
    if (sheet.includes("gross") || title.includes("gross")) score += 0.12;
    if (sheet.includes("profit") || title.includes("profit")) score += 0.08;
    if (sheet.includes("margin") || title.includes("margin")) score += 0.06;

    // FY / FYE hints
    if (text.includes("fy202") || text.includes("fye")) score += 0.08;

    // Column hints
    if (cols.includes("revenue") || cols.includes("cost") || cols.includes("gross")) score += 0.06;

    // Penalize transaction dumps (usually not prospectus table evidence)
    const tx = isLikelyTransactionDump(s);
    if (tx) score -= hardExcludeTransactions ? 10 : 0.25;

    // Slight penalty if the snippet is extremely short (often just separators/noise)
    if (cleanText(s.text || "").length < 120) score -= 0.05;

    return score;
  }

  // 1) Clean + filter empty
  const cleaned = (Array.isArray(sources) ? sources : [])
    .filter((s) => s && s.text && cleanText(s.text).length > 0)
    .map((s) => ({ ...s, __cleanText: cleanText(s.text) }));

  // 2) Optionally exclude transactions
  const eligible = allowTransactions
    ? cleaned
    : cleaned.filter((s) => !isLikelyTransactionDump(s));

  // 3) Rank
  const ranked = [...eligible].sort((a, b) => scoreSource(b) - scoreSource(a));

  // 4) Dedupe
  const seen = new Set();
  const picked = [];

  function dedupeKey(s) {
    // Most stable keys first
    if (s.sourceDocument) return `srcdoc:${s.sourceDocument}`;
    if (s.url) return `url:${s.url}`;
    if (s.title) return `title:${s.title}`;
    // fallback: normalized prefix of text
    return `txt:${s.__cleanText.replace(/\s+/g, " ").slice(0, 250).toLowerCase()}`;
    }

  for (const s of ranked) {
    const key = dedupeKey(s);
    if (seen.has(key)) continue;
    seen.add(key);

    picked.push(s);
    if (picked.length >= maxSnippets) break;
  }

  // 5) Format [doc | sheet/table/rows]
  function refLine(s) {
    const doc =
      s.docTitle ||
      s.title ||
      s.filename ||
      s.docSource ||
      "Unknown document";

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
      const txt = s.__cleanText.slice(0, maxCharsPerSnippet);
      return `${refLine(s)}\n${txt}`;
    })
    .join("\n\n");
}

module.exports = { formatEvidenceSnippets };
