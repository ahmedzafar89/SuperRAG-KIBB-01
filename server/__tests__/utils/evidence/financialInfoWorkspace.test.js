/* eslint-env jest, node */
const fs = require("fs");
const path = require("path");

const {
  extractIpoPromptContext,
  formatEvidenceSnippets,
} = require("../../../utils/evidence/formatEvidenceSnippets");
const {
  buildIpoPromptBlocks,
} = require("../../../utils/evidence/buildIpoPromptBlocks");
const {
  formatStyleReferenceSnippets,
  sanitizeStyleReferenceText,
} = require("../../../utils/evidence/formatStyleReferenceSnippets");
const {
  buildIpoRetrievalQuery,
  expandedIpoTopN,
  mergeIpoPromptSources,
} = require("../../../utils/evidence/ipoPromptSearch");

describe("financial info prompt guards", () => {
  test("system prompt includes anti-leakage and table-fidelity rules", () => {
    const systemPrompt = fs.readFileSync(
      path.join(
        process.cwd(),
        "prompts",
        "system-prompt-financial-info.prompty"
      ),
      "utf8"
    );

    expect(systemPrompt).toContain(
      "Do NOT copy distinctive issuer-specific sentences"
    );
    expect(systemPrompt).toContain(
      'If a cross-reference, defined term, "audited" or "unaudited" label'
    );
    expect(systemPrompt).toContain(
      "Use a short framing paragraph only where the section genuinely needs one."
    );
    expect(systemPrompt).toContain(
      "Do NOT recompute totals or adjust displayed rows to make them tally."
    );
    expect(systemPrompt).toContain(
      'Do NOT replace issuer-specific disclosed periods with generic prospectus shorthand such as "latest two financial years"'
    );
    expect(systemPrompt).toContain(
      "Do NOT use the style reference to infer section numbers, cross-references"
    );
  });

  test("updated section templates cover finance costs and MD&A commentary rules", () => {
    const userPrompt = fs.readFileSync(
      path.join(
        process.cwd(),
        "prompts",
        "updated-user-prompt-financial-info.txt"
      ),
      "utf8"
    );

    expect(userPrompt).toContain("12.3.11 FINANCE COSTS");
    expect(userPrompt).toContain(
      "Start with the general revenue discussion first, then move to segment"
    );
    expect(userPrompt).toContain(
      "Do not use generic regulatory wording such as \"latest two financial years\""
    );
    expect(userPrompt).toContain(
      "Include disclosed indicator notes, formula notes, annualisation notes, and explanatory commentary"
    );
    expect(userPrompt).toContain(
      "Start directly with one complete summary table unless the factual evidence requires a brief basis, unit, or audit-status qualifier."
    );
    expect(userPrompt).toContain(
      "Do not infer any 12-month sufficiency statement, LPD statement, or post-listing funding statement from style convention."
    );
  });
});

describe("IPO prompt source expansion", () => {
  test("uses a larger candidate set than the workspace topN for financial-info prompts", () => {
    expect(expandedIpoTopN({ topN: 12 })).toBe(50);
    expect(expandedIpoTopN({ topN: 80 })).toBe(80);
  });

  test("builds a focused retrieval query from heading and section keywords", () => {
    const query = buildIpoRetrievalQuery(
      "TARGET SECTION HEADING\n12.1.2 CONSOLIDATED STATEMENTS OF FINANCIAL POSITION"
    );

    expect(query).toContain("12.1.2 CONSOLIDATED STATEMENTS OF FINANCIAL POSITION");
    expect(query).toContain("consolidated statements of financial position");
    expect(query).toContain("non-current assets");
    expect(query).toContain("equity and liabilities");
  });

  test("merges expanded IPO sources without duplicating the same document chunk", () => {
    const source = {
      title: "accountant-report.pdf",
      page_number: 28,
      source_section: "CONSOLIDATED STATEMENTS OF CASH FLOWS",
      text: "Net cash generated from operating activities 100",
    };

    const merged = mergeIpoPromptSources(
      [source],
      [
        { ...source },
        {
          title: "style_ref_financial-info_sample.pdf",
          page_number: 5,
          text: "Combined statements of cash flows style section",
        },
      ]
    );

    expect(merged).toHaveLength(2);
    expect(merged[0].title).toBe("accountant-report.pdf");
    expect(merged[1].title).toContain("style_ref");
  });
});

describe("financial info evidence formatting", () => {
  test("keeps multiple chunks from the same source document when the locations differ", () => {
    const block = formatEvidenceSnippets(
      [
        {
          sourceDocument: "accountants-report.docx",
          sheet: "profit_or_loss",
          chunk_row_start: 1,
          chunk_row_end: 8,
          text: "| Revenue | 100 |\n| Cost of sales | 60 |",
        },
        {
          sourceDocument: "accountants-report.docx",
          sheet: "profit_or_loss",
          chunk_row_start: 9,
          chunk_row_end: 16,
          text: "| Gross profit | 40 |\n| Profit before tax | 25 |",
        },
      ],
      {
        maxSnippets: 5,
        promptText:
          "TARGET SECTION HEADING\n12.1.1 CONSOLIDATED STATEMENTS OF PROFIT OR LOSS AND OTHER COMPREHENSIVE INCOME",
      }
    );

    expect(block).toContain("rows:1-8");
    expect(block).toContain("rows:9-16");
  });

  test("adds comparative FPE and note companions for table-heavy cash flow sections", () => {
    const sources = [
      {
        sourceDocument: "accountants-report.docx",
        sheet: "cash_flow",
        table_index: 1,
        chunk_row_start: 10,
        chunk_row_end: 20,
        text: "Cash flows from operating activities\nFYE 2024\nNet cash generated from operating activities",
        score: 0.9,
      },
      {
        sourceDocument: "other-support.docx",
        sheet: "summary",
        chunk_row_start: 1,
        chunk_row_end: 4,
        text: "High scoring but unrelated disclosure about revenue composition.",
        score: 0.8,
      },
      {
        sourceDocument: "accountants-report.docx",
        sheet: "cash_flow",
        table_index: 1,
        chunk_row_start: 21,
        chunk_row_end: 28,
        text: "FPE 2025 and FPE 2024 comparative period\nNet cash used in financing activities",
        score: 0.1,
      },
      {
        sourceDocument: "accountants-report.docx",
        sheet: "cash_flow",
        table_index: 1,
        chunk_row_start: 29,
        chunk_row_end: 36,
        text: "Note: Cash and cash equivalents comprise cash at bank and fixed deposits.",
        score: 0.05,
      },
    ];

    const evidenceBlock = buildIpoPromptBlocks(sources, {
      evidenceMaxSnippets: 3,
      userTemplate: "TARGET SECTION HEADING\n12.4.2 CASH FLOW",
    }).evidenceBlock;

    expect(evidenceBlock).not.toContain(
      "High scoring but unrelated disclosure about revenue composition."
    );
    expect(evidenceBlock).toContain("FPE 2025 and FPE 2024 comparative period");
    expect(evidenceBlock).toContain(
      "Note: Cash and cash equivalents comprise cash at bank and fixed deposits."
    );
  });

  test("extracts table-heavy prompt context from the target heading", () => {
    const context = extractIpoPromptContext(
      "TARGET SECTION HEADING\n12.1.3 CONSOLIDATED STATEMENTS OF CASH FLOWS"
    );

    expect(context.sectionNumber).toBe("12.1.3");
    expect(context.tableHeavy).toBe(true);
    expect(context.includeComparativeFpe).toBe(true);
    expect(context.keywords).toContain("cash flow");
  });

  test("extracts intro and borrowings prompt context from the target heading", () => {
    const introContext = extractIpoPromptContext(
      "TARGET SECTION HEADING\n12.1 HISTORICAL FINANCIAL INFORMATION"
    );
    const borrowingContext = extractIpoPromptContext(
      "TARGET SECTION HEADING\n12.4.3 BANK BORROWINGS"
    );

    expect(introContext.sectionNumber).toBe("12.1");
    expect(introContext.keywords).toContain("historical financial information");
    expect(introContext.keywords).toContain("accountants report");
    expect(borrowingContext.sectionNumber).toBe("12.4.3");
    expect(borrowingContext.keywords).toContain("bank borrowings");
    expect(borrowingContext.keywords).toContain("banking facilities");
  });

  test.each([
    ["12.1.1 CONSOLIDATED STATEMENTS OF PROFIT OR LOSS AND OTHER COMPREHENSIVE INCOME", "Revenue"],
    ["12.1.2 CONSOLIDATED STATEMENTS OF FINANCIAL POSITION", "TOTAL ASSETS"],
    ["12.1.3 CONSOLIDATED STATEMENTS OF CASH FLOWS", "Net cash generated"],
    ["12.2 CAPITALISATION AND INDEBTEDNESS", "Total indebtedness"],
    ["12.4.2 CASH FLOW", "Net cash used"],
    ["12.8 KEY FINANCIAL RATIOS", "Current ratio"],
  ])("keeps nearby PDF page companions for %s", (heading, anchorText) => {
    const sources = [
      {
        title: "accountants-report.pdf",
        filetype: "pdf",
        page_number: 10,
        table_candidate: true,
        source_section: heading,
        text: `${anchorText}\nFYE 2023 100\nFYE 2024 200\nFYE 2025 300`,
        score: 0.9,
      },
      {
        title: "accountants-report.pdf",
        filetype: "pdf",
        page_number: 11,
        table_candidate: true,
        source_section: heading,
        text: `Continuation page\nSubtotal 400 500 600\nTotal 700 800 900`,
        score: 0.1,
      },
      {
        title: "unrelated.pdf",
        filetype: "pdf",
        page_number: 1,
        text: "Unrelated high scoring market disclosure.",
        score: 0.8,
      },
    ];

    const block = formatEvidenceSnippets(sources, {
      maxSnippets: 2,
      promptText: `TARGET SECTION HEADING\n${heading}`,
    });

    expect(block).toContain("page:10");
    expect(block).toContain("page:11");
    expect(block).toContain("Continuation page");
    expect(block).not.toContain("Unrelated high scoring market disclosure");
  });

  test("de-prioritizes pro forma pages for ordinary historical statement sections", () => {
    const block = formatEvidenceSnippets(
      [
        {
          title: "accountants-report.pdf",
          page_number: 30,
          table_candidate: true,
          text: "PRO FORMA COMBINED STATEMENTS OF FINANCIAL POSITION\nPublic Issue\nAfter Pro Forma I\nTOTAL ASSETS 999",
          score: 0.99,
        },
        {
          title: "accountants-report.pdf",
          page_number: 12,
          table_candidate: true,
          text: "CONSOLIDATED STATEMENTS OF FINANCIAL POSITION\nASSETS\nTOTAL ASSETS 100",
          score: 0.2,
        },
      ],
      {
        maxSnippets: 1,
        promptText:
          "TARGET SECTION HEADING\n12.1.2 CONSOLIDATED STATEMENTS OF FINANCIAL POSITION",
      }
    );

    expect(block).toContain("TOTAL ASSETS 100");
    expect(block).not.toContain("TOTAL ASSETS 999");
  });

  test("prefers actual financial position statement pages over accountants report boilerplate", () => {
    const block = formatEvidenceSnippets(
      [
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 19,
          table_candidate: false,
          text: "REPORTING ACCOUNTANTS’ OPINION ON THE CONSOLIDATED FINANCIAL INFORMATION. Restriction on distribution and use.",
          score: 0.9,
        },
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 20,
          table_candidate: true,
          text: "CONSOLIDATED STATEMENTS OF FINANCIAL POSITION\nAs at 31 December 2022 2023 2024 As at 31 July 2025\nNON-CURRENT ASSETS\nProperty, plant and equipment\nInvestment properties\nCURRENT ASSETS\nTOTAL ASSETS",
          score: 0.2,
        },
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 21,
          table_candidate: true,
          text: "CONSOLIDATED STATEMENTS OF FINANCIAL POSITION (CONT'D)\nEQUITY AND LIABILITIES\nShare capital\nRetained profits\nTOTAL EQUITY\nTOTAL LIABILITIES\nTOTAL EQUITY AND LIABILITIES",
          score: 0.2,
        },
      ],
      {
        maxSnippets: 2,
        promptText:
          "TARGET SECTION HEADING\n12.1.2 CONSOLIDATED STATEMENTS OF FINANCIAL POSITION",
      }
    );

    expect(block).toContain("page:20");
    expect(block).toContain("page:21");
    expect(block).toContain("TOTAL ASSETS");
    expect(block).toContain("TOTAL EQUITY AND LIABILITIES");
    expect(block).not.toContain("REPORTING ACCOUNTANTS’ OPINION");
  });

  test("prefers actual profit or loss statement pages over changes in equity pages", () => {
    const block = formatEvidenceSnippets(
      [
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 24,
          table_candidate: true,
          text: "STATEMENT OF CHANGES IN EQUITY\nBalance at 1.1.2022\nDividends\nDistribution to owners",
          score: 0.95,
        },
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 22,
          table_candidate: true,
          text: "CONSOLIDATED STATEMENTS OF PROFIT OR LOSS AND OTHER COMPREHENSIVE INCOME\nRevenue\nCost of sales\nGross profit\nOther income\nAdministrative expenses\nSelling and distribution expenses\nOther expenses\nFinance costs\nNet impairment losses on financial assets\nProfit before taxation",
          score: 0.2,
        },
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 23,
          table_candidate: true,
          text: "PROFIT AFTER TAXATION/TOTAL COMPREHENSIVE INCOME ATTRIBUTABLE TO:\nOwners of the Company\nNon-controlling interests\nBasic\nDiluted\nEarnings per share",
          score: 0.2,
        },
      ],
      {
        maxSnippets: 4,
        promptText:
          "TARGET SECTION HEADING\n12.1.1 CONSOLIDATED STATEMENTS OF PROFIT OR LOSS AND OTHER COMPREHENSIVE INCOME",
      }
    );

    expect(block).toContain("page:22");
    expect(block).toContain("page:23");
    expect(block).toContain("Revenue");
    expect(block).toContain("Earnings per share");
    expect(block).not.toContain("STATEMENT OF CHANGES IN EQUITY");
  });

  test("stops after core financial position statement coverage is present", () => {
    const block = formatEvidenceSnippets(
      [
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 20,
          table_candidate: true,
          text: "CONSOLIDATED STATEMENTS OF FINANCIAL POSITION\nNON-CURRENT ASSETS\nCURRENT ASSETS\nTOTAL ASSETS",
          score: 0.9,
        },
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 21,
          table_candidate: true,
          text: "CONSOLIDATED STATEMENTS OF FINANCIAL POSITION (CONT'D)\nEQUITY AND LIABILITIES\nCURRENT LIABILITIES\nTOTAL LIABILITIES\nTOTAL EQUITY AND LIABILITIES",
          score: 0.8,
        },
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 27,
          table_candidate: true,
          text: "Unaudited interim period table with unrelated figures.",
          score: 0.85,
        },
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 103,
          table_candidate: true,
          text: "Debt-to-equity ratio and capital management note page.",
          score: 0.7,
        },
      ],
      {
        maxSnippets: 6,
        promptText:
          "TARGET SECTION HEADING\n12.1.2 CONSOLIDATED STATEMENTS OF FINANCIAL POSITION",
      }
    );

    expect(block).toContain("page:20");
    expect(block).toContain("page:21");
    expect(block).not.toContain("page:27");
    expect(block).not.toContain("page:103");
  });

  test("keeps multiple relevant chunks from the same financial position PDF page", () => {
    const block = formatEvidenceSnippets(
      [
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 20,
          table_candidate: true,
          text: "CURRENT ASSETS\nInventories\nTrade receivables\nTOTAL ASSETS",
          score: 0.8,
        },
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 20,
          table_candidate: true,
          text: "Fixed deposits with licensed banks\nCash and bank balances\nTOTAL ASSETS",
          score: 0.75,
        },
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 21,
          table_candidate: true,
          text: "EQUITY AND LIABILITIES\nCURRENT LIABILITIES\nTOTAL EQUITY AND LIABILITIES",
          score: 0.7,
        },
      ],
      {
        maxSnippets: 6,
        promptText:
          "TARGET SECTION HEADING\n12.1.2 CONSOLIDATED STATEMENTS OF FINANCIAL POSITION",
      }
    );

    expect(block).toContain("Inventories");
    expect(block).toContain("Cash and bank balances");
    expect(block).toContain("TOTAL EQUITY AND LIABILITIES");
  });

  test("stops after core profit or loss statement coverage is present", () => {
    const block = formatEvidenceSnippets(
      [
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 22,
          table_candidate: true,
          text: "Revenue\nCost of sales\nGross profit\nOther income\nAdministrative expenses\nProfit before taxation",
          score: 0.9,
        },
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 23,
          table_candidate: true,
          text: "Profit after taxation/Total comprehensive income attributable to:\nOwners of the Company\nNon-controlling interests\nBasic\nDiluted\nEarnings per share",
          score: 0.8,
        },
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 24,
          table_candidate: true,
          text: "Balance at 1.1.2022\nDividends\nDistribution to owners",
          score: 0.95,
        },
        {
          title: "accountant-report-JRK.pdf",
          filetype: "pdf",
          page_number: 71,
          table_candidate: true,
          text: "Earnings per share note page with note support only.",
          score: 0.7,
        },
      ],
      {
        maxSnippets: 8,
        promptText:
          "TARGET SECTION HEADING\n12.1.1 CONSOLIDATED STATEMENTS OF PROFIT OR LOSS AND OTHER COMPREHENSIVE INCOME",
      }
    );

    expect(block).toContain("page:22");
    expect(block).toContain("page:23");
    expect(block).not.toContain("page:24");
    expect(block).not.toContain("page:71");
  });

  test("allows pro forma pages for capitalisation and indebtedness", () => {
    const block = formatEvidenceSnippets(
      [
        {
          title: "accountants-report.pdf",
          page_number: 30,
          table_candidate: true,
          text: "PRO FORMA CAPITALISATION AND INDEBTEDNESS\nPublic Issue\nTotal indebtedness 999",
          score: 0.2,
        },
      ],
      {
        maxSnippets: 1,
        promptText: "TARGET SECTION HEADING\n12.2 CAPITALISATION AND INDEBTEDNESS",
      }
    );

    expect(block).toContain("Total indebtedness 999");
  });

  test("sanitizes style reference snippets before injection", () => {
    const styleBlock = formatStyleReferenceSnippets(
      [
        {
          docTitle: "style_ref_financial-info_vetece",
          text: "The following table sets out a summary of Vetece Holdings Berhad for FYE 2023. This should be read together with Section 14 and Note 2.1 of this Prospectus. Revenue was RM20.05 million as at 30 June 2024 with effective tax rate of 24.55%.",
        },
      ],
      { maxSnippets: 1, maxCharsPerSnippet: 500 }
    );

    expect(styleBlock).toContain("[Style reference |");
    expect(styleBlock).toContain("[TABLE_INTRO_PATTERN]");
    expect(styleBlock).toContain("[READING_REFERENCE_PATTERN]");
    expect(styleBlock).toContain("FYE [YEAR]");
    expect(styleBlock).toContain("Section [SECTION]");
    expect(styleBlock).toContain("Note [NOTE]");
    expect(styleBlock).toContain("[CURRENCY_AMOUNT]");
    expect(styleBlock).toContain("[DATE]");
    expect(styleBlock).toContain("[PERCENTAGE]");
    expect(styleBlock).not.toContain("Vetece Holdings Berhad");
    expect(styleBlock).not.toContain("Section 14");
    expect(styleBlock).not.toContain("Note 2.1");
    expect(styleBlock).not.toContain("RM20.05 million");
    expect(styleBlock).not.toContain("30 June 2024");
    expect(styleBlock).not.toContain("24.55%");
    expect(styleBlock).not.toContain("The following table sets out");
    expect(styleBlock).not.toContain("This should be read together with");
  });

  test("buildIpoPromptBlocks returns a sanitized style block", () => {
    const blocks = buildIpoPromptBlocks(
      [
        {
          docTitle: "style_ref_financial-info_reference",
          text: "The table below summarises our capitalisation as at 30 June 2024 after Public Issue.",
        },
      ],
      {
        userTemplate: "TARGET SECTION HEADING\n12.2 CAPITALISATION AND INDEBTEDNESS",
      }
    );

    expect(blocks.styleBlock).toContain("[DATE]");
    expect(blocks.styleBlock).not.toContain("30 June 2024");
  });

  test("style formatter picks matching section text when source section numbers differ", () => {
    const styleBlock = formatStyleReferenceSnippets(
      [
        {
          docTitle: "style_ref_financial-info_sample",
          text: [
            "11.1 HISTORICAL FINANCIAL INFORMATION",
            "This is the chapter introduction.",
            "",
            "11.1.1 Combined statements of profit or loss and other comprehensive income",
            "The following table sets out a summary of our Group's audited combined statements of profit or loss.",
            "Revenue RM20.05 million for FYE 2025.",
            "",
            "11.1.2 Combined statements of financial position",
            "The following table sets out financial position.",
          ].join("\n"),
        },
      ],
      {
        maxSnippets: 1,
        maxCharsPerSnippet: 800,
        promptContext: extractIpoPromptContext(
          "TARGET SECTION HEADING\n12.1.1 CONSOLIDATED STATEMENTS OF PROFIT OR LOSS AND OTHER COMPREHENSIVE INCOME"
        ),
      }
    );

    expect(styleBlock).toContain("profit or loss");
    expect(styleBlock).not.toContain("chapter introduction");
    expect(styleBlock).toContain("[CURRENCY_AMOUNT]");
    expect(styleBlock).toContain("FYE [YEAR]");
  });
});

describe("style reference sanitization", () => {
  test("masks factual details while preserving sentence shape", () => {
    const sanitized = sanitizeStyleReferenceText(
      "The following table sets out our Group's revenue. This should be read together with Section 14. Our Group's revenue increased to RM20.05 million in FYE 2023 and 24.55% was recorded in Section 14."
    );

    expect(sanitized).toContain("[TABLE_INTRO_PATTERN].");
    expect(sanitized).toContain("[READING_REFERENCE_PATTERN].");
    expect(sanitized).toContain("Our Group's revenue increased to [CURRENCY_AMOUNT] in FYE [YEAR] and [PERCENTAGE] was recorded in Section [SECTION].");
    expect(sanitized).not.toContain("RM20.05 million");
    expect(sanitized).not.toContain("2023");
    expect(sanitized).not.toContain("24.55%");
    expect(sanitized).not.toContain("Section 14");
    expect(sanitized).not.toContain("The following table sets out");
    expect(sanitized).not.toContain("This should be read together with");
  });
});
