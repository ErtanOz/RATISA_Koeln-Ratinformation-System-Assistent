import { readFile } from "node:fs/promises";
import { resolvePaperSearchIndexPath } from "./runtimePaths.js";

export interface PaperSearchIndexItem {
  id: string;
  name: string;
  reference: string;
  paperType?: string;
  dateKey?: string;
  searchText: string;
}

export interface PaperSearchIndexDocument {
  metadata: {
    generatedAt: string;
    itemCount: number;
    source: string;
    isPartial: boolean;
    stopReason?: string;
  };
  items: PaperSearchIndexItem[];
}

export interface PaperSearchIndexQueryParams {
  query?: string;
  paperType?: string;
  offset?: number;
  limit?: number;
}

export interface PaperSearchIndexQueryResult {
  items: PaperSearchIndexItem[];
  totalMatches: number;
}

const INDEX_PATH = resolvePaperSearchIndexPath({ moduleUrl: import.meta.url });

let cachedIndex: PaperSearchIndexDocument | null = null;
let cachedIndexPromise: Promise<PaperSearchIndexDocument> | null = null;

function normalizeSearchText(value?: string): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function matchesPaperType(itemType: string | undefined, paperType?: string): boolean {
  if (!paperType) return true;
  const normalizedItemType = normalizeSearchText(itemType);
  const normalizedPaperType = normalizeSearchText(paperType);
  if (!normalizedItemType || !normalizedPaperType) return false;
  return normalizedItemType.includes(normalizedPaperType);
}

function scoreMatch(item: PaperSearchIndexItem, normalizedQuery: string): number {
  if (!normalizedQuery) return 0;

  const normalizedName = normalizeSearchText(item.name);
  const normalizedReference = normalizeSearchText(item.reference);
  const haystack = item.searchText;

  if (normalizedName === normalizedQuery) return 320;
  if (normalizedReference === normalizedQuery) return 310;
  if (haystack === normalizedQuery) return 300;
  if (normalizedName.startsWith(normalizedQuery)) return 240;
  if (haystack.startsWith(normalizedQuery)) return 220;
  if (normalizedName.includes(normalizedQuery)) return 180;
  if (haystack.includes(normalizedQuery)) return 160;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  return tokens.reduce((score, token) => {
    if (normalizedReference.includes(token)) return score + 50;
    if (normalizedName.includes(token)) return score + 40;
    if (haystack.includes(token)) return score + 20;
    return score;
  }, 0);
}

function isPaperSearchIndexDocument(value: unknown): value is PaperSearchIndexDocument {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as PaperSearchIndexDocument).items),
  );
}

export async function loadPaperSearchIndex(): Promise<PaperSearchIndexDocument> {
  if (cachedIndex) {
    return cachedIndex;
  }

  if (!cachedIndexPromise) {
    cachedIndexPromise = readFile(INDEX_PATH, "utf-8")
      .then((rawContent) => JSON.parse(rawContent) as unknown)
      .then((parsed) => {
        if (!isPaperSearchIndexDocument(parsed)) {
          throw new Error("paper-search.index.json hat ein ungültiges Format.");
        }
        cachedIndex = parsed;
        return parsed;
      })
      .catch((error) => {
        cachedIndexPromise = null;
        throw error;
      });
  }

  return cachedIndexPromise;
}

export function queryPaperSearchIndex(
  index: PaperSearchIndexDocument,
  params: PaperSearchIndexQueryParams,
): PaperSearchIndexQueryResult {
  const normalizedQuery = normalizeSearchText(params.query);
  const normalizedType = params.paperType?.trim() || undefined;
  const offset = Math.max(0, params.offset ?? 0);
  const limit = Math.max(1, params.limit ?? 20);

  const matches = index.items
    .filter((item) => matchesPaperType(item.paperType, normalizedType))
    .filter((item) => {
      if (!normalizedQuery) return true;
      const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
      return tokens.every((token) => item.searchText.includes(token));
    })
    .sort((a, b) => {
      const scoreDiff = scoreMatch(b, normalizedQuery) - scoreMatch(a, normalizedQuery);
      if (scoreDiff !== 0) return scoreDiff;

      const dateA = a.dateKey || "";
      const dateB = b.dateKey || "";
      if (dateA !== dateB) return dateB.localeCompare(dateA);

      return a.name.localeCompare(b.name);
    });

  return {
    items: matches.slice(offset, offset + limit),
    totalMatches: matches.length,
  };
}
