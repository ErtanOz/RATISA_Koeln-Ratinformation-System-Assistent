import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = 'https://geoportal.stadt-koeln.de/arcgis/rest/services/Basiskarten/kgg_labeled/MapServer';
const DISTRICT_LAYER_ID = 4;
const STADTTEIL_LAYER_ID = 3;
const STADTVIERTEL_LAYER_ID = 1;

const DISTRICTS_OUTPUT = path.resolve(process.cwd(), 'public', 'data', 'koeln-districts.geo.json');
const LEXICON_OUTPUT = path.resolve(process.cwd(), 'public', 'data', 'koeln-spatial-lexicon.json');

const DISTRICT_ID_BY_NAME = {
  Innenstadt: 'innenstadt',
  Rodenkirchen: 'rodenkirchen',
  Lindenthal: 'lindenthal',
  Ehrenfeld: 'ehrenfeld',
  Nippes: 'nippes',
  Chorweiler: 'chorweiler',
  Porz: 'porz',
  Kalk: 'kalk',
  'Mülheim': 'mulheim',
};

const GENERIC_STADTVIERTEL_TERMS = new Set([
  'mitte',
  'nord',
  'sud',
  'west',
  'ost',
  'sudwest',
  'sudost',
  'nordwest',
  'nordost',
  'innen',
  'aussen',
]);

const MANUAL_ENTRIES = [
  { term: 'Kalker Höfe', districtId: 'kalk', kind: 'landmark', strong: true, aliases: ['Kalker Hoefe'] },
  { term: 'Mülheimer Brücke', districtId: 'mulheim', kind: 'landmark', strong: true, aliases: ['Muelheimer Bruecke'] },
  { term: 'Zoobrücke', districtId: 'mulheim', kind: 'landmark', strong: true, aliases: ['Zoobrucke'] },
  { term: 'Deutzer Hafen', districtId: 'innenstadt', kind: 'landmark', strong: true },
  { term: 'Rheinboulevard Porz', districtId: 'porz', kind: 'landmark', strong: true },
];

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function createQueryUrl(layerId, { returnGeometry }) {
  const params = new URLSearchParams({
    f: 'pjson',
    where: 'objectid is not null',
    returnGeometry: returnGeometry ? 'true' : 'false',
    outFields: '*',
  });
  if (returnGeometry) params.set('outSR', '4326');
  return `${BASE_URL}/${layerId}/query?${params.toString()}`;
}

async function fetchLayer(layerId, options) {
  const response = await fetch(createQueryUrl(layerId, options));
  if (!response.ok) {
    throw new Error(`Layer ${layerId} konnte nicht geladen werden (${response.status}).`);
  }
  return response.json();
}

function toDistrictId(rawName) {
  const districtId = DISTRICT_ID_BY_NAME[String(rawName || '').trim()];
  if (!districtId) {
    throw new Error(`Unbekannter Bezirk: ${rawName}`);
  }
  return districtId;
}

function buildDistrictFeature(feature) {
  const name = String(feature?.attributes?.name || '');
  const districtId = toDistrictId(name);
  const rings = Array.isArray(feature?.geometry?.rings) ? feature.geometry.rings : [];

  return {
    type: 'Feature',
    properties: {
      districtId,
      label: name,
      districtNumber: String(feature?.attributes?.nummer || ''),
    },
    geometry: {
      type: 'Polygon',
      coordinates: rings,
    },
  };
}

function shouldKeepStadtviertel(name) {
  const normalized = normalizeText(name);
  if (!normalized) return false;
  if (GENERIC_STADTVIERTEL_TERMS.has(normalized)) return false;
  return normalized.length >= 4 || normalized.includes(' ');
}

function buildLexiconEntry(term, districtId, kind, strong, aliases = []) {
  return {
    term,
    districtId,
    kind,
    strong,
    aliases: aliases.filter(Boolean),
  };
}

function dedupeEntries(entries) {
  const byKey = new Map();

  entries.forEach((entry) => {
    const key = `${entry.districtId}::${normalizeText(entry.term)}::${entry.kind}`;
    const current = byKey.get(key);

    if (!current) {
      byKey.set(key, {
        ...entry,
        aliases: Array.from(new Set(entry.aliases || [])),
      });
      return;
    }

    current.strong = current.strong || entry.strong;
    current.aliases = Array.from(new Set([...(current.aliases || []), ...(entry.aliases || [])]));
  });

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.districtId !== b.districtId) return a.districtId.localeCompare(b.districtId);
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.term.localeCompare(b.term);
  });
}

function buildAliases(term) {
  const aliases = new Set();
  if (term.includes('ß')) aliases.add(term.replace(/ß/g, 'ss'));
  if (term.includes('ä') || term.includes('ö') || term.includes('ü')) {
    aliases.add(term.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue'));
  }
  return Array.from(aliases);
}

async function main() {
  const [districtLayer, stadtteilLayer, stadtviertelLayer] = await Promise.all([
    fetchLayer(DISTRICT_LAYER_ID, { returnGeometry: true }),
    fetchLayer(STADTTEIL_LAYER_ID, { returnGeometry: false }),
    fetchLayer(STADTVIERTEL_LAYER_ID, { returnGeometry: false }),
  ]);

  const districtFeatures = (districtLayer.features || []).map(buildDistrictFeature);

  const districtEntries = districtFeatures.map((feature) =>
    buildLexiconEntry(feature.properties.label, feature.properties.districtId, 'district', true, buildAliases(feature.properties.label)),
  );

  const stadtteilEntries = (stadtteilLayer.features || []).map((feature) => {
    const term = String(feature?.attributes?.name || '').trim();
    const districtId = toDistrictId(feature?.attributes?.stadtbezirk);
    return buildLexiconEntry(term, districtId, 'stadtteil', true, buildAliases(term));
  });

  const stadtviertelEntries = (stadtviertelLayer.features || [])
    .flatMap((feature) => {
      const districtId = toDistrictId(feature?.attributes?.stadtbezirk);
      const name = String(feature?.attributes?.name || '').trim();
      const longName = String(feature?.attributes?.name_lang || '').trim();
      const entries = [];

      if (shouldKeepStadtviertel(name)) {
        entries.push(buildLexiconEntry(name, districtId, 'stadtviertel', false, buildAliases(name)));
      }

      if (shouldKeepStadtviertel(longName) && normalizeText(longName) !== normalizeText(name)) {
        entries.push(buildLexiconEntry(longName, districtId, 'stadtviertel', false, buildAliases(longName)));
      }

      return entries;
    });

  const lexiconEntries = dedupeEntries([
    ...districtEntries,
    ...stadtteilEntries,
    ...stadtviertelEntries,
    ...MANUAL_ENTRIES,
  ]);

  const districtsPayload = {
    type: 'FeatureCollection',
    features: districtFeatures,
  };

  const lexiconPayload = {
    generatedAt: new Date().toISOString(),
    source: `${BASE_URL}/{${DISTRICT_LAYER_ID},${STADTTEIL_LAYER_ID},${STADTVIERTEL_LAYER_ID}}`,
    entries: lexiconEntries,
  };

  await mkdir(path.dirname(DISTRICTS_OUTPUT), { recursive: true });
  await Promise.all([
    writeFile(DISTRICTS_OUTPUT, JSON.stringify(districtsPayload)),
    writeFile(LEXICON_OUTPUT, JSON.stringify(lexiconPayload)),
  ]);

  console.log(`Wrote ${districtFeatures.length} district features to ${DISTRICTS_OUTPUT}`);
  console.log(`Wrote ${lexiconEntries.length} lexicon entries to ${LEXICON_OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
