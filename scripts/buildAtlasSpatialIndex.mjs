import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ARCHIVE_INDEX_PATH = path.resolve(process.cwd(), 'public', 'data', 'archive-meetings.index.json');
const LEXICON_PATH = path.resolve(process.cwd(), 'public', 'data', 'koeln-spatial-lexicon.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'public', 'data', 'meeting-spatial.index.json');
const SUMMARY_OUTPUT_PATH = path.resolve(process.cwd(), 'public', 'data', 'meeting-spatial.summary.json');

const CONFIDENCE_RANK = {
  low: 0,
  medium: 1,
  high: 2,
};

const DISTRICT_LABELS = {
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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function padNormalized(value) {
  const normalized = normalizeText(value);
  return normalized ? ` ${normalized} ` : ' ';
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildMatcherEntries(lexicon) {
  return lexicon.entries
    .flatMap((entry) => uniqueStrings([entry.term, ...(entry.aliases || [])]).map((term) => ({
      districtId: entry.districtId,
      kind: entry.kind,
      strong: Boolean(entry.strong),
      term: entry.term,
      normalizedTerm: normalizeText(term),
    })))
    .filter((entry) => entry.normalizedTerm.length >= 2)
    .sort((a, b) => b.normalizedTerm.length - a.normalizedTerm.length || a.term.localeCompare(b.term));
}

function toConfidence({ hasDistrictTerm, strongCount, totalCount }) {
  if (hasDistrictTerm || strongCount >= 2) return 'high';
  if (strongCount >= 1) return 'medium';
  return totalCount > 0 ? 'low' : 'low';
}

function matchFields(fields, matcherEntries) {
  const paddedFields = Object.entries(fields).reduce((acc, [fieldName, value]) => {
    const padded = padNormalized(value);
    if (padded.trim()) acc[fieldName] = padded;
    return acc;
  }, {});

  const matchesByDistrict = new Map();

  matcherEntries.forEach((entry) => {
    const matchedFields = Object.entries(paddedFields)
      .filter(([, paddedText]) => paddedText.includes(` ${entry.normalizedTerm} `))
      .map(([fieldName]) => fieldName);

    if (matchedFields.length === 0) return;

    const districtMatch = matchesByDistrict.get(entry.districtId) || {
      terms: new Set(),
      fields: new Set(),
      hasDistrictTerm: false,
      strongCount: 0,
      totalCount: 0,
    };

    districtMatch.terms.add(entry.term);
    matchedFields.forEach((fieldName) => districtMatch.fields.add(fieldName));
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
    .sort((a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] || a.districtId.localeCompare(b.districtId));
}

function toDateKey(value) {
  return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : undefined;
}

async function main() {
  const [archiveRaw, lexiconRaw] = await Promise.all([
    readFile(ARCHIVE_INDEX_PATH, 'utf8'),
    readFile(LEXICON_PATH, 'utf8'),
  ]);

  const archive = JSON.parse(archiveRaw);
  const lexicon = JSON.parse(lexiconRaw);
  const matcherEntries = buildMatcherEntries(lexicon);

  const items = (archive.items || [])
    .map((item) => ({
      id: item.id,
      name: item.name,
      start: item.start,
      end: item.end,
      dateKey: item.dateKey || toDateKey(item.start),
      location: item.location,
      source: 'archive',
      searchText: normalizeText(item.searchText),
      spatialMatches: matchFields(
        {
          name: item.name,
          location: item.location,
          searchText: item.searchText,
        },
        matcherEntries,
      ),
    }))
    .filter((item) => item.spatialMatches.length > 0);

  const districtStats = new Map(
    Object.keys(DISTRICT_LABELS).map((districtId) => [
      districtId,
      { count: 0, lastMeetingDate: undefined, terms: new Map() },
    ]),
  );

  items.forEach((item) => {
    const seenDistricts = new Set();
    item.spatialMatches.forEach((match) => {
      if (seenDistricts.has(match.districtId)) return;
      seenDistricts.add(match.districtId);
      const stat = districtStats.get(match.districtId);
      if (!stat) return;
      stat.count += 1;
      if (item.dateKey && (!stat.lastMeetingDate || item.dateKey > stat.lastMeetingDate)) {
        stat.lastMeetingDate = item.dateKey;
      }
      match.matchedTerms.forEach((term) => {
        stat.terms.set(term, (stat.terms.get(term) || 0) + 1);
      });
    });
  });

  const districts = Array.from(districtStats.entries()).map(([districtId, stat]) => ({
    districtId,
    label: DISTRICT_LABELS[districtId],
    count: stat.count,
    lastMeetingDate: stat.lastMeetingDate,
    topTerms: Array.from(stat.terms.entries())
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .map(([term]) => term),
  }));

  const topDistrict = [...districts]
    .filter((district) => district.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))[0];

  const payload = {
    metadata: {
      generatedAt: new Date().toISOString(),
      itemCount: items.length,
      matchedItemCount: items.length,
      source: ARCHIVE_INDEX_PATH,
      isPartial: Boolean(archive?.metadata?.isPartial),
      stopReason: archive?.metadata?.stopReason || undefined,
    },
    items,
  };

  const summaryPayload = {
    generatedAt: payload.metadata.generatedAt,
    totalMatchedCount: items.length,
    source: ARCHIVE_INDEX_PATH,
    topDistrictId: topDistrict?.districtId,
    districts,
  };

  await Promise.all([
    writeFile(OUTPUT_PATH, JSON.stringify(payload)),
    writeFile(SUMMARY_OUTPUT_PATH, JSON.stringify(summaryPayload)),
  ]);
  console.log(`Wrote ${items.length} atlas archive items to ${OUTPUT_PATH}`);
  console.log(`Wrote atlas summary to ${SUMMARY_OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
