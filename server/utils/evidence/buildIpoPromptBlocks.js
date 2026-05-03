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
    "Framing paragraph templates:",
    "The table below summarises our capitalisation and indebtedness based on the latest [audited/unaudited] financial information as at [date] and after adjusting the effects of [transaction 1] and [transaction 2], where applicable.",
    "The pro forma financial information below does not represent our actual capitalisation and indebtedness as at [date] and is provided for illustrative purposes only.",
    "",
    "Table template:",
    "|  | Unaudited | Pro Forma I | Pro Forma II |",
    "| --- | --- | --- | --- |",
    "|  | As at [date] | After [transaction 1] | After [transaction 1] and the use of proceeds |",
    "|  | RM'000 | RM'000 | RM'000 |",
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

function buildMdnaTemplateFallback(sectionNumber = "") {
  switch (sectionNumber) {
    case "12.3":
      return [
        "[Template fallback | 12.3 MD&A introduction skeleton | non-factual scaffold authorised because no retrieved MD&A introduction disclosure was available]",
        "Use this scaffold as a template only.",
        "Keep every bracketed placeholder bracketed.",
        "Do not replace placeholders with guessed facts, figures, dates, labels, or reasons.",
        "",
        "Paragraph 1 template:",
        "The following discussion and analysis of our financial condition and results of operations should be read together with the historical financial information of our Group as set out in Section [12.1] of this Prospectus and the Accountants' Report in Section [14] / Appendix [•] of this Prospectus. This discussion focuses on [our principal business activities / operating segments / key revenue streams] for the Financial Years/Period Under Review.",
        "",
        "Paragraph 2 template:",
        "Our financial condition and results of operations during the Financial Years/Period Under Review were principally affected by [key revenue drivers], [cost structure / cost drivers], [timing of recognition / project progress], and [other material operating factors], as further discussed in Sections 12.3.1 to 12.3.4 below.",
      ].join("\n");
    case "12.3.1":
      return [
        "[Template fallback | 12.3.1 business overview skeleton | non-factual scaffold authorised because no retrieved business-overview disclosure was available]",
        "Use this scaffold as a template only.",
        "Keep every bracketed placeholder bracketed.",
        "Do not replace placeholders with guessed facts, figures, dates, labels, or claims.",
        "",
        "Paragraph 1 template:",
        "We are principally engaged in [principal business activity / business model]. Our business comprises [operating segments / principal services / principal products] in [locations / markets / geographical areas].",
        "",
        "Paragraph 2 template:",
        "Our operations are supported by [projects / development activities / customer base / operating facilities], and our revenue is principally derived from [main revenue source / principal segment / principal market].",
      ].join("\n");
    case "12.3.2":
      return [
        "[Template fallback | 12.3.2 significant factors placeholder | non-factual scaffold authorised because this section may be completed from risk factors and no retrieved section-specific disclosure was available]",
        "Use this scaffold as a template only.",
        "Keep every bracketed placeholder bracketed.",
        "Do not replace placeholders with guessed facts, figures, dates, labels, or conclusions.",
        "",
        "Paragraph template:",
        "The significant factors materially affecting our operations and financial results include [factor 1], [factor 2], [factor 3], and [factor 4]. Further details should be cross-referred to the section headed [Risk Factors] on pages [•] to [•] of this Prospectus, where applicable.",
      ].join("\n");
    case "12.3.3":
      return [
        "[Template fallback | 12.3.3 results overview skeleton | non-factual scaffold authorised because no retrieved overview-of-results disclosure was available]",
        "Use this scaffold as a template only.",
        "Keep every bracketed placeholder bracketed.",
        "Do not replace placeholders with guessed facts, figures, dates, labels, or reasons.",
        "",
        "Summary table template:",
        "| Results of operations | FYE [year 1] | FYE [year 2] | FYE [year 3] | FPE [current period] | FPE [comparative period] |",
        "| --- | --- | --- | --- | --- | --- |",
        "| Revenue | [amount] | [amount] | [amount] | [amount] | [amount] |",
        "| Gross profit | [amount] | [amount] | [amount] | [amount] | [amount] |",
        "| Profit before taxation | [amount] | [amount] | [amount] | [amount] | [amount] |",
        "| Profit after taxation | [amount] | [amount] | [amount] | [amount] | [amount] |",
        "",
        "Paragraph 1 template:",
        "During the Financial Years/Period Under Review, our results of operations were primarily driven by [revenue composition / operating segments / project contribution / geographic contribution].",
        "",
        "Paragraph 2 template:",
        "Our operating results were also affected by [cost of sales], [gross profit and gross profit margin], [other income], [administrative expenses], [selling and distribution expenses], [other expenses / impairment losses], [finance costs], and [taxation], where applicable.",
      ].join("\n");
    case "12.3.4":
      return [
        "[Template fallback | 12.3.4 revenue skeleton | non-factual scaffold authorised because no retrieved revenue-analysis disclosure was available]",
        "Use this scaffold as a template only.",
        "Keep every bracketed placeholder bracketed.",
        "Do not replace placeholders with guessed facts, figures, dates, labels, or reasons.",
        "",
        "Introductory paragraph template:",
        "Our revenue was derived from [principal segment / principal service / principal product / principal project category] during the Financial Years/Period Under Review. The table below summarises our revenue by [segment / category / project / geographical market], where applicable.",
        "",
        "Revenue table template:",
        "| Revenue | FYE [year 1] | FYE [year 2] | FYE [year 3] | FPE [current period] | FPE [comparative period] |",
        "| --- | --- | --- | --- | --- | --- |",
        "| [Revenue line item 1] | [amount] | [amount] | [amount] | [amount] | [amount] |",
        "| [Revenue line item 2] | [amount] | [amount] | [amount] | [amount] | [amount] |",
        "| Total revenue | [amount] | [amount] | [amount] | [amount] | [amount] |",
        "",
        "Comparison paragraph templates:",
        "(a) FYE [year 2] compared to FYE [year 1]",
        "[Insert one opening paragraph summarising the movement in revenue, the main revenue components, and the relevant disclosed drivers between FYE [year 2] and FYE [year 1].]",
        "",
        "(b) FYE [year 3] compared to FYE [year 2]",
        "[Insert one opening paragraph summarising the movement in revenue, the main revenue components, and the relevant disclosed drivers between FYE [year 3] and FYE [year 2].]",
        "",
        "(c) FPE [current period] compared to FPE [comparative period]",
        "[Insert one opening paragraph summarising the movement in revenue, the main revenue components, and the relevant disclosed drivers between FPE [current period] and FPE [comparative period].]",
      ].join("\n");
    default:
      return "";
  }
}

function buildIpoTemplateFallback(sectionNumber = "") {
  if (sectionNumber === "12.2") return buildCapitalisationTemplateFallback();
  return buildMdnaTemplateFallback(sectionNumber);
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
    buildIpoTemplateFallback(promptContext.sectionNumber) ||
    "Not disclosed in the provided documents.";

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
