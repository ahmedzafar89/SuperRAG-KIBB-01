const {
  shouldUseIpoPromptInjection,
  buildIpoPromptBlocks,
  extractIpoPromptContext,
} = require("./buildIpoPromptBlocks");
const {
  isStyleReferenceSource,
} = require("./formatStyleReferenceSnippets");

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

function filterStyleReferenceSources(sourceList = []) {
  return (Array.isArray(sourceList) ? sourceList : []).filter(
    (source) => !isStyleReferenceSource(source)
  );
}

function filterStyleReferenceSearchResults(searchResults = {}) {
  const filtered = { ...searchResults, contextTexts: [], sources: [] };
  const contextTexts = Array.isArray(searchResults?.contextTexts)
    ? searchResults.contextTexts
    : [];
  const sources = Array.isArray(searchResults?.sources)
    ? searchResults.sources
    : [];

  sources.forEach((source, index) => {
    if (isStyleReferenceSource(source)) return;
    filtered.sources.push(source);
    if (index < contextTexts.length) {
      filtered.contextTexts.push(contextTexts[index]);
    }
  });

  return filtered;
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

async function getWorkspaceStyleReferenceSources({
  workspace,
  existingSources = [],
} = {}) {
  const styleSources = (Array.isArray(existingSources) ? existingSources : []).filter(
    isStyleReferenceSource
  );
  if (!workspace?.id) return mergeIpoPromptSources(styleSources);

  const { Document } = require("../../models/documents");
  const { safeJsonParse } = require("../http");
  const { fileData } = require("../files");

  const workspaceDocuments = await Document.where(
    { workspaceId: Number(workspace.id) },
    null,
    null,
    null,
    {
      docId: true,
      docpath: true,
      filename: true,
      metadata: true,
    }
  );

  for (const document of workspaceDocuments) {
    const metadata = safeJsonParse(document.metadata, {});
    if (!isStyleReferenceSource(metadata)) continue;

    const data = await fileData(document.docpath);
    if (!data) continue;

    styleSources.push({
      ...data,
      docId: document.docId,
      docpath: document.docpath,
      filename: document.filename,
    });
  }

  return mergeIpoPromptSources(styleSources);
}

async function prepareIpoPromptInjection({
  workspace,
  prompt,
  VectorDb,
  LLMConnector,
  embeddingsCount = 0,
  pinnedDocIdentifiers = [],
  existingSources = [],
  additionalStyleSources = [],
  expandedSearchAlreadyRun = false,
} = {}) {
  const factualExistingSources = filterStyleReferenceSources(existingSources);
  const factualSources = filterStyleReferenceSources(
    await getIpoPromptSources({
      workspace,
      prompt,
      VectorDb,
      LLMConnector,
      embeddingsCount,
      pinnedDocIdentifiers,
      existingSources: factualExistingSources,
      expandedSearchAlreadyRun,
    })
  );
  const styleSources = await getWorkspaceStyleReferenceSources({
    workspace,
    existingSources: additionalStyleSources,
  });
  const promptSources = mergeIpoPromptSources(factualSources, styleSources);

  return {
    factualSources,
    styleSources,
    promptSources,
    promptBlocks: buildIpoPromptBlocks(promptSources, {
      userTemplate: prompt,
    }),
  };
}

module.exports = {
  IPO_PROMPT_EXPANDED_TOP_N,
  buildIpoRetrievalQuery,
  expandedIpoTopN,
  filterStyleReferenceSearchResults,
  filterStyleReferenceSources,
  getIpoPromptSources,
  getWorkspaceStyleReferenceSources,
  mergeIpoPromptSources,
  prepareIpoPromptInjection,
};
