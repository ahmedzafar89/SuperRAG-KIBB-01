const { v4 } = require("uuid");
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");
const { default: slugify } = require("slugify");

const {
  createdDate,
  trashFile,
  writeToServerDocuments,
  documentsFolder,
  directUploadsFolder,
} = require("../../utils/files");
const { tokenizeString } = require("../../utils/tokenizer");

/**
 * -------- Helpers: grid extraction + merge handling ----------
 */
function normalizeCellValue(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v !== "object") return String(v).trim();

  if (v.text) return String(v.text);
  if (v.hyperlink && v.text) return String(v.text);
  if (v.richText) return v.richText.map((r) => r.text).join("");
  if (v.sharedFormula && v.result !== undefined) return String(v.result);
  if (v.formula && v.result !== undefined) return String(v.result);
  if (v.result !== undefined) return String(v.result);
  if (v.error) return String(v.error);

  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// Returns 2D array of strings for used range, with merged cells expanded.
function worksheetToGrid(ws) {
  const maxRow = ws.actualRowCount || ws.rowCount || 0;
  const maxCol = ws.actualColumnCount || ws.columnCount || 0;

  // Build base grid
  const grid = Array.from({ length: maxRow }, () =>
    Array.from({ length: maxCol }, () => "")
  );
  for (let r = 1; r <= maxRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c);
      grid[r - 1][c - 1] = normalizeCellValue(cell.value);
    }
  }

  // Expand merged cells: copy top-left value into merged region
  const merges = ws._merges; // exceljs internal map: key like "A1:B2"
  if (merges && merges.size) {
    for (const mergeRange of merges.keys()) {
      const m = ws._merges.get(mergeRange);
      // m: { top, left, bottom, right } (1-indexed)
      const topVal = grid[m.top - 1]?.[m.left - 1] ?? "";
      for (let r = m.top; r <= m.bottom; r++) {
        for (let c = m.left; c <= m.right; c++) {
          if (!grid[r - 1][c - 1]) grid[r - 1][c - 1] = topVal;
        }
      }
    }
  }

  return trimEmptyGrid(grid);
}

function isEmptyRow(row) {
  return row.every((v) => !v || !String(v).trim());
}

function trimEmptyGrid(grid) {
  // Trim trailing empty rows
  let endRow = grid.length - 1;
  while (endRow >= 0 && isEmptyRow(grid[endRow])) endRow--;
  grid = grid.slice(0, endRow + 1);

  // Trim trailing empty cols
  let endCol = 0;
  for (const row of grid) endCol = Math.max(endCol, row.length);
  let lastNonEmptyCol = endCol - 1;
  while (lastNonEmptyCol >= 0) {
    let any = false;
    for (const row of grid) {
      if (row[lastNonEmptyCol] && String(row[lastNonEmptyCol]).trim()) {
        any = true;
        break;
      }
    }
    if (any) break;
    lastNonEmptyCol--;
  }
  if (lastNonEmptyCol >= 0) {
    grid = grid.map((row) => row.slice(0, lastNonEmptyCol + 1));
  } else {
    grid = [];
  }

  return grid;
}

/**
 * -------- Helpers: table block detection ----------
 * Detect contiguous blocks separated by >=1 empty row.
 */
function splitIntoBlocks(grid) {
  const blocks = [];
  let start = null;

  for (let i = 0; i < grid.length; i++) {
    const empty = isEmptyRow(grid[i]);
    if (!empty && start === null) start = i;
    if ((empty || i === grid.length - 1) && start !== null) {
      const end = empty ? i - 1 : i;
      const block = grid.slice(start, end + 1);
      // Skip tiny noise blocks
      if (block.length >= 2)
        blocks.push({ startRow: start, endRow: end, rows: block });
      start = null;
    }
  }
  return blocks;
}

/**
 * Header depth heuristic:
 * - many finance sheets have 2–3 header rows (years + subheaders)
 */
function detectHeaderDepth(blockRows) {
  const maxCheck = Math.min(6, blockRows.length);

  for (let i = 0; i < maxCheck; i++) {
    const row = blockRows[i];

    const textCells = row.filter(
      (v) => v && !/^[-\d.,]+$/.test(String(v).replace(/,/g, ""))
    ).length;

    const numericCells = row.filter(
      (v) => /^-?\d+(\.\d+)?$/.test(String(v).replace(/,/g, ""))
    ).length;

    // Finance heuristic:
    // Header rows are text-heavy; first numeric-heavy row is data
    if (numericCells >= 3 && numericCells > textCells) {
      return Math.max(1, i);
    }
  }

  // Default for finance statements: assume 2 header rows
  return Math.min(2, blockRows.length - 1);
}

function flattenHeaders(headerRows) {
  // headerRows: array of rows
  const cols = Math.max(...headerRows.map((r) => r.length));
  const flat = [];
  for (let c = 0; c < cols; c++) {
    const parts = [];
    for (let r = 0; r < headerRows.length; r++) {
      const v = headerRows[r][c];
      if (v && String(v).trim()) parts.push(String(v).trim());
    }
    flat.push(parts.join(" | ").replace(/\s+/g, " ").trim() || `col_${c + 1}`);
  }
  // de-dupe
  const seen = new Map();
  return flat.map((h) => {
    const k = h.toLowerCase();
    const n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    return n === 1 ? h : `${h} (${n})`;
  });
}

function toMarkdownTable(headers, rows, maxRows = 200) {
  const safe = (s) =>
    String(s ?? "")
      .replace(/\|/g, "\\|")
      .trim();
  const md = [];
  md.push(`| ${headers.map(safe).join(" | ")} |`);
  md.push(`| ${headers.map(() => "---").join(" | ")} |`);
  const take = rows.slice(0, maxRows);
  for (const row of take) {
    const cells = headers.map((_, i) => safe(row[i] ?? ""));
    md.push(`| ${cells.join(" | ")} |`);
  }
  if (rows.length > maxRows) {
    md.push(`\n…(${rows.length - maxRows} more rows omitted in this chunk)\n`);
  }
  return md.join("\n");
}

function chunkRowsWithHeader(headers, dataRows, chunkSize = 200) {
  const chunks = [];
  for (let i = 0; i < dataRows.length; i += chunkSize) {
    const slice = dataRows.slice(i, i + chunkSize);
    chunks.push({
      rowStart: i,
      rowEnd: Math.min(i + chunkSize - 1, dataRows.length - 1),
      rows: slice,
    });
  }
  return chunks;
}

/**
 * -------- Finance-grade asXlsx ----------
 */
async function asXlsx({
  fullFilePath = "",
  filename = "",
  options = {},
  metadata = {},
}) {
  const documents = [];
  const folderName = slugify(`${path.basename(filename)}-${v4().slice(0, 4)}`, {
    lower: true,
    trim: true,
  });
  const outFolderPath = options.parseOnly
    ? path.resolve(directUploadsFolder, folderName)
    : path.resolve(documentsFolder, folderName);

  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(fullFilePath);

    if (!fs.existsSync(outFolderPath))
      fs.mkdirSync(outFolderPath, { recursive: true });

    for (const ws of wb.worksheets) {
      const sheetName = ws.name || "Sheet";
      console.log(`-- Processing sheet: ${sheetName} --`);

      const grid = worksheetToGrid(ws);
      if (!grid.length) {
        console.warn(`Sheet "${sheetName}" is empty. Skipping.`);
        continue;
      }

      const blocks = splitIntoBlocks(grid);
      if (!blocks.length) continue;

      let tableIndex = 0;
      for (const block of blocks) {
        tableIndex++;

        const headerDepth = detectHeaderDepth(block.rows);
        const headerRows = block.rows.slice(0, headerDepth);
        const dataRows = block.rows.slice(headerDepth);

        // Skip blocks that have no data
        if (!dataRows.length) continue;

        const headers = flattenHeaders(headerRows);
        const rowChunks = chunkRowsWithHeader(
          headers,
          dataRows,
          options.xlsxRowChunkSize || 200
        );

        for (let ci = 0; ci < rowChunks.length; ci++) {
          const chunk = rowChunks[ci];
          const md = toMarkdownTable(
            headers,
            chunk.rows,
            options.xlsxEmbedMaxRows || 120
          );

          const chunkTitle =
            metadata.title ||
            `${filename} - Sheet:${sheetName} - Table:${tableIndex} - Rows:${
              chunk.rowStart + 1
            }-${chunk.rowEnd + 1}`;

          const sheetData = {
            id: v4(),
            url: `file://${path.join(
              outFolderPath,
              `${slugify(sheetName)}-t${tableIndex}-c${ci + 1}.md`
            )}`,
            title: chunkTitle,
            docAuthor: metadata.docAuthor || "Unknown",
            description:
              metadata.description ||
              `Spreadsheet table chunk from sheet "${sheetName}" (table ${tableIndex}, rows ${
                chunk.rowStart + 1
              }-${chunk.rowEnd + 1}).`,
            docSource:
              metadata.docSource || "an xlsx file uploaded by the user.",
            chunkSource: metadata.chunkSource || "",
            published: createdDate(fullFilePath),
            wordCount: md.split(/\s+/).length,
            pageContent: md,
            token_count_estimate: tokenizeString(md),

            // Finance-grade metadata for filtering/reranking
            sheet: sheetName,
            table_index: tableIndex,
            block_start_row: block.startRow + 1,
            block_end_row: block.endRow + 1,
            header_depth: headerDepth,
            data_row_start: headerDepth + 1,
            chunk_row_start: chunk.rowStart + 1,
            chunk_row_end: chunk.rowEnd + 1,
            columns: headers,
            filetype: "xlsx",
          };

          const document = writeToServerDocuments({
            data: sheetData,
            filename: `sheet-${slugify(sheetName)}-t${tableIndex}-c${ci + 1}`,
            destinationOverride: outFolderPath,
            options: { parseOnly: options.parseOnly },
          });

          documents.push(document);
        }
      }

      console.log(
        `[SUCCESS]: Sheet "${sheetName}" parsed into ${tableIndex} table block(s).`
      );
    }
  } catch (err) {
    console.error("Could not process xlsx file!", err);
    return {
      success: false,
      reason: `Error processing ${filename}: ${err.message}`,
      documents: [],
    };
  } finally {
    trashFile(fullFilePath);
  }

  if (!documents.length) {
    return {
      success: false,
      reason: `No valid tables found in ${filename}.`,
      documents: [],
    };
  }

  console.log(
    `[SUCCESS]: ${filename} fully processed. Created ${documents.length} document(s).\n`
  );
  return { success: true, reason: null, documents };
}

module.exports = asXlsx;
