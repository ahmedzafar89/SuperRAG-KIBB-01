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
  const proFormaAllowedSections = new Set(["12.2"]);
  const keywordMap = {
    "12.1.1": [
      "profit or loss",
      "other comprehensive income",
      "revenue",
      "cost of sales",
      "gross profit",
      "profit before tax",
      "profit after tax",
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
    "12.2": [
      "capitalisation",
      "indebtedness",
      "capitalisation and indebtedness",
      "pro forma",
      "public issue",
    ],
    "12.3.4": ["revenue", "segment", "geographical"],
    "12.3.5": ["cost of sales", "cost", "project-related costs"],
    "12.3.6": ["gross profit", "gp margin", "gross profit margin"],
    "12.3.7": ["other income", "miscellaneous income", "rental income"],
    "12.3.8": ["administrative expenses", "staff costs", "office"],
    "12.3.9": ["selling", "distribution", "marketing", "commission"],
    "12.3.10": ["other expenses", "impairment", "financial assets"],
    "12.3.11": ["finance costs", "interest", "borrowings"],
    "12.3.12": [
      "profit before tax",
      "profit after tax",
      "effective tax rate",
      "tax",
    ],
    "12.4.2": [
      "cash flow",
      "cash flows",
      "operating activities",
      "investing activities",
      "financing activities",
    ],
    "12.8": [
      "ratio",
      "ratios",
      "turnover",
      "ageing",
      "formula",
      "effective tax rate",
    ],
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
          "statement",
          "section",
          "consolidated",
          "combined",
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
    proFormaAllowed: proFormaAllowedSections.has(sectionNumber),
    adjacentPageWindow: tableHeavySections.has(sectionNumber) ? 2 : 1,
    adjacentRowWindow: tableHeavySections.has(sectionNumber) ? 40 : 12,
  };
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

function sourceDocKey(source = {}) {
  return (
    source.sourceDocument ||
    source.docTitle ||
    source.title ||
    source.filename ||
    source.docSource ||
    source.url ||
    ""
  )
    .toString()
    .trim()
    .toLowerCase();
}

function sourceSectionKey(source = {}) {
  return (source.source_section || source.section || "")
    .toString()
    .trim()
    .toLowerCase();
}

function isAccountantReportSource(source = {}) {
  const key = sourceDocKey(source);
  return key.includes("accountant") || key.includes("accountants");
}

function hasProFormaSignals(text = "") {
  return /pro\s*forma|public issue|utilisation of proceeds|after pro\s*forma|compilation of pro\s*forma/i.test(
    text
  );
}

function countDateRows(text = "") {
  const matches = cleanText(text).match(/^\|\s*\d{4}-\d{2}-\d{2}\s*\|/gm);
  return matches ? matches.length : 0;
}

function isLikelyTransactionDump(source = {}, minDateRowsToFlag = 3) {
  const text = source?.text || "";
  const hits = countDateRows(text);
  const cols = Array.isArray(source.columns)
    ? source.columns.join(" | ").toLowerCase()
    : "";
  const headerSignals =
    cols.includes("post date") ||
    cols.includes("invoice") ||
    cols.includes("receipt") ||
    cols.includes("transaction") ||
    cols.includes("date");

  return hits >= minDateRowsToFlag || headerSignals;
}

function hasTableMetadata(source = {}) {
  return Boolean(
    source?.sheet ||
      source?.table_index ||
      source?.table_candidate ||
      source?.page_number ||
      (source?.chunk_row_start && source?.chunk_row_end) ||
      (Array.isArray(source?.columns) && source.columns.length > 0)
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

function sourceLocationKey(source = {}) {
  const doc = sourceDocKey(source);
  const sheet = (source.sheet || "").toString().trim().toLowerCase();
  const table = (source.table_index || "").toString().trim().toLowerCase();
  const rows =
    source.chunk_row_start && source.chunk_row_end
      ? `${source.chunk_row_start}-${source.chunk_row_end}`
      : "";
  const page = source.page_number ? `p${source.page_number}` : "";

  if (doc || sheet || table || rows || page) {
    return `loc:${doc}|${sheet}|${table}|${rows}|${page}`;
  }

  return `txt:${source.__cleanText
    .replace(/\s+/g, " ")
    .slice(0, 250)
    .toLowerCase()}`;
}

function sourceGroupKey(source = {}) {
  return `grp:${sourceDocKey(source)}|${(source.sheet || "")
    .toString()
    .trim()
    .toLowerCase()}|${(source.table_index || "")
    .toString()
    .trim()
    .toLowerCase()}|${sourceSectionKey(source)}`;
}

function rowDistance(a, b) {
  const aStart = Number(a.chunk_row_start);
  const aEnd = Number(a.chunk_row_end);
  const bStart = Number(b.chunk_row_start);
  const bEnd = Number(b.chunk_row_end);

  if (![aStart, aEnd, bStart, bEnd].every(Number.isFinite)) {
    return Number.POSITIVE_INFINITY;
  }
  if (aEnd >= bStart && bEnd >= aStart) return 0;
  if (aEnd < bStart) return bStart - aEnd;
  return aStart - bEnd;
}

function pageDistance(a, b) {
  const aPage = Number(a.page_number);
  const bPage = Number(b.page_number);
  if (![aPage, bPage].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  return Math.abs(aPage - bPage);
}

function refLine(source = {}) {
  const doc =
    source.sourceDocument ||
    source.docTitle ||
    source.title ||
    source.filename ||
    source.docSource ||
    "Unknown document";

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
  return `[${doc} | ${loc || "section: n/a"}]`;
}

function scoreSource(source, promptContext, hardExcludeTransactions) {
  const sheet = (source.sheet || "").toLowerCase();
  const title = (source.title || source.docTitle || "").toLowerCase();
  const sourceSection = sourceSectionKey(source);
  const cols = Array.isArray(source.columns)
    ? source.columns.join(" | ").toLowerCase()
    : "";
  const text = cleanText(source.text || "").toLowerCase();
  const combined = `${sheet} ${title} ${sourceSection} ${cols} ${text}`;

  let score = typeof source.score === "number" ? source.score : 0;

  if (isAccountantReportSource(source)) score += 0.24;
  if (promptContext.tableHeavy && hasTableMetadata(source)) score += 0.2;
  if (source.table_candidate) score += 0.12;
  if (sourceSection && promptContext.heading.toLowerCase().includes(sourceSection)) {
    score += 0.15;
  }

  if (sheet.includes("revenue") || title.includes("revenue")) score += 0.15;
  if (
    sheet.includes("cos") ||
    title.includes("cost of sales") ||
    title.includes("cos")
  )
    score += 0.15;
  if (sheet.includes("gross") || title.includes("gross")) score += 0.12;
  if (sheet.includes("profit") || title.includes("profit")) score += 0.08;
  if (sheet.includes("margin") || title.includes("margin")) score += 0.06;
  if (text.includes("fy202") || text.includes("fye")) score += 0.08;
  if (cols.includes("revenue") || cols.includes("cost") || cols.includes("gross")) {
    score += 0.06;
  }
  if (promptContext.includeComparativeFpe && hasComparativePeriodSignals(text)) {
    score += 0.16;
  }
  if (promptContext.includeNotes && hasNoteSignals(text)) score += 0.12;

  for (const keyword of promptContext.keywords) {
    if (!keyword) continue;
    if (combined.includes(keyword)) score += 0.05;
  }

  if (!promptContext.proFormaAllowed && hasProFormaSignals(text)) score -= 1.25;
  if (promptContext.proFormaAllowed && hasProFormaSignals(text)) score += 0.35;

  const tx = isLikelyTransactionDump(source);
  if (tx) score -= hardExcludeTransactions ? 10 : 0.25;
  if (cleanText(source.text || "").length < 120) score -= 0.05;

  return score;
}

function isHelpfulCompanion(anchor, candidate, promptContext) {
  if (sourceDocKey(anchor) !== sourceDocKey(candidate)) return false;
  if (sourceGroupKey(anchor) === sourceGroupKey(candidate)) {
    if (rowDistance(anchor, candidate) <= promptContext.adjacentRowWindow) {
      return true;
    }
    if (pageDistance(anchor, candidate) <= promptContext.adjacentPageWindow) {
      return true;
    }
  }

  if (
    sourceSectionKey(anchor) &&
    sourceSectionKey(anchor) === sourceSectionKey(candidate)
  ) {
    return true;
  }

  const text = candidate.__cleanText;
  return (
    (promptContext.includeComparativeFpe && hasComparativePeriodSignals(text)) ||
    (promptContext.includeNotes && hasNoteSignals(text))
  );
}

function formatEvidenceSnippets(sources = [], opts = {}) {
  const {
    maxSnippets = 12,
    maxCharsPerSnippet = 1800,
    promptText = "",
    promptContext: suppliedPromptContext = null,
    allowTransactions = false,
    minDateRowsToFlag = 3,
    hardExcludeTransactions = true,
  } = opts;
  const promptContext =
    suppliedPromptContext || extractIpoPromptContext(promptText);

  const cleaned = (Array.isArray(sources) ? sources : [])
    .map(normalizeSource)
    .filter((source) => source && source.__cleanText.length > 0);

  const eligible = allowTransactions
    ? cleaned
    : cleaned.filter(
        (source) =>
          !isLikelyTransactionDump(source, minDateRowsToFlag) &&
          (promptContext.proFormaAllowed || !hasProFormaSignals(source.__cleanText))
      );

  const ranked = [...eligible].sort((a, b) => {
    return (
      scoreSource(b, promptContext, hardExcludeTransactions) -
      scoreSource(a, promptContext, hardExcludeTransactions)
    );
  });

  const seedLimit = promptContext.tableHeavy
    ? Math.max(1, Math.min(5, Math.ceil(maxSnippets * 0.25)))
    : maxSnippets;
  const seeds = [];
  const seenSeeds = new Set();
  for (const source of ranked) {
    const key = sourceLocationKey(source);
    if (seenSeeds.has(key)) continue;
    seenSeeds.add(key);
    seeds.push(source);
    if (seeds.length >= seedLimit) break;
  }

  const picked = [];
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
        return !chosen.has(key) && isHelpfulCompanion(seed, candidate, promptContext);
      })
      .sort((a, b) => {
        const pageDelta = pageDistance(seed, a) - pageDistance(seed, b);
        if (pageDelta !== 0 && Number.isFinite(pageDelta)) return pageDelta;
        const rowDelta = rowDistance(seed, a) - rowDistance(seed, b);
        if (rowDelta !== 0 && Number.isFinite(rowDelta)) return rowDelta;
        return (
          scoreSource(b, promptContext, hardExcludeTransactions) -
          scoreSource(a, promptContext, hardExcludeTransactions)
        );
      });

    const companionLimit = Math.max(2, Math.ceil(maxSnippets / seedLimit) - 1);
    for (const companion of companions.slice(0, companionLimit)) {
      addPicked(companion);
      if (picked.length >= maxSnippets) break;
    }
  }

  for (const source of ranked) {
    if (picked.length >= maxSnippets) break;
    addPicked(source);
  }

  return picked
    .map((source) => {
      const txt = source.__cleanText.slice(0, maxCharsPerSnippet);
      return `${refLine(source)}\n${txt}`;
    })
    .join("\n\n");
}

module.exports = {
  cleanText,
  extractIpoPromptContext,
  formatEvidenceSnippets,
  normalizeSource,
};
