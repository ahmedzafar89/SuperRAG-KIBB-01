/* eslint-env jest, node */
jest.mock("../../../models/documents", () => ({
  Document: {
    where: jest.fn(),
  },
}));

jest.mock("../../../utils/files", () => ({
  fileData: jest.fn(),
}));

const { Document } = require("../../../models/documents");
const { fileData } = require("../../../utils/files");
const {
  filterStyleReferenceSearchResults,
  getWorkspaceStyleReferenceSources,
} = require("../../../utils/evidence/ipoPromptSearch");

describe("IPO prompt style source separation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("filters style reference chunks out of similarity search results", () => {
    const results = filterStyleReferenceSearchResults({
      contextTexts: ["style text", "factual text"],
      sources: [
        {
          title: "Financial Information Style Reference Sample.pdf",
          text: "style text",
        },
        {
          title: "accountant-report.pdf",
          text: "factual text",
        },
      ],
      message: null,
    });

    expect(results.sources).toHaveLength(1);
    expect(results.sources[0].title).toBe("accountant-report.pdf");
    expect(results.contextTexts).toEqual(["factual text"]);
  });

  test("loads workspace style reference documents even when they are not vectorized", async () => {
    Document.where.mockResolvedValue([
      {
        docId: "style-doc",
        docpath: "custom-documents/style-ref.json",
        filename: "style-ref.json",
        metadata: JSON.stringify({
          title: "Financial Information Style Reference Sample.pdf",
          promptRole: "style_reference",
        }),
      },
      {
        docId: "factual-doc",
        docpath: "custom-documents/accountant-report.json",
        filename: "accountant-report.json",
        metadata: JSON.stringify({
          title: "accountant-report.pdf",
        }),
      },
    ]);

    fileData.mockImplementation(async (docpath) => {
      if (docpath.includes("style-ref")) {
        return {
          title: "Financial Information Style Reference Sample.pdf",
          pageContent: "Revenue RM999.00 million",
        };
      }

      return {
        title: "accountant-report.pdf",
        pageContent: "Revenue 100",
      };
    });

    const sources = await getWorkspaceStyleReferenceSources({
      workspace: { id: 7 },
    });

    expect(Document.where).toHaveBeenCalledWith(
      { workspaceId: 7 },
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
    expect(sources).toHaveLength(1);
    expect(sources[0].docId).toBe("style-doc");
    expect(sources[0].title).toBe(
      "Financial Information Style Reference Sample.pdf"
    );
  });
});
