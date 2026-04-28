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
    "12.1": [
      "historical financial information",
      "accountants report",
      "financial years under review",
      "financial period under review",
      "malaysian financial reporting standards",
      "international financial reporting standards",
      "basis of preparation",
    ],
    "12.1.1": [
      "profit or loss",
      "other comprehensive income",
      "revenue",
      "cost of sales",
      "gross profit",
      "profit before tax",
      "profit after tax",
      "ebitda",
      "gp margin",
      "pbt margin",
      "pat margin",
      "earnings per share",
      "eps",
      "finance income",
      "taxation",
      "depreciation",
      "finance cost",
    ],
    "12.1.2": [
      "financial position",
      "consolidated statements of financial position",
      "assets",
      "equity",
      "liabilities",
      "non-current assets",
      "current assets",
      "total assets",
      "equity and liabilities",
      "total equity and liabilities",
    ],
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
    "12.3": [
      "management discussion and analysis",
      "results of operations",
      "financial condition",
      "historical financial information",
      "accountants report",
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
    "12.4": [
      "liquidity and capital resources",
      "working capital",
      "cash flow",
      "bank borrowings",
      "capital resources",
    ],
    "12.4.1": [
      "working capital",
      "sufficient for present requirements",
      "12 months",
      "current assets",
      "current liabilities",
      "banking facilities",
      "funding requirements",
    ],
    "12.4.2": [
      "cash flow",
      "cash flows",
      "operating activities",
      "investing activities",
      "financing activities",
    ],
    "12.4.3": [
      "bank borrowings",
      "banking facilities",
      "term loans",
      "overdraft",
      "trade facilities",
      "hire purchase",
      "secured",
      "unsecured",
    ],
    "12.8": [
      "ratio",
      "ratios",
      "turnover",
      "ageing",
      "formula",
      "effective tax rate",
    ],
    "12.9": [
      "interest rates",
      "commodity prices",
      "foreign exchange",
      "foreign currency",
      "sensitivity",
      "exposure",
    ],
  };
  const headingTerms = heading
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (term) =>
        term &&
        !/^\d+$/.test(term) &&
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
  return /(^|\b)(note|notes|formula|annualis|annualiz|audited|unaudited|earnings per share|effective tax rate|comprise|comprised of|gp margin|pbt margin|pat margin|ebitda is computed|finance income|depreciation)\b/i.test(
    text
  );
}

function hasComparativePeriodSignals(text = "") {
  return /(fpe|financial period ended|comparative period|corresponding period)/i.test(
    text
  );
}

function hasAccountantsReportBoilerplateSignals(text = "") {
  return /(reporting accountants[’']?\s+(?:report|opinion|responsibilities)|restriction on distribution and use|compilation of pro forma|pro forma consolidated statements? of financial position|the purpose of the pro forma|this report is made solely|engagement circumstances|approved standards on auditing)/i.test(
    text
  );
}

function sectionSpecificSignalScore(text = "", promptContext = {}) {
  const normalized = cleanText(text).toLowerCase();
  let score = 0;

  switch (promptContext.sectionNumber) {
    case "12.1":
      if (
        /historical financial information|comprise the consolidated statements|statements of financial position|statements of profit or loss and other comprehensive income|statements of changes in equity|statements of cash flows/.test(
          normalized
        )
      )
        score += 0.5;
      if (
        /31 december 2022|31 december 2023|31 december 2024|31 july 2025|fpe 31 july 2025|7-month financial period/.test(
          normalized
        )
      )
        score += 0.32;
      if (
        /malaysian financial reporting standards|mfrs|ifrs accounting standards|basis of preparation|accountants[’'] report/.test(
          normalized
        )
      )
        score += 0.34;
      if (
        /directors[’'] responsibilities|basis for opinion|ethical responsibilities|by-laws|iesba code|reporting accountants[’'] responsibilities/.test(
          normalized
        )
      )
        score -= 1.15;
      break;
    case "12.1.1":
      if (/consolidated statements? of profit or loss/.test(normalized)) score += 0.55;
      if (/other comprehensive income/.test(normalized)) score += 0.3;
      if (/revenue|cost of sales|gross profit|profit before taxation|profit after taxation|earnings per share/.test(normalized))
        score += 0.28;
      if (/ebitda|gp margin|pbt margin|pat margin|basic and diluted eps/.test(normalized))
        score += 0.32;
      if (/finance income|taxation|depreciation|finance cost|ebitda is computed/.test(normalized))
        score += 0.26;
      if (/fye 31 december|1\.1\.2024 to 31\.7\.2024|1\.1\.2025 to 31\.7\.2025|unaudited|audited/.test(normalized))
        score += 0.2;
      if (/income tax expense|basic|diluted|attributable to:|owners of the company|non-controlling interests/.test(normalized))
        score += 0.22;
      if (/dividends|balance at 1\.1|balance at 31\.12|distribution to owners|statement of changes in equity|acquisition of non/.test(normalized))
        score -= 1.35;
      break;
    case "12.1.2":
      const financialPositionMarkers = [
        /consolidated statements? of financial position/,
        /as at 31 december|as at 31 july/,
        /non-current assets/,
        /current assets/,
        /current liabilities/,
        /non-current liabilities/,
        /total assets/,
        /equity and liabilities/,
        /total equity/,
        /total liabilities/,
        /total equity and liabilities/,
      ].filter((pattern) => pattern.test(normalized)).length;
      if (/consolidated statements? of financial position/.test(normalized)) score += 0.75;
      if (/as at 31 december|as at 31 july/.test(normalized)) score += 0.22;
      if (/non-current assets|current assets|total assets/.test(normalized)) score += 0.35;
      if (/equity and liabilities|total equity|total liabilities|total equity and liabilities/.test(normalized)) score += 0.45;
      if (/share capital|retained profits|retained earnings|trade payables|other payables|borrowings|bank overdrafts/.test(normalized))
        score += 0.22;
      if (/total assets/.test(normalized) && /total equity and liabilities/.test(normalized))
        score += 1.1;
      if (/current liabilities|non-current liabilities/.test(normalized)) score += 0.28;
      if (financialPositionMarkers >= 5) score += 0.9;
      else if (financialPositionMarkers >= 3) score += 0.45;
      if (/classification of financial instruments|debt-to-equity ratio|capital management|net gains\/\(losses\) recognised in profit or loss|financial risk management policies|fair value of financial instruments|liquidity risk|maturity analysis|cash flow information/.test(normalized))
        score -= 1.35;
      if (/profit or loss|other comprehensive income|earnings per share|financial year ended/.test(normalized))
        score -= 0.95;
      break;
    case "12.1.3":
    case "12.4.2":
      if (/consolidated statements? of cash flows|cash flows from operating activities|cash flows from investing activities|cash flows from financing activities/.test(normalized))
        score += 0.7;
      if (/net cash (?:generated|used|from|in)/.test(normalized)) score += 0.3;
      break;
    case "12.2":
      if (/capitalisation and indebtedness|total indebtedness|total capitalisation|gearing ratio/.test(normalized))
        score += 0.6;
      if (
        /pro forma consolidated statements? of financial position|as at 31 july 2025|after public issue|utilisation of proceeds|after pro forma|subsequent adjustment/.test(
          normalized
        )
      )
        score += 0.48;
      if (
        /share capital|retained profits|total equity|current liabilities|non-current liabilities|short-term borrowings|long-term borrowings|bank overdrafts|total liabilities|total equity and liabilities/.test(
          normalized
        )
      )
        score += 0.24;
      if (
        /reporting accountants[’'] responsibilities|report on the compilation|other matter|abbreviations|the board of directors[’'] responsibilities|opinion|prospectus guidelines/.test(
          normalized
        )
      )
        score -= 1.1;
      break;
    default:
      break;
  }

  return score;
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
  const pdfChunk =
    source.filetype === "pdf" && page && !sheet && !table && !rows
      ? source.__cleanText.replace(/\s+/g, " ").slice(0, 160).toLowerCase()
      : "";

  if (doc || sheet || table || rows || page || pdfChunk) {
    return `loc:${doc}|${sheet}|${table}|${rows}|${page}|${pdfChunk}`;
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
  score += sectionSpecificSignalScore(text, promptContext);
  if (promptContext.sectionNumber === "12.1") {
    const pageNumber = Number(source.page_number);
    if (Number.isFinite(pageNumber) && pageNumber <= 40) score += 0.15;
    if (Number.isFinite(pageNumber) && pageNumber > 60) score -= 0.45;
  }
  if (promptContext.sectionNumber === "12.2") {
    const pageNumber = Number(source.page_number);
    if (Number.isFinite(pageNumber) && pageNumber >= 5 && pageNumber <= 8)
      score += 0.45;
    if (Number.isFinite(pageNumber) && pageNumber <= 4) score -= 0.65;
    if (Number.isFinite(pageNumber) && pageNumber === 9) score -= 0.4;
  }

  for (const keyword of promptContext.keywords) {
    if (!keyword) continue;
    if (combined.includes(keyword)) score += 0.05;
  }

  if (!promptContext.proFormaAllowed && hasProFormaSignals(text)) score -= 1.25;
  if (promptContext.proFormaAllowed && hasProFormaSignals(text)) score += 0.35;
  if (hasAccountantsReportBoilerplateSignals(text)) score -= 1.1;

  const tx = isLikelyTransactionDump(source);
  if (tx) score -= hardExcludeTransactions ? 10 : 0.25;
  if (cleanText(source.text || "").length < 120) score -= 0.05;

  return score;
}

function isHelpfulCompanion(anchor, candidate, promptContext) {
  if (sourceDocKey(anchor) !== sourceDocKey(candidate)) return false;
  if (
    anchor.filetype === "pdf" &&
    candidate.filetype === "pdf" &&
    anchor.table_candidate &&
    candidate.table_candidate &&
    pageDistance(anchor, candidate) <= promptContext.adjacentPageWindow
  ) {
    return true;
  }
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

function hasFinancialPositionStatementCoverage(picked = []) {
  const combined = picked.map((source) => source.__cleanText.toLowerCase());
  const hasAssetsPage = combined.some(
    (text) =>
      text.includes("current assets") ||
      text.includes("total assets") ||
      (text.includes("non-current assets") && text.includes("total assets")) ||
      (text.includes("fixed deposits") && text.includes("cash and bank balances"))
  );
  const hasLiabilitiesPage = combined.some(
    (text) =>
      text.includes("current liabilities") ||
      text.includes("total equity and liabilities") ||
      (text.includes("equity") && text.includes("total liabilities"))
  );

  return hasAssetsPage && hasLiabilitiesPage;
}

function hasHistoricalFinancialIntroCoverage(picked = []) {
  const combined = picked.map((source) => source.__cleanText.toLowerCase());
  const hasPeriods = combined.some((text) =>
    /31 december 2022|31 december 2023|31 december 2024|31 july 2025|fpe 31 july 2025/.test(
      text
    )
  );
  const hasFramework = combined.some((text) =>
    /malaysian financial reporting standards|mfrs|ifrs accounting standards/.test(
      text
    )
  );
  return hasPeriods && hasFramework;
}

function hasCapitalisationCoverage(picked = []) {
  const combined = picked.map((source) => source.__cleanText.toLowerCase());
  const hasBasis = combined.some((text) =>
    /pro forma consolidated statements? of financial position|as at 31 july 2025|after public issue|utilisation of proceeds/.test(
      text
    )
  );
  const hasCapital = combined.some((text) =>
    /share capital|retained profits|total equity/.test(text)
  );
  const hasDebt = combined.some((text) =>
    /long-term borrowings|short-term borrowings|bank overdrafts|total liabilities/.test(
      text
    )
  );
  return hasBasis && (hasCapital || hasDebt);
}

function hasProfitOrLossStatementCoverage(picked = []) {
  const combined = picked.map((source) => source.__cleanText.toLowerCase());
  const hasMainPage = combined.some(
    (text) =>
      text.includes("revenue") &&
      text.includes("cost of sales") &&
      text.includes("gross profit") &&
      text.includes("profit before taxation")
  );
  const hasContinuationPage = combined.some(
    (text) =>
      text.includes("profit after taxation") ||
      text.includes("total comprehensive") ||
      text.includes("earnings per share") ||
      text.includes("basic") ||
      text.includes("diluted") ||
      text.includes("attributable to:")
  );

  return hasMainPage && hasContinuationPage;
}

function hasProfitOrLossExcludedSignals(text = "") {
  return /dividends|balance at 1\.1|balance at 31\.12|distribution to owners|statement of changes in equity|acquisition of non/i.test(
    text
  );
}

function hasProfitOrLossMetricSupportSignals(text = "") {
  return /ebitda|gp margin|pbt margin|pat margin|basic and diluted eps|finance income|taxation|depreciation|finance cost|ebitda is computed/i.test(
    text
  );
}

function pruneFinancialPositionStatementPages(
  picked = [],
  promptContext = {},
  hardExcludeTransactions = true
) {
  if (!Array.isArray(picked) || picked.length === 0) return [];

  const rankedPicked = [...picked].sort((a, b) => {
    return (
      scoreSource(b, promptContext, hardExcludeTransactions) -
      scoreSource(a, promptContext, hardExcludeTransactions)
    );
  });
  const anchor = rankedPicked[0];
  if (!anchor) return [];

  const narrowed = rankedPicked
    .filter((source) => {
      if (sourceDocKey(source) !== sourceDocKey(anchor)) return false;
      if (source.filetype !== "pdf" || !source.table_candidate) return false;
      return pageDistance(anchor, source) <= promptContext.adjacentPageWindow;
    })
    .sort((a, b) => {
      const aPage = Number(a.page_number);
      const bPage = Number(b.page_number);
      if (Number.isFinite(aPage) && Number.isFinite(bPage) && aPage !== bPage) {
        return aPage - bPage;
      }
      return (
        scoreSource(b, promptContext, hardExcludeTransactions) -
        scoreSource(a, promptContext, hardExcludeTransactions)
      );
    });

  return hasFinancialPositionStatementCoverage(narrowed) ? narrowed : [];
}

function pruneProfitOrLossStatementPages(
  picked = [],
  promptContext = {},
  hardExcludeTransactions = true
) {
  if (!Array.isArray(picked) || picked.length === 0) return [];

  const rankedPicked = [...picked].sort((a, b) => {
    return (
      scoreSource(b, promptContext, hardExcludeTransactions) -
      scoreSource(a, promptContext, hardExcludeTransactions)
    );
  });
  const anchor = rankedPicked[0];
  if (!anchor) return [];

  const narrowed = rankedPicked
    .filter((source) => {
      if (sourceDocKey(source) !== sourceDocKey(anchor)) return false;
      if (source.filetype !== "pdf" || !source.table_candidate) return false;
      const text = source.__cleanText.toLowerCase();
      if (hasProfitOrLossExcludedSignals(text)) {
        return false;
      }
      const distance = pageDistance(anchor, source);
      if (distance <= 1) return true;
      return (
        distance <= promptContext.adjacentPageWindow &&
        hasProfitOrLossMetricSupportSignals(text)
      );
    })
    .sort((a, b) => {
      const aPage = Number(a.page_number);
      const bPage = Number(b.page_number);
      if (Number.isFinite(aPage) && Number.isFinite(bPage) && aPage !== bPage) {
        return aPage - bPage;
      }
      return (
        scoreSource(b, promptContext, hardExcludeTransactions) -
        scoreSource(a, promptContext, hardExcludeTransactions)
      );
    });

  return hasProfitOrLossStatementCoverage(narrowed) ? narrowed : [];
}

function pruneHistoricalFinancialIntroPages(
  picked = [],
  promptContext = {},
  hardExcludeTransactions = true
) {
  if (!Array.isArray(picked) || picked.length === 0) return [];

  const introSignals = (text = "") =>
    /historical financial information|comprise the consolidated statements|statements of financial position|statements of profit or loss and other comprehensive income|statements of changes in equity|statements of cash flows|31 december 2022|31 december 2023|31 december 2024|31 july 2025|fpe 31 july 2025|malaysian financial reporting standards|mfrs|ifrs accounting standards|basis of preparation|accountants[’'] report/i.test(
      text
    );
  const excludeSignals = (text = "") =>
    /directors[’'] responsibilities|basis for opinion|ethical responsibilities|by-laws|iesba code|reporting accountants[’'] responsibilities/i.test(
      text
    );

  const rankedPicked = [...picked]
    .filter((source) => {
      const text = source.__cleanText || "";
      return introSignals(text) && !excludeSignals(text);
    })
    .sort((a, b) => {
      return (
        scoreSource(b, promptContext, hardExcludeTransactions) -
        scoreSource(a, promptContext, hardExcludeTransactions)
      );
    });

  const bestByPage = new Map();
  for (const source of rankedPicked) {
    const pageKey = `${sourceDocKey(source)}|${source.page_number || "na"}`;
    if (!bestByPage.has(pageKey)) {
      bestByPage.set(pageKey, source);
    }
  }

  const narrowed = Array.from(bestByPage.values())
    .sort((a, b) => {
      const aPage = Number(a.page_number);
      const bPage = Number(b.page_number);
      if (Number.isFinite(aPage) && Number.isFinite(bPage) && aPage !== bPage) {
        return aPage - bPage;
      }
      return (
        scoreSource(b, promptContext, hardExcludeTransactions) -
        scoreSource(a, promptContext, hardExcludeTransactions)
      );
    })
    .slice(0, 3);

  return hasHistoricalFinancialIntroCoverage(narrowed) ? narrowed : [];
}

function pruneCapitalisationPages(
  picked = [],
  promptContext = {},
  hardExcludeTransactions = true
) {
  if (!Array.isArray(picked) || picked.length === 0) return [];

  const excludeSignals = (text = "") =>
    /reporting accountants[’'] responsibilities|report on the compilation|other matter|abbreviations|the board of directors[’'] responsibilities|opinion|prospectus guidelines/i.test(
      text
    );
  const includeSignals = (text = "") =>
    /pro forma consolidated statements? of financial position|as at 31 july 2025|after public issue|utilisation of proceeds|after pro forma|subsequent adjustment|share capital|retained profits|total equity|current liabilities|non-current liabilities|short-term borrowings|long-term borrowings|bank overdrafts|total liabilities|total equity and liabilities/i.test(
      text
    );

  const rankedPicked = [...picked]
    .filter((source) => {
      const text = source.__cleanText || "";
      return includeSignals(text) && !excludeSignals(text);
    })
    .sort((a, b) => {
      return (
        scoreSource(b, promptContext, hardExcludeTransactions) -
        scoreSource(a, promptContext, hardExcludeTransactions)
      );
    });

  const anchor = rankedPicked[0];
  if (!anchor) return [];

  const narrowed = rankedPicked
    .filter((source) => {
      if (sourceDocKey(source) !== sourceDocKey(anchor)) return false;
      if (source.filetype !== "pdf" || !source.table_candidate) return false;
      const page = Number(source.page_number);
      return Number.isFinite(page) && page >= 5 && page <= 8;
    })
    .sort((a, b) => Number(a.page_number || 0) - Number(b.page_number || 0));

  return hasCapitalisationCoverage(narrowed) ? narrowed : [];
}

function renderPicked(picked = [], maxCharsPerSnippet = 1800) {
  return picked
    .map((source) => {
      const txt = source.__cleanText.slice(0, maxCharsPerSnippet);
      return `${refLine(source)}\n${txt}`;
    })
    .join("\n\n");
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

    if (promptContext.sectionNumber === "12.1.1") {
      const narrowed = pruneProfitOrLossStatementPages(
        picked,
        promptContext,
        hardExcludeTransactions
      );
      if (narrowed.length) {
        return renderPicked(narrowed, maxCharsPerSnippet);
      }
    }

    if (promptContext.sectionNumber === "12.1") {
      const narrowed = pruneHistoricalFinancialIntroPages(
        picked,
        promptContext,
        hardExcludeTransactions
      );
      if (narrowed.length) {
        return renderPicked(narrowed, maxCharsPerSnippet);
      }
    }

    if (promptContext.sectionNumber === "12.2") {
      const narrowed = pruneCapitalisationPages(
        picked,
        promptContext,
        hardExcludeTransactions
      );
      if (narrowed.length) {
        return renderPicked(narrowed, maxCharsPerSnippet);
      }
    }

    if (promptContext.sectionNumber === "12.1.2") {
      const narrowed = pruneFinancialPositionStatementPages(
        picked,
        promptContext,
        hardExcludeTransactions
      );
      if (narrowed.length) {
        return renderPicked(narrowed, maxCharsPerSnippet);
      }
    }
  }

  if (promptContext.sectionNumber === "12.1.1") {
    const narrowed = pruneProfitOrLossStatementPages(
      picked,
      promptContext,
      hardExcludeTransactions
    );
    if (narrowed.length) {
      return renderPicked(narrowed, maxCharsPerSnippet);
    }
  }

  if (promptContext.sectionNumber === "12.1") {
    const narrowed = pruneHistoricalFinancialIntroPages(
      picked,
      promptContext,
      hardExcludeTransactions
    );
    if (narrowed.length) {
      return renderPicked(narrowed, maxCharsPerSnippet);
    }
  }

  if (promptContext.sectionNumber === "12.2") {
    const narrowed = pruneCapitalisationPages(
      picked,
      promptContext,
      hardExcludeTransactions
    );
    if (narrowed.length) {
      return renderPicked(narrowed, maxCharsPerSnippet);
    }
  }

  if (promptContext.sectionNumber === "12.1.2") {
    const narrowed = pruneFinancialPositionStatementPages(
      picked,
      promptContext,
      hardExcludeTransactions
    );
    if (narrowed.length) {
      return renderPicked(narrowed, maxCharsPerSnippet);
    }
  }

  for (const source of ranked) {
    if (picked.length >= maxSnippets) break;
    addPicked(source);
  }

  return renderPicked(picked, maxCharsPerSnippet);
}

module.exports = {
  cleanText,
  extractIpoPromptContext,
  formatEvidenceSnippets,
  normalizeSource,
};
