import strDistance from "js-levenshtein";

const LEVENSHTEIN_MIN = 2;

// Regular expression pattern to match the v4 UUID and the ending .json
const uuidPattern =
  /-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/;
const jsonPattern = /\.json$/;
const fileExtensionPattern = /\.[^.]+$/;
const nonWordPattern = /[^\p{L}\p{N}]+/gu;

// Function to strip UUID v4 and JSON from file names as that will impact search results.
export const stripUuidAndJsonFromString = (input = "") => {
  return input
    ?.replace(uuidPattern, "") // remove v4 uuid
    ?.replace(jsonPattern, "") // remove trailing .json
    ?.replace(fileExtensionPattern, "") // remove remaining file extensions
    ?.replace(/[-_]+/g, " "); // turn slugged names into spaces
};

export const normalizeSearchableString = (input = "") => {
  return stripUuidAndJsonFromString(input)
    ?.toLowerCase()
    ?.replace(nonWordPattern, " ")
    ?.replace(/\s+/g, " ")
    ?.trim();
};

export function filterFileSearchResults(files = [], searchTerm = "") {
  if (!searchTerm) return files?.items || [];

  const normalizedSearchTerm = normalizeSearchableString(searchTerm);
  if (!normalizedSearchTerm) return files?.items || [];
  const searchTokens = normalizedSearchTerm.split(" ");

  const searchResult = [];
  for (const folder of files?.items) {
    const folderNameNormalized = normalizeSearchableString(folder.name);

    // Check for exact match first, then fuzzy match
    if (folderNameNormalized.includes(normalizedSearchTerm)) {
      searchResult.push(folder);
      continue;
    }

    // Check children for matches
    const fileSearchResults = [];
    for (const file of folder?.items) {
      const fileNameNormalized = normalizeSearchableString(file.name);
      const fileTitleNormalized = normalizeSearchableString(file.title);
      const searchTargets = [fileTitleNormalized, fileNameNormalized].filter(
        Boolean
      );
      const hasExactMatch = searchTargets.some((target) =>
        target.includes(normalizedSearchTerm)
      );
      const hasTokenMatch = searchTargets.some((target) =>
        searchTokens.every((token) => target.includes(token))
      );
      const closestDistance = searchTargets.reduce(
        (minDistance, target) =>
          Math.min(minDistance, strDistance(target, normalizedSearchTerm)),
        Infinity
      );

      // Exact match check
      if (hasExactMatch || hasTokenMatch) {
        fileSearchResults.push(file);
      }
      // Fuzzy match only if no exact matches found
      else if (
        fileSearchResults.length === 0 &&
        closestDistance <= LEVENSHTEIN_MIN
      ) {
        fileSearchResults.push(file);
      }
    }

    if (fileSearchResults.length > 0) {
      searchResult.push({
        ...folder,
        items: fileSearchResults,
      });
    }
  }

  return searchResult;
}
