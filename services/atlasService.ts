import {
  AtlasArchiveIndexDocument,
  AtlasConfidence,
  AtlasConfidenceFilter,
  AtlasDistrictFeatureCollection,
  AtlasLexiconDocument,
  AtlasMeetingRecord,
  AtlasMode,
  AtlasSourceField,
  AtlasSpatialMatch,
  AtlasSummaryDocument,
  DistrictId,
  Meeting,
} from '../types';
import {
  ArchiveMeetingIndexDocument,
  ArchiveMeetingIndexItem,
  loadArchiveMeetingIndex,
} from './archiveDeepSearchService';

export const DISTRICT_ORDER: DistrictId[] = [
  'innenstadt',
  'rodenkirchen',
  'lindenthal',
  'ehrenfeld',
  'nippes',
  'chorweiler',
  'porz',
  'kalk',
  'mulheim',
];

export const DISTRICT_LABELS: Record<DistrictId, string> = {
  innenstadt: 'Innenstadt',
  rodenkirchen: 'Rodenkirchen',
  lindenthal: 'Lindenthal',
  ehrenfeld: 'Ehrenfeld',
  nippes: 'Nippes',
  chorweiler: 'Chorweiler',
  porz: 'Porz',
  kalk: 'Kalk',
  mulheim: 'Mülheim',
};

const ATLAS_DISTRICTS_URL = '/data/koeln-districts.geo.json';
const ATLAS_LEXICON_URL = '/data/koeln-spatial-lexicon.json';
const ATLAS_ARCHIVE_URL = '/data/meeting-spatial.index.json';
const ATLAS_SUMMARY_URL = '/data/meeting-spatial.summary.json';

const CONFIDENCE_RANK: Record<AtlasConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

type AtlasFieldMap = Partial<Record<AtlasSourceField, string>>;

interface AtlasMatcherEntry {
  districtId: DistrictId;
  term: string;
  normalizedTerm: string;
  kind: string;
  strong: boolean;
}

interface AtlasMatcher {
  entries: AtlasMatcherEntry[];
}

export interface AtlasFilterParams {
  query?: string;
  minDate?: string;
  maxDate?: string;
  district?: DistrictId;
  mode?: AtlasMode;
  confidence?: AtlasConfidenceFilter;
}

export interface AtlasDistrictStat {
  districtId: DistrictId;
  label: string;
  count: number;
  lastMeetingDate?: string;
  topTerms: string[];
}

let districtsCache: AtlasDistrictFeatureCollection | null = null;
let lexiconCache: AtlasLexiconDocument | null = null;
let archiveCache: AtlasArchiveIndexDocument | null = null;
let summaryCache: AtlasSummaryDocument | null = null;
let districtsPromise: Promise<AtlasDistrictFeatureCollection> | null = null;
let lexiconPromise: Promise<AtlasLexiconDocument> | null = null;
let archivePromise: Promise<AtlasArchiveIndexDocument> | null = null;
let summaryPromise: Promise<AtlasSummaryDocument> | null = null;

function getConfidenceThreshold(filter: AtlasConfidenceFilter = 'all'): number {
  if (filter === 'high') return CONFIDENCE_RANK.high;
  if (filter === 'medium') return CONFIDENCE_RANK.medium;
  return CONFIDENCE_RANK.low;
}

function isFiniteDate(value?: string): boolean {
  if (!value) return false;
  return Number.isFinite(new Date(value).getTime());
}

export function normalizeAtlasText(value?: string): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function padNormalizedText(value?: string): string {
  const normalized = normalizeAtlasText(value);
  return normalized ? ` ${normalized} ` : ' ';
}

function hasBoundedTerm(paddedText: string, normalizedTerm: string): boolean {
  if (!normalizedTerm) return false;
  return paddedText.includes(` ${normalizedTerm} `);
}

function toDateKey(value?: string): string | undefined {
  if (typeof value !== 'string' || value.length < 10) return undefined;
  return value.slice(0, 10);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function compareByTermSpecificity(a: AtlasMatcherEntry, b: AtlasMatcherEntry): number {
  if (a.normalizedTerm.length !== b.normalizedTerm.length) {
    return b.normalizedTerm.length - a.normalizedTerm.length;
  }
  return a.term.localeCompare(b.term);
}

function buildSearchText(values: Array<string | undefined>): string {
  return normalizeAtlasText(values.filter(Boolean).join(' '));
}

function getMeetingLocation(meeting: Meeting): string {
  if (!meeting.location) return '';
  if (typeof meeting.location === 'string') return meeting.location;
  return meeting.location.description || meeting.location.streetAddress || meeting.location.locality || '';
}

function getMeetingAgendaText(meeting: Meeting): string {
  return (meeting.agendaItem || [])
    .map((item) => item?.name || '')
    .filter(Boolean)
    .join(' ');
}

function toConfidence(match: {
  hasDistrictTerm: boolean;
  strongCount: number;
  totalCount: number;
}): AtlasConfidence {
  if (match.hasDistrictTerm || match.strongCount >= 2) return 'high';
  if (match.strongCount >= 1) return 'medium';
  return match.totalCount > 0 ? 'low' : 'low';
}

export function getDistrictLabel(districtId: DistrictId): string {
  return DISTRICT_LABELS[districtId];
}

export function createAtlasMatcher(document: AtlasLexiconDocument): AtlasMatcher {
  const compiled = document.entries.flatMap((entry) => {
    const variants = uniqueStrings([entry.term, ...(entry.aliases || [])]);
    return variants
      .map((term) => ({
        districtId: entry.districtId,
        term: entry.term,
        normalizedTerm: normalizeAtlasText(term),
        kind: entry.kind,
        strong: Boolean(entry.strong),
      }))
      .filter((item) => item.normalizedTerm.length >= 2);
  });

  compiled.sort(compareByTermSpecificity);

  return { entries: compiled };
}

export function matchAtlasFields(fields: AtlasFieldMap, matcher: AtlasMatcher): AtlasSpatialMatch[] {
  const paddedFields = Object.entries(fields).reduce<Partial<Record<AtlasSourceField, string>>>(
    (acc, [fieldName, value]) => {
      const padded = padNormalizedText(value);
      if (padded.trim()) {
        acc[fieldName as AtlasSourceField] = padded;
      }
      return acc;
    },
    {},
  );

  const matchesByDistrict = new Map<
    DistrictId,
    {
      terms: Set<string>;
      fields: Set<AtlasSourceField>;
      hasDistrictTerm: boolean;
      strongCount: number;
      totalCount: number;
    }
  >();

  matcher.entries.forEach((entry) => {
    const matchedFields = Object.entries(paddedFields)
      .filter(([, paddedText]) => hasBoundedTerm(paddedText as string, entry.normalizedTerm))
      .map(([fieldName]) => fieldName as AtlasSourceField);

    if (matchedFields.length === 0) return;

    const districtMatch = matchesByDistrict.get(entry.districtId) || {
      terms: new Set<string>(),
      fields: new Set<AtlasSourceField>(),
      hasDistrictTerm: false,
      strongCount: 0,
      totalCount: 0,
    };

    districtMatch.terms.add(entry.term);
    matchedFields.forEach((field) => districtMatch.fields.add(field));
    districtMatch.hasDistrictTerm ||= entry.kind === 'district';
    if (entry.strong) districtMatch.strongCount += 1;
    districtMatch.totalCount += 1;

    matchesByDistrict.set(entry.districtId, districtMatch);
  });

  return Array.from(matchesByDistrict.entries())
    .map(([districtId, match]) => ({
      districtId,
      matchedTerms: Array.from(match.terms).sort((a, b) => b.length - a.length || a.localeCompare(b)),
      sourceFields: Array.from(match.fields),
      confidence: toConfidence(match),
    }))
    .sort((a, b) => {
      const confidenceDiff = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
      if (confidenceDiff !== 0) return confidenceDiff;
      return a.districtId.localeCompare(b.districtId);
    });
}

function isAtlasMeetingRecord(value: unknown): value is AtlasMeetingRecord {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as AtlasMeetingRecord).id === 'string' &&
      typeof (value as AtlasMeetingRecord).searchText === 'string' &&
      Array.isArray((value as AtlasMeetingRecord).spatialMatches),
  );
}

export function mapMeetingToAtlasRecord(meeting: Meeting, matcher: AtlasMatcher): AtlasMeetingRecord {
  const location = getMeetingLocation(meeting);
  const agendaText = getMeetingAgendaText(meeting);
  const searchText = buildSearchText([meeting.name, location, agendaText]);

  return {
    id: meeting.id,
    name: meeting.name,
    start: meeting.start,
    end: meeting.end,
    dateKey: toDateKey(meeting.start),
    location,
    source: 'live',
    searchText,
    spatialMatches: matchAtlasFields(
      {
        name: meeting.name,
        location,
        agenda: agendaText,
        searchText,
      },
      matcher,
    ),
  };
}

export function mapArchiveItemToAtlasRecord(
  item: ArchiveMeetingIndexItem | AtlasMeetingRecord,
  matcher?: AtlasMatcher,
): AtlasMeetingRecord {
  if (isAtlasMeetingRecord(item)) {
    return {
      ...item,
      source: 'archive',
    };
  }

  const searchText = normalizeAtlasText(item.searchText);
  return {
    id: item.id,
    name: item.name,
    start: item.start,
    end: item.end,
    dateKey: item.dateKey || toDateKey(item.start),
    location: item.location,
    source: 'archive',
    searchText,
    spatialMatches: matcher
      ? matchAtlasFields(
          {
            name: item.name,
            location: item.location,
            searchText,
          },
          matcher,
        )
      : [],
  };
}

function compareAtlasRecordsDesc(a: AtlasMeetingRecord, b: AtlasMeetingRecord): number {
  const timeA = a.start ? new Date(a.start).getTime() : Number.NaN;
  const timeB = b.start ? new Date(b.start).getTime() : Number.NaN;

  if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) {
    return timeB - timeA;
  }
  if (Number.isFinite(timeA) && !Number.isFinite(timeB)) return -1;
  if (!Number.isFinite(timeA) && Number.isFinite(timeB)) return 1;
  return a.name.localeCompare(b.name);
}

export function mergeAtlasRecords(records: AtlasMeetingRecord[]): AtlasMeetingRecord[] {
  const merged = new Map<string, AtlasMeetingRecord>();

  records.forEach((record) => {
    const current = merged.get(record.id);
    if (!current) {
      merged.set(record.id, record);
      return;
    }

    if (current.source === 'archive' && record.source === 'live') {
      merged.set(record.id, record);
      return;
    }

    if (current.source === record.source) {
      const currentScore = current.spatialMatches.length;
      const nextScore = record.spatialMatches.length;
      if (nextScore > currentScore) {
        merged.set(record.id, record);
      }
    }
  });

  return Array.from(merged.values()).sort(compareAtlasRecordsDesc);
}

export function getRelevantSpatialMatches(
  record: AtlasMeetingRecord,
  district?: DistrictId,
  confidence: AtlasConfidenceFilter = 'all',
): AtlasSpatialMatch[] {
  const threshold = getConfidenceThreshold(confidence);
  return record.spatialMatches.filter((match) => {
    if (district && match.districtId !== district) return false;
    return CONFIDENCE_RANK[match.confidence] >= threshold;
  });
}

export function filterAtlasRecords(
  records: AtlasMeetingRecord[],
  params: AtlasFilterParams,
): AtlasMeetingRecord[] {
  const normalizedQuery = normalizeAtlasText(params.query);
  const mode = params.mode || 'all';
  const confidence = params.confidence || 'all';

  return records.filter((record) => {
    if (mode !== 'all' && record.source !== mode) return false;
    if (params.minDate && (!record.dateKey || record.dateKey < params.minDate)) return false;
    if (params.maxDate && (!record.dateKey || record.dateKey > params.maxDate)) return false;
    if (normalizedQuery && !record.searchText.includes(normalizedQuery)) return false;
    return getRelevantSpatialMatches(record, params.district, confidence).length > 0;
  });
}

export function buildAtlasDistrictStats(
  records: AtlasMeetingRecord[],
  confidence: AtlasConfidenceFilter = 'all',
): AtlasDistrictStat[] {
  const stats = new Map<
    DistrictId,
    {
      count: number;
      lastMeetingDate?: string;
      terms: Map<string, number>;
    }
  >();

  DISTRICT_ORDER.forEach((districtId) => {
    stats.set(districtId, { count: 0, terms: new Map<string, number>() });
  });

  records.forEach((record) => {
    const seenDistricts = new Set<DistrictId>();
    getRelevantSpatialMatches(record, undefined, confidence).forEach((match) => {
      if (seenDistricts.has(match.districtId)) return;
      seenDistricts.add(match.districtId);

      const districtStat = stats.get(match.districtId);
      if (!districtStat) return;

      districtStat.count += 1;
      if (record.dateKey && (!districtStat.lastMeetingDate || record.dateKey > districtStat.lastMeetingDate)) {
        districtStat.lastMeetingDate = record.dateKey;
      }
      match.matchedTerms.forEach((term) => {
        districtStat.terms.set(term, (districtStat.terms.get(term) || 0) + 1);
      });
    });
  });

  return DISTRICT_ORDER.map((districtId) => {
    const districtStat = stats.get(districtId)!;
    const topTerms = Array.from(districtStat.terms.entries())
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .map(([term]) => term);

    return {
      districtId,
      label: getDistrictLabel(districtId),
      count: districtStat.count,
      lastMeetingDate: districtStat.lastMeetingDate,
      topTerms,
    };
  });
}

export function buildAtlasTopDistrict(stats: AtlasDistrictStat[]): AtlasDistrictStat | null {
  const top = [...stats]
    .filter((stat) => stat.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))[0];
  return top || null;
}

async function fetchPublicJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} konnte nicht geladen werden (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export async function loadKoelnDistricts(signal?: AbortSignal): Promise<AtlasDistrictFeatureCollection> {
  if (districtsCache) return districtsCache;
  if (!districtsPromise) {
    districtsPromise = fetchPublicJson<AtlasDistrictFeatureCollection>(ATLAS_DISTRICTS_URL)
      .then((districts) => {
        districtsCache = districts;
        return districts;
      })
      .catch((error) => {
        districtsPromise = null;
        throw error;
      });
  }
  return districtsPromise;
}

export async function loadKoelnSpatialLexicon(signal?: AbortSignal): Promise<AtlasLexiconDocument> {
  if (lexiconCache) return lexiconCache;
  if (!lexiconPromise) {
    lexiconPromise = fetchPublicJson<AtlasLexiconDocument>(ATLAS_LEXICON_URL)
      .then((lexicon) => {
        lexiconCache = lexicon;
        return lexicon;
      })
      .catch((error) => {
        lexiconPromise = null;
        throw error;
      });
  }
  return lexiconPromise;
}

function toAtlasArchiveDocument(
  archive: ArchiveMeetingIndexDocument,
  matcher: AtlasMatcher,
): AtlasArchiveIndexDocument {
  const items = archive.items
    .map((item) => mapArchiveItemToAtlasRecord(item, matcher))
    .filter((item) => item.spatialMatches.length > 0);
  return {
    metadata: {
      generatedAt: archive.metadata.generatedAt,
      itemCount: items.length,
      matchedItemCount: items.filter((item) => item.spatialMatches.length > 0).length,
      source: archive.metadata.source,
      isPartial: archive.metadata.isPartial,
      stopReason: archive.metadata.stopReason,
    },
    items,
  };
}

export async function loadAtlasArchiveIndex(signal?: AbortSignal): Promise<AtlasArchiveIndexDocument> {
  if (archiveCache) return archiveCache;
  if (!archivePromise) {
    archivePromise = fetchPublicJson<AtlasArchiveIndexDocument>(ATLAS_ARCHIVE_URL)
      .catch(async (error) => {
        archivePromise = null;
        const message = error instanceof Error ? error.message : '';
        if (!message.includes('(404)')) throw error;

        const [archiveIndex, lexicon] = await Promise.all([
          loadArchiveMeetingIndex(signal),
          loadKoelnSpatialLexicon(signal),
        ]);
        const matcher = createAtlasMatcher(lexicon);
        return toAtlasArchiveDocument(archiveIndex, matcher);
      })
      .then((archiveIndex) => {
        archiveCache = archiveIndex;
        return archiveIndex;
      });
  }
  return archivePromise;
}

export async function loadAtlasSummary(signal?: AbortSignal): Promise<AtlasSummaryDocument> {
  if (summaryCache) return summaryCache;
  if (!summaryPromise) {
    summaryPromise = fetchPublicJson<AtlasSummaryDocument>(ATLAS_SUMMARY_URL)
      .catch(async (error) => {
        summaryPromise = null;
        const message = error instanceof Error ? error.message : '';
        if (!message.includes('(404)')) throw error;

        const archiveIndex = await loadAtlasArchiveIndex(signal);
        const districts = buildAtlasDistrictStats(archiveIndex.items);
        const topDistrict = buildAtlasTopDistrict(districts);
        return {
          generatedAt: archiveIndex.metadata.generatedAt,
          totalMatchedCount: archiveIndex.items.length,
          source: archiveIndex.metadata.source,
          topDistrictId: topDistrict?.districtId,
          districts,
        };
      })
      .then((summary) => {
        summaryCache = summary;
        return summary;
      });
  }
  return summaryPromise;
}

export function clearAtlasDataCache() {
  districtsCache = null;
  lexiconCache = null;
  archiveCache = null;
  summaryCache = null;
  districtsPromise = null;
  lexiconPromise = null;
  archivePromise = null;
  summaryPromise = null;
}

export function pickRecordHighlightMatch(
  record: AtlasMeetingRecord,
  district?: DistrictId,
  confidence: AtlasConfidenceFilter = 'all',
): AtlasSpatialMatch | undefined {
  const relevantMatches = getRelevantSpatialMatches(record, district, confidence);
  return [...relevantMatches].sort((a, b) => {
    const confidenceDiff = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
    if (confidenceDiff !== 0) return confidenceDiff;
    return b.matchedTerms.length - a.matchedTerms.length;
  })[0];
}

export function formatAtlasDate(value?: string): string | undefined {
  if (!isFiniteDate(value)) return undefined;
  return value;
}
