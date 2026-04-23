function extractIpoPromptContext(promptText = "") {
  const normalizedPrompt = String(promptText || "");
  const headingMatch = normalizedPrompt.match(
    /TARGET SECTION HEADING\s*[\r\n]+([^\r\n]+)/i
  );
  const heading = (headingMatch?.[1] || "").trim();
  const sectionNumber = (heading.match(/^12(?:\.\d+){0,2}/) || [])[0] || "";
  const tableHeavySections = new Set([
    "12.1.1",
    "12.1.2",
    "12.1.3",
    "12.2",
    "12.4.2",
    "12.8",
  ]);
  const noteHeavySections = new Set([
    "12.1.1",
    "12.1.2",
    "12.1.3",
    "12.2",
    "12.3.12",
    "12.4.2",
    "12.8",
  ]);
  const comparativeFpeSections = new Set(["12.1.3", "12.4.2"]);
  const keywordMap = {
    "12.1.1": [
      "profit or loss",
      "other comprehensive income",
      "ebitda",
      "earnings per share",
      "eps",
    ],
    "12.1.2": ["financial position", "assets", "equity", "liabilities"],
    "12.1.3": [
      "cash flow",
      "cash flows",
      "operating activities",
      "investing activities",
      "financing activities",
      "cash and cash equivalents",
    ],
    "12.2": ["capitalisation", "indebtedness", "capitalisation and indebtedness"],
    "12.3.4": ["revenue", "segment", "geographical"],
    "12.3.5": ["cost of sales", "cost", "project-related costs"],
    "12.3.6": ["gross profit", "gp margin", "gross profit margin"],
    "12.3.7": ["other income", "miscellaneous income", "rental income"],
    "12.3.8": ["administrative expenses", "staff costs", "office"],
    "12.3.9": ["selling", "distribution", "marketing", "commission"],
    "12.3.10": ["other expenses", "impairment", "financial assets"],
    "12.3.11": ["finance costs", "interest", "borrowings"],
    "12.3.12": ["profit before tax", "profit after tax", "effective tax rate", "tax"],
    "12.4.2": [
      "cash flow",
      "cash flows",
      "operating activities",
      "investing activities",
      "financing activities",
    ],
    "12.8": ["ratio", "ratios", "turnover", "ageing", "formula", "effective tax rate"],
  };
  const headingTerms = heading
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (term) =>
        term &&
        ![
          "12",
          "and",
          "of",
          "our",
          "the",
          "information",
          "statements",
          "section",
        ].includes(term)
    );
  const keywords = Array.from(
    new Set([...(keywordMap[sectionNumber] || []), ...headingTerms])
  );

  return {
    heading,
    sectionNumber,
    keywords,
    tableHeavy: tableHeavySections.has(sectionNumber),
    includeNotes: noteHeavySections.has(sectionNumber),
    includeComparativeFpe: comparativeFpeSections.has(sectionNumber),
    adjacentRowWindow: tableHeavySections.has(sectionNumber) ? 24 : 12,
  };
}

function formatEvidenceSnippets(sources = [], opts = {}) {
  const {
    maxSnippets = 12,
    maxCharsPerSnippet = 1800,
    promptText = "",

    // Finance-grade defaults:
    allowTransactions = false,          // keep raw transaction row chunks OUT by default
    minDateRowsToFlag = 3,              // how many date-like rows means "transaction dump"
    hardExcludeTransactions = true,     // if true, exclude; else just downscore
  } = opts;
  const promptContext = extractIpoPromptContext(promptText);

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

  function hasTableMetadata(s) {
    return Boolean(
      s?.sheet ||
        s?.table_index ||
        (s?.chunk_row_start && s?.chunk_row_end) ||
        (Array.isArray(s?.columns) && s.columns.length > 0)
    );
  }

  function hasNoteSignals(text = "") {
    return /(^|\b)(note|notes|formula|annualis|annualiz|audited|unaudited|earnings per share|effective tax rate|comprise|comprised of)\b/i.test(
      text
    );
  }

  function hasComparativePeriodSignals(text = "") {
    return /(fpe|financial period ended|comparative period|corresponding period)/i.test(
      text
    );
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

    if (promptContext.tableHeavy && hasTableMetadata(s)) score += 0.08;
    if (promptContext.includeComparativeFpe && hasComparativePeriodSignals(text))
      score += 0.16;
    if (promptContext.includeNotes && hasNoteSignals(text)) score += 0.12;

    for (const keyword of promptContext.keywords) {
      if (!keyword) continue;
      if (sheet.includes(keyword) || title.includes(keyword)) score += 0.05;
      else if (text.includes(keyword)) score += 0.03;
    }

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

  function sourceDocKey(s) {
    return (
      s.sourceDocument ||
      s.docTitle ||
      s.title ||
      s.filename ||
      s.docSource ||
      s.url ||
      ""
    )
      .toString()
      .trim()
      .toLowerCase();
  }

  function sourceLocationKey(s) {
    const doc = sourceDocKey(s);
    const sheet = (s.sheet || "").toString().trim().toLowerCase();
    const table = (s.table_index || "").toString().trim().toLowerCase();
    const rows =
      s.chunk_row_start && s.chunk_row_end
        ? `${s.chunk_row_start}-${s.chunk_row_end}`
        : "";

    if (doc || sheet || table || rows) {
      return `loc:${doc}|${sheet}|${table}|${rows}`;
    }

    // fallback: normalized prefix of text
    return `txt:${s.__cleanText.replace(/\s+/g, " ").slice(0, 250).toLowerCase()}`;
  }

  function sourceGroupKey(s) {
    return `grp:${sourceDocKey(s)}|${(s.sheet || "").toString().trim().toLowerCase()}|${(
      s.table_index || ""
    )
      .toString()
      .trim()
      .toLowerCase()}`;
  }

  function rowDistance(a, b) {
    const aStart = Number(a.chunk_row_start);
    const aEnd = Number(a.chunk_row_end);
    const bStart = Number(b.chunk_row_start);
    const bEnd = Number(b.chunk_row_end);

    if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
    if (aEnd >= bStart && bEnd >= aStart) return 0;
    if (aEnd < bStart) return bStart - aEnd;
    return aStart - bEnd;
  }

  function isHelpfulCompanion(anchor, candidate) {
    if (sourceGroupKey(anchor) !== sourceGroupKey(candidate)) return false;
    const distance = rowDistance(anchor, candidate);
    if (distance <= promptContext.adjacentRowWindow) return true;

    const text = candidate.__cleanText;
    return (
      (promptContext.includeComparativeFpe && hasComparativePeriodSignals(text)) ||
      (promptContext.includeNotes && hasNoteSignals(text))
    );
  }

  const seedLimit = promptContext.tableHeavy
    ? Math.min(maxSnippets, Math.max(3, Math.ceil(maxSnippets * 0.6)))
    : maxSnippets;

  const seeds = [];
  for (const s of ranked) {
    const key = sourceLocationKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    seeds.push(s);
    if (seeds.length >= seedLimit) break;
  }

  const chosen = new Set();
  const addPicked = (source) => {
    const key = sourceLocationKey(source);
    if (chosen.has(key) || picked.length >= maxSnippets) return;
    chosen.add(key);
    picked.push(source);
  };

  for (const seed of seeds) {
    addPicked(seed);
    if (picked.length >= maxSnippets || !promptContext.tableHeavy) continue;

    const companions = ranked
      .filter((candidate) => {
        const key = sourceLocationKey(candidate);
        return !chosen.has(key) && isHelpfulCompanion(seed, candidate);
      })
      .sort((a, b) => {
        const distanceDelta = rowDistance(seed, a) - rowDistance(seed, b);
        if (distanceDelta !== 0) return distanceDelta;
        return scoreSource(b) - scoreSource(a);
      });

    for (const companion of companions.slice(0, 2)) {
      addPicked(companion);
      if (picked.length >= maxSnippets) break;
    }
  }

  for (const s of ranked) {
    if (picked.length >= maxSnippets) break;
    const key = sourceLocationKey(s);
    if (chosen.has(key)) continue;
    addPicked(s);
    if (picked.length >= maxSnippets) break;
  }

  // 5) Format [doc | sheet/table/rows]
  function refLine(s) {
    const doc =
      s.sourceDocument ||
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

module.exports = { extractIpoPromptContext, formatEvidenceSnippets };
