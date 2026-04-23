const {
  extractIpoPromptContext,
  formatEvidenceSnippets,
} = require("./formatEvidenceSnippets");
const {
  formatStyleReferenceSnippets,
  isStyleReferenceSource,
} = require("./formatStyleReferenceSnippets");

function shouldUseIpoPromptInjection(workspace, prompt = "") {
  const normalizedPrompt = String(prompt || "").toLowerCase();
  return (
    workspace?.slug?.toLowerCase().includes("financial-info") &&
    (normalizedPrompt.includes("evidence_snippets_with_metadata") ||
      normalizedPrompt.includes("style_reference_snippets"))
  );
}

function buildIpoPromptBlocks(allSources = [], opts = {}) {
  const promptContext = extractIpoPromptContext(opts.userTemplate || "");
  const evidenceMaxSnippets =
    opts.evidenceMaxSnippets ??
    (promptContext.tableHeavy ? 18 : 12);
  const evidenceMaxCharsPerSnippet =
    opts.evidenceMaxCharsPerSnippet ??
    (promptContext.tableHeavy ? 2200 : 1800);
  const styleMaxSnippets = opts.styleMaxSnippets ?? 2;
  const styleMaxCharsPerSnippet = opts.styleMaxCharsPerSnippet ?? 800;

  const normalizedSources = Array.isArray(allSources) ? allSources : [];
  const evidenceSources = normalizedSources.filter(
    (source) => !isStyleReferenceSource(source)
  );
  const styleSources = normalizedSources.filter(isStyleReferenceSource);

  const evidenceBlock = formatEvidenceSnippets(evidenceSources, {
    maxSnippets: evidenceMaxSnippets,
    maxCharsPerSnippet: evidenceMaxCharsPerSnippet,
    allowTransactions: false,
    promptText: opts.userTemplate || "",
  });

  const styleBlock = formatStyleReferenceSnippets(styleSources, {
    maxSnippets: styleMaxSnippets,
    maxCharsPerSnippet: styleMaxCharsPerSnippet,
  });

  return {
    evidenceBlock:
      evidenceBlock || "Not disclosed in the provided documents.",
    styleBlock:
      styleBlock || "No style reference snippets were provided.",
  };
}

function injectIpoPromptBlocks(userTemplate = "", blocks = {}) {
  return String(userTemplate || "")
    .replace(
      "<<EVIDENCE_SNIPPETS_WITH_METADATA>>",
      blocks.evidenceBlock || "Not disclosed in the provided documents."
    )
    .replace(
      "<<STYLE_REFERENCE_SNIPPETS>>",
      blocks.styleBlock || "No style reference snippets were provided."
    );
}

module.exports = {
  shouldUseIpoPromptInjection,
  buildIpoPromptBlocks,
  extractIpoPromptContext,
  injectIpoPromptBlocks,
};
