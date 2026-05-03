const {
  extractIpoPromptContext,
  formatEvidenceSnippets,
} = require("./formatEvidenceSnippets");
const {
  formatStyleReferenceSnippets,
  isStyleReferenceSource,
} = require("./formatStyleReferenceSnippets");

function buildCapitalisationTemplateFallback() {
  return [
    "[Template fallback | 12.2 capitalisation and indebtedness skeleton | non-factual scaffold authorised because no retrieved capitalisation and indebtedness statement was available]",
    "Use this scaffold as a template only.",
    "Keep every bracketed placeholder bracketed.",
    "Do not replace placeholders with guessed facts, figures, dates, labels, or notes.",
    "",
    "Framing paragraph template:",
    "The table below summarises our capitalisation and indebtedness based on the latest [audited/unaudited] financial information as at [date] and after adjusting the effects of [transaction], where applicable.",
    "Optional second sentence when pro forma columns are used: The pro forma financial information below does not represent our actual capitalisation and indebtedness as at [date] and is provided for illustrative purposes only.",
    "",
    "Table template:",
    "|  | Unaudited As at [date] RM'000 | Pro Forma I After [transaction] RM'000 | Pro Forma II After [transaction] and the use of proceeds RM'000 |",
    "| --- | --- | --- | --- |",
    "| Indebtedness | - | - | - |",
    "| Current | - | - | - |",
    "| Secured and guaranteed | - | - | - |",
    "| [Current secured line item 1] | [amount] | [amount] | [amount] |",
    "| [Current secured line item 2] | [amount] | [amount] | [amount] |",
    "| Unsecured and unguaranteed | - | - | - |",
    "| [Current unsecured line item 1] | [amount] | [amount] | [amount] |",
    "| Non-current | - | - | - |",
    "| Secured and guaranteed | - | - | - |",
    "| [Non-current secured line item 1] | [amount] | [amount] | [amount] |",
    "| [Non-current secured line item 2] | [amount] | [amount] | [amount] |",
    "| Unsecured and unguaranteed | - | - | - |",
    "| [Non-current unsecured line item 1] | [amount] | [amount] | [amount] |",
    "| Total indebtedness | [amount] | [amount] | [amount] |",
    "| Total capitalisation | [amount] | [amount] | [amount] |",
    "| Total capitalisation and indebtedness | [amount] | [amount] | [amount] |",
    "| Gearing ratio (times) | [amount] | [amount] | [amount] |",
    "",
    "Notes template:",
    "(1) [Insert indebtedness definition or classification note if disclosed.]",
    "(2) [Insert gearing ratio computation note if disclosed.]",
  ].join("\n");
}

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
    (promptContext.tableHeavy ? 24 : 12);
  const evidenceMaxCharsPerSnippet =
    opts.evidenceMaxCharsPerSnippet ??
    (promptContext.tableHeavy ? 2600 : 1800);
  const styleMaxSnippets = opts.styleMaxSnippets ?? (promptContext.tableHeavy ? 1 : 2);
  const styleMaxCharsPerSnippet =
    opts.styleMaxCharsPerSnippet ?? (promptContext.tableHeavy ? 1200 : 900);

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
    promptContext,
  });

  const styleBlock = formatStyleReferenceSnippets(styleSources, {
    maxSnippets: styleMaxSnippets,
    maxCharsPerSnippet: styleMaxCharsPerSnippet,
    promptContext,
  });
  const fallbackEvidenceBlock =
    promptContext.sectionNumber === "12.2"
      ? buildCapitalisationTemplateFallback()
      : "Not disclosed in the provided documents.";

  return {
    evidenceBlock: evidenceBlock || fallbackEvidenceBlock,
    styleBlock:
      styleBlock || "No style reference snippets were provided.",
  };
}

function injectIpoPromptBlocks(userTemplate = "", blocks = {}) {
  return String(userTemplate || "")
    .replace(
      "<<EVIDENCE_SNIPPETS_WITH_METADATA>>",
      blocks.evidenceBlock ||
        "Not disclosed in the provided documents."
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
