/* eslint-env jest, node */

process.env.NODE_ENV = "development";

const asPdf = require("../../../../processSingleFile/convert/asPDF");

const {
  createFinancePdfDocument,
  isFinancePdfUpload,
  rebuildPositionedPageText,
} = asPdf.__test__;

describe("finance-grade PDF parsing helpers", () => {
  test("coordinate-based extraction preserves row labels beside values", () => {
    const text = rebuildPositionedPageText([
      { str: "Revenue", x: 10, y: 100, width: 42 },
      { str: "1,000", x: 180, y: 100, width: 24 },
      { str: "2,000", x: 240, y: 100, width: 24 },
      { str: "Cost of sales", x: 10, y: 80, width: 70 },
      { str: "(500)", x: 180, y: 80, width: 24 },
      { str: "(900)", x: 240, y: 80, width: 24 },
    ]);

    expect(text).toContain("Revenue");
    expect(text).toContain("1,000");
    expect(text).toContain("2,000");
    expect(text.indexOf("Revenue")).toBeLessThan(text.indexOf("1,000"));
    expect(text.indexOf("Cost of sales")).toBeLessThan(text.indexOf("(500)"));
  });

  test("finance PDF documents include page and table metadata", () => {
    const document = createFinancePdfDocument({
      fullFilePath: "C:/tmp/accountants-report.pdf",
      filename: "accountants-report.pdf",
      metadata: {},
      published: "2026-04-27",
      page: {
        metadata: {
          loc: { pageNumber: 12 },
          pdf: { totalPages: 30, info: { Creator: "PDF Tool" } },
        },
      },
      content:
        "12.1.1 CONSOLIDATED STATEMENTS OF PROFIT OR LOSS\nRevenue 1,000 2,000\nCost of sales (500) (900)\nGross profit 500 1,100",
    });

    expect(document.filetype).toBe("pdf");
    expect(document.page_number).toBe(12);
    expect(document.table_candidate).toBe(true);
    expect(document.source_section).toContain("12.1.1");
    expect(document.pageContent).toContain("PDF page: 12");
  });

  test("non-financial PDFs are not routed to finance-grade parsing", () => {
    expect(
      isFinancePdfUpload({
        filename: "board-minutes.pdf",
        metadata: { title: "Board minutes" },
      })
    ).toBe(false);

    expect(
      isFinancePdfUpload({
        filename: "STYLE_REF_financial-info_Sample.pdf",
        metadata: {},
      })
    ).toBe(true);
  });
});
