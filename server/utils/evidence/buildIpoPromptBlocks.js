const { formatEvidenceSnippets } = require("./formatEvidenceSnippets");
const {
  formatStyleReferenceSnippets,
  isStyleReferenceSource,
} = require("./formatStyleReferenceSnippets");

function shouldUseIpoPromptInjection(workspace, prompt = "") {
  const normalizedPrompt = String(prompt || "").toLowerCase();
  return (
    workspace?.slug?.toLowerCase().includes("financial-info-generator") &&
    (normalizedPrompt.includes("evidence_snippets_with_metadata") ||
      normalizedPrompt.includes("style_reference_snippets"))
  );
}

function buildIpoPromptBlocks(allSources = [], opts = {}) {
  const {
    evidenceMaxSnippets = 12,
    evidenceMaxCharsPerSnippet = 1800,
    styleMaxSnippets = 3,
    styleMaxCharsPerSnippet = 1200,
  } = opts;

  const normalizedSources = Array.isArray(allSources) ? allSources : [];
  const evidenceSources = normalizedSources.filter(
    (source) => !isStyleReferenceSource(source)
  );
  const styleSources = normalizedSources.filter(isStyleReferenceSource);

  const evidenceBlock = formatEvidenceSnippets(evidenceSources, {
    maxSnippets: evidenceMaxSnippets,
    maxCharsPerSnippet: evidenceMaxCharsPerSnippet,
    allowTransactions: false,
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
  injectIpoPromptBlocks,
};
