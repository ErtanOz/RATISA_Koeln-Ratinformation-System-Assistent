export interface ArchiveMeetingIndexItem {
  id: string;
  name: string;
  start?: string;
  end?: string;
  dateKey?: string;
  location?: string;
  searchText: string;
}

export interface ArchiveMeetingIndexMetadata {
  generatedAt: string;
  itemCount: number;
  source: string;
  isPartial: boolean;
  stopReason?: string;
}

export interface ArchiveMeetingIndexDocument {
  metadata: ArchiveMeetingIndexMetadata;
  items: ArchiveMeetingIndexItem[];
}

export interface ArchiveMeetingSearchParams {
  query?: string;
  minDate?: string;
  maxDate?: string;
  limit?: number;
}

export interface ArchiveMeetingIndexQueryParams {
  query?: string;
  minDate?: string;
  maxDate?: string;
  offset?: number;
  limit?: number;
}

export interface ArchiveMeetingIndexQueryResult {
  items: ArchiveMeetingIndexItem[];
  totalMatches: number;
}

const INDEX_URL = '/data/archive-meetings.index.json';

let archiveMeetingIndexCache: ArchiveMeetingIndexDocument | null = null;
let archiveMeetingIndexPromise: Promise<ArchiveMeetingIndexDocument> | null = null;

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

function scoreMatch(item: ArchiveMeetingIndexItem, normalizedQuery: string): number {
  if (!normalizedQuery) return 0;
  const haystack = item.searchText;
  if (haystack === normalizedQuery) return 300;
  if (haystack.startsWith(normalizedQuery)) return 220;
  if (haystack.includes(normalizedQuery)) return 160;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  return tokens.reduce((score, token) => {
    if (item.name && normalizeSearchText(item.name).includes(token)) return score + 40;
    if (haystack.includes(token)) return score + 20;
    return score;
  }, 0);
}

export async function loadArchiveMeetingIndex(signal?: AbortSignal): Promise<ArchiveMeetingIndexDocument> {
  if (archiveMeetingIndexCache) return archiveMeetingIndexCache;
  if (!archiveMeetingIndexPromise) {
    archiveMeetingIndexPromise = fetch(INDEX_URL)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Archivindex konnte nicht geladen werden (${response.status}).`);
        }
        const index = (await response.json()) as ArchiveMeetingIndexDocument;
        archiveMeetingIndexCache = index;
        return index;
      })
      .catch((error) => {
        archiveMeetingIndexPromise = null;
        throw error;
      });
  }

  return archiveMeetingIndexPromise;
}

export function clearArchiveMeetingIndexCache() {
  archiveMeetingIndexCache = null;
  archiveMeetingIndexPromise = null;
}

export function searchArchiveMeetingIndex(
  index: ArchiveMeetingIndexDocument,
  params: ArchiveMeetingSearchParams,
): ArchiveMeetingIndexItem[] {
  return queryArchiveMeetingIndex(index, {
    query: params.query,
    minDate: params.minDate,
    maxDate: params.maxDate,
    limit: params.limit,
  }).items;
}

export function queryArchiveMeetingIndex(
  index: ArchiveMeetingIndexDocument,
  params: ArchiveMeetingIndexQueryParams,
): ArchiveMeetingIndexQueryResult {
  const normalizedQuery = normalizeSearchText(params.query);
  const offset = Math.max(0, params.offset ?? 0);
  const limit = Math.max(1, params.limit ?? 20);
  const minDate = params.minDate?.trim() || undefined;
  const maxDate = params.maxDate?.trim() || undefined;

  const matches = index.items
    .filter((item) => {
      if (!matchesDateRange(item.dateKey, minDate, maxDate)) return false;
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
