const { v4 } = require("uuid");
const {
  createdDate,
  trashFile,
  writeToServerDocuments,
} = require("../../../utils/files");
const { tokenizeString } = require("../../../utils/tokenizer");
const { default: slugify } = require("slugify");
const PDFLoader = require("./PDFLoader");
const OCRLoader = require("../../../utils/OCRLoader");

function isFinancePdfUpload({ filename = "", metadata = {} } = {}) {
  const haystack = [
    filename,
    metadata.title,
    metadata.description,
    metadata.docSource,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes("accountant") ||
    haystack.includes("accountants") ||
    haystack.includes("financial-info") ||
    haystack.includes("style_ref_financial-info")
  );
}

function groupPositionedItemsIntoRows(items = [], yTolerance = 3) {
  const sorted = [...items]
    .filter((item) => item && String(item.str || "").trim())
    .sort((a, b) => {
      const yDelta = Number(b.y || 0) - Number(a.y || 0);
      if (Math.abs(yDelta) > yTolerance) return yDelta;
      return Number(a.x || 0) - Number(b.x || 0);
    });

  const rows = [];
  for (const item of sorted) {
    const row = rows.find(
      (candidate) => Math.abs(Number(candidate.y || 0) - Number(item.y || 0)) <= yTolerance
    );
    if (row) {
      row.items.push(item);
      row.y = (row.y + Number(item.y || 0)) / 2;
    } else {
      rows.push({ y: Number(item.y || 0), items: [item] });
    }
  }

  return rows
    .sort((a, b) => Number(b.y || 0) - Number(a.y || 0))
    .map((row) => ({
      ...row,
      items: row.items.sort((a, b) => Number(a.x || 0) - Number(b.x || 0)),
    }));
}

function positionedRowToText(items = []) {
  let output = "";
  let previous = null;

  for (const item of items) {
    const text = String(item.str || "").trim();
    if (!text) continue;

    if (!previous) {
      output += text;
      previous = item;
      continue;
    }

    const previousEnd = Number(previous.x || 0) + Number(previous.width || 0);
    const gap = Math.max(0, Number(item.x || 0) - previousEnd);
    const averageCharWidth =
      previous.width && previous.str ? Number(previous.width) / String(previous.str).length : 4;
    const spaces = Math.max(1, Math.min(12, Math.round(gap / Math.max(averageCharWidth, 3))));
    output += " ".repeat(spaces) + text;
    previous = item;
  }

  return output.replace(/[ \t]+$/g, "");
}

function rebuildPositionedPageText(items = []) {
  return groupPositionedItemsIntoRows(items)
    .map((row) => positionedRowToText(row.items))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function detectSourceSection(text = "") {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const heading = lines.find((line) =>
    /^(?:\d{1,2}(?:\.\d+){0,3}\s+)?[A-Z][A-Z0-9'\u2019(),/&\-\s]{8,}$/.test(line)
  );
  return heading || null;
}

function isTableCandidate(text = "") {
  const lines = String(text || "").split(/\r?\n/);
  const numericRows = lines.filter((line) => {
    const numericCells = line.match(/\(?-?\d[\d,]*(?:\.\d+)?%?\)?|\[[^\]]+\]/g);
    return numericCells && numericCells.length >= 2;
  }).length;

  return numericRows >= 3;
}

function createFinancePdfDocument({
  fullFilePath = "",
  filename = "",
  metadata = {},
  page = {},
  content = "",
  published = "unknown",
}) {
  const pageNumber = page.metadata?.loc?.pageNumber || null;
  const sourceSection = detectSourceSection(content);
  const data = {
    id: v4(),
    url: "file://" + fullFilePath,
    title: metadata.title || filename,
    docAuthor:
      metadata.docAuthor ||
      page.metadata?.pdf?.info?.Creator ||
      "no author found",
    description:
      metadata.description ||
      page.metadata?.pdf?.info?.Title ||
      `Finance-grade PDF page ${pageNumber || "unknown"}.`,
    docSource: metadata.docSource || "pdf file uploaded by the user.",
    chunkSource: metadata.chunkSource || "",
    published,
    wordCount: content.split(/\s+/).filter(Boolean).length,
    pageContent: [
      pageNumber ? `PDF page: ${pageNumber}` : null,
      sourceSection ? `Source section: ${sourceSection}` : null,
      content,
    ]
      .filter(Boolean)
      .join("\n"),
    token_count_estimate: tokenizeString(content),
    filetype: "pdf",
    page_number: pageNumber,
    source_section: sourceSection,
    table_candidate: isTableCandidate(content),
    total_pages: page.metadata?.pdf?.totalPages || null,
  };

  return data;
}

async function convertFinancePdf({
  fullFilePath = "",
  filename = "",
  options = {},
  metadata = {},
  pdfLoader,
}) {
  const pages = await pdfLoader.loadPositionedPages();
  const published = createdDate(fullFilePath);
  const documents = [];

  for (const page of pages) {
    const content = rebuildPositionedPageText(page.items || []);
    const pageNumber = page.metadata?.loc?.pageNumber || "unknown";
    console.log(`-- Parsing finance-grade content from pg ${pageNumber} --`);
    if (!content) continue;

    const data = createFinancePdfDocument({
      fullFilePath,
      filename,
      metadata,
      page,
      content,
      published,
    });

    const document = writeToServerDocuments({
      data,
      filename: `${slugify(filename)}-p${pageNumber}-${data.id}`,
      options: { parseOnly: options.parseOnly },
    });
    documents.push(document);
  }

  return documents;
}

async function asPdf({
  fullFilePath = "",
  filename = "",
  options = {},
  metadata = {},
}) {
  const pdfLoader = new PDFLoader(fullFilePath, {
    splitPages: true,
  });

  console.log(`-- Working ${filename} --`);
  const pageContent = [];
  let docs = [];

  if (isFinancePdfUpload({ filename, metadata })) {
    const financeDocuments = await convertFinancePdf({
      fullFilePath,
      filename,
      options,
      metadata,
      pdfLoader,
    }).catch((error) => {
      console.error(`[asPDF] Finance-grade parse failed for ${filename}:`, error.message);
      return [];
    });

    if (financeDocuments.length > 0) {
      trashFile(fullFilePath);
      console.log(
        `[SUCCESS]: ${filename} converted into ${financeDocuments.length} finance-grade PDF page document(s).\n`
      );
      return { success: true, reason: null, documents: financeDocuments };
    }
  }

  docs = await pdfLoader.load();

  if (docs.length === 0) {
    console.log(
      `[asPDF] No text content found for ${filename}. Will attempt OCR parse.`
    );
    docs = await new OCRLoader({
      targetLanguages: options?.ocr?.langList,
    }).ocrPDF(fullFilePath);
  }

  for (const doc of docs) {
    console.log(
      `-- Parsing content from pg ${
        doc.metadata?.loc?.pageNumber || "unknown"
      } --`
    );
    if (!doc.pageContent || !doc.pageContent.length) continue;
    pageContent.push(doc.pageContent);
  }

  if (!pageContent.length) {
    console.error(`[asPDF] Resulting text content was empty for ${filename}.`);
    trashFile(fullFilePath);
    return {
      success: false,
      reason: `No text content found in ${filename}.`,
      documents: [],
    };
  }

  const content = pageContent.join("");
  const data = {
    id: v4(),
    url: "file://" + fullFilePath,
    title: metadata.title || filename,
    docAuthor:
      metadata.docAuthor ||
      docs[0]?.metadata?.pdf?.info?.Creator ||
      "no author found",
    description:
      metadata.description ||
      docs[0]?.metadata?.pdf?.info?.Title ||
      "No description found.",
    docSource: metadata.docSource || "pdf file uploaded by the user.",
    chunkSource: metadata.chunkSource || "",
    published: createdDate(fullFilePath),
    wordCount: content.split(" ").length,
    pageContent: content,
    token_count_estimate: tokenizeString(content),
  };

  const document = writeToServerDocuments({
    data,
    filename: `${slugify(filename)}-${data.id}`,
    options: { parseOnly: options.parseOnly },
  });
  trashFile(fullFilePath);
  console.log(`[SUCCESS]: ${filename} converted & ready for embedding.\n`);
  return { success: true, reason: null, documents: [document] };
}

module.exports = asPdf;
module.exports.__test__ = {
  createFinancePdfDocument,
  detectSourceSection,
  groupPositionedItemsIntoRows,
  isFinancePdfUpload,
  isTableCandidate,
  positionedRowToText,
  rebuildPositionedPageText,
};
