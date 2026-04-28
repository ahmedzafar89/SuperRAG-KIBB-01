const {
  shouldUseIpoPromptInjection,
  extractIpoPromptContext,
} = require("./buildIpoPromptBlocks");

const IPO_PROMPT_EXPANDED_TOP_N = 50;

function buildIpoRetrievalQuery(prompt = "") {
  const promptContext = extractIpoPromptContext(prompt);
  const parts = [
    promptContext.heading,
    promptContext.sectionNumber,
    ...(promptContext.keywords || []),
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return Array.from(new Set(parts)).join(" ");
}

function sourceValue(source = {}, key) {
  return source?.[key] ?? source?.metadata?.[key] ?? "";
}

function sourceText(source = {}) {
  return String(
    source?.text ||
      source?.pageContent ||
      source?.chunk ||
      source?.metadata?.text ||
      source?.metadata?.pageContent ||
      ""
  );
}

function sourceKey(source = {}) {
  return [
    sourceValue(source, "docSource"),
    sourceValue(source, "sourceDocument"),
    sourceValue(source, "title"),
    sourceValue(source, "filename"),
    sourceValue(source, "page_number"),
    sourceValue(source, "source_section"),
    sourceValue(source, "sheet"),
    sourceValue(source, "table_index"),
    sourceValue(source, "chunk_row_start"),
    sourceValue(source, "chunk_row_end"),
    sourceText(source).slice(0, 160),
  ]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join("|")
    .toLowerCase();
}

function mergeIpoPromptSources(...sourceLists) {
  const merged = [];
  const seen = new Set();

  for (const sourceList of sourceLists) {
    for (const source of Array.isArray(sourceList) ? sourceList : []) {
      const key = sourceKey(source);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(source);
    }
  }

  return merged;
}

function expandedIpoTopN(workspace = {}) {
  const workspaceTopN = Number(workspace?.topN || 0);
  return Math.max(
    Number.isFinite(workspaceTopN) ? workspaceTopN : 0,
    IPO_PROMPT_EXPANDED_TOP_N
  );
}

async function getIpoPromptSources({
  workspace,
  prompt,
  VectorDb,
  LLMConnector,
  embeddingsCount = 0,
  pinnedDocIdentifiers = [],
  existingSources = [],
  expandedSearchAlreadyRun = false,
} = {}) {
  if (!shouldUseIpoPromptInjection(workspace, prompt)) {
    return mergeIpoPromptSources(existingSources);
  }

  if (expandedSearchAlreadyRun) {
    return mergeIpoPromptSources(existingSources);
  }

  if (!embeddingsCount || !VectorDb || !LLMConnector) {
    return mergeIpoPromptSources(existingSources);
  }

  try {
    const expandedResults = await VectorDb.performSimilaritySearch({
      namespace: workspace.slug,
      input: buildIpoRetrievalQuery(prompt),
      LLMConnector,
      similarityThreshold: workspace?.similarityThreshold,
      topN: expandedIpoTopN(workspace),
      filterIdentifiers: pinnedDocIdentifiers,
      rerank: workspace?.vectorSearchMode === "rerank",
    });

    if (expandedResults?.message) {
      console.warn(
        "[IPO EVIDENCE INJECTION] Expanded source search failed:",
        expandedResults.message
      );
      return mergeIpoPromptSources(existingSources);
    }

    return mergeIpoPromptSources(existingSources, expandedResults.sources);
  } catch (error) {
    console.warn(
      "[IPO EVIDENCE INJECTION] Expanded source search failed:",
      error.message
    );
    return mergeIpoPromptSources(existingSources);
  }
}

module.exports = {
  IPO_PROMPT_EXPANDED_TOP_N,
  buildIpoRetrievalQuery,
  expandedIpoTopN,
  getIpoPromptSources,
  mergeIpoPromptSources,
};
