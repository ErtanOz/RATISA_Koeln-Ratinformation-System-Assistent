export interface PaperSearchIndexItem {
  id: string;
  name: string;
  reference: string;
  paperType?: string;
  dateKey?: string;
  searchText: string;
}

export interface PaperSearchIndexMetadata {
  generatedAt: string;
  itemCount: number;
  source: string;
  isPartial: boolean;
  stopReason?: string;
}

export interface PaperSearchIndexDocument {
  metadata: PaperSearchIndexMetadata;
  items: PaperSearchIndexItem[];
}

export interface PaperSearchIndexQueryParams {
  query?: string;
  paperType?: string;
  minDate?: string;
  maxDate?: string;
  offset?: number;
  limit?: number;
}

export interface PaperSearchIndexQueryResult {
  items: PaperSearchIndexItem[];
  totalMatches: number;
}

const INDEX_URL = '/data/paper-search.index.json';

let paperSearchIndexCache: PaperSearchIndexDocument | null = null;
let paperSearchIndexPromise: Promise<PaperSearchIndexDocument> | null = null;

function normalizeSearchText(value?: string): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function matchesDateRange(dateKey: string | undefined, minDate?: string, maxDate?: string): boolean {
  if (!minDate && !maxDate) return true;
  if (!dateKey) return false;
  if (minDate && dateKey < minDate) return false;
  if (maxDate && dateKey > maxDate) return false;
  return true;
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

export async function loadPaperSearchIndex(signal?: AbortSignal): Promise<PaperSearchIndexDocument> {
  if (paperSearchIndexCache) return paperSearchIndexCache;
  if (!paperSearchIndexPromise) {
    paperSearchIndexPromise = fetch(INDEX_URL, { signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Vorlagenindex konnte nicht geladen werden (${response.status}).`);
        }
        const index = (await response.json()) as PaperSearchIndexDocument;
        paperSearchIndexCache = index;
        return index;
      })
      .catch((error) => {
        paperSearchIndexPromise = null;
        throw error;
      });
  }

  return paperSearchIndexPromise;
}

export function clearPaperSearchIndexCache() {
  paperSearchIndexCache = null;
  paperSearchIndexPromise = null;
}

export function queryPaperSearchIndex(
  index: PaperSearchIndexDocument,
  params: PaperSearchIndexQueryParams,
): PaperSearchIndexQueryResult {
  const normalizedQuery = normalizeSearchText(params.query);
  const normalizedType = params.paperType?.trim() || undefined;
  const minDate = params.minDate?.trim() || undefined;
  const maxDate = params.maxDate?.trim() || undefined;
  const offset = Math.max(0, params.offset ?? 0);
  const limit = Math.max(1, params.limit ?? 20);

  const matches = index.items
    .filter((item) => {
      if (!matchesDateRange(item.dateKey, minDate, maxDate)) return false;
      if (!matchesPaperType(item.paperType, normalizedType)) return false;
      if (!normalizedQuery) return true;
      const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
      return tokens.every((token) => item.searchText.includes(token));
    })
    .sort((a, b) => {
      const scoreDiff = scoreMatch(b, normalizedQuery) - scoreMatch(a, normalizedQuery);
      if (scoreDiff !== 0) return scoreDiff;
      const dateA = a.dateKey || '';
      const dateB = b.dateKey || '';
      if (dateA !== dateB) return dateB.localeCompare(dateA);
      return a.name.localeCompare(b.name);
    });

  return {
    items: matches.slice(offset, offset + limit),
    totalMatches: matches.length,
  };
}
