import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL =
  'https://buergerinfo.stadt-koeln.de/oparl/bodies/stadtverwaltung_koeln/meetings?limit=200';
const OUTPUT_PATH = path.resolve(process.cwd(), 'public', 'data', 'archive-meetings.index.json');
const FETCH_TIMEOUT_MS = 20_000;
const MAX_PAGES = Math.max(1, Number(process.env.ARCHIVE_INDEX_MAX_PAGES || '25'));

function toDateKey(value) {
  return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : '';
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function mapMeeting(meeting) {
  const location =
    typeof meeting?.location === 'object'
      ? meeting?.location?.description || ''
      : String(meeting?.location || '');
  const agendaNames = Array.isArray(meeting?.agendaItem)
    ? meeting.agendaItem
        .map((item) => (typeof item === 'object' && item?.name ? String(item.name) : ''))
        .filter(Boolean)
    : [];
  const name = String(meeting?.name || '');
  const start = typeof meeting?.start === 'string' ? meeting.start : '';
  const dateKey = toDateKey(start);

  return {
    id: String(meeting?.id || ''),
    name,
    start,
    end: typeof meeting?.end === 'string' ? meeting.end : undefined,
    dateKey,
    location,
    searchText: normalizeSearchText([name, location, ...agendaNames].join(' ')),
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function main() {
  const todayKey = toDateKey(new Date().toISOString());
  const seenIds = new Set();
  const items = [];

  let fetchedPages = 0;
  let nextUrl = BASE_URL;
  let isPartial = false;
  let stopReason = '';

  while (nextUrl && fetchedPages < MAX_PAGES) {
    try {
      const payload = await fetchJson(nextUrl);
      fetchedPages += 1;

      const pageItems = Array.isArray(payload?.data) ? payload.data : [];
      for (const rawMeeting of pageItems) {
        const mapped = mapMeeting(rawMeeting);
        if (!mapped.id || seenIds.has(mapped.id)) continue;
        seenIds.add(mapped.id);

        if (mapped.dateKey && mapped.dateKey <= todayKey) {
          items.push(mapped);
        }
      }

      nextUrl = typeof payload?.links?.next === 'string' ? payload.links.next : '';
    } catch (error) {
      isPartial = true;
      stopReason = `Stopped after ${fetchedPages} page(s): ${
        error instanceof Error ? error.message : 'unknown error'
      }`;
      break;
    }
  }

  if (nextUrl && fetchedPages >= MAX_PAGES) {
    isPartial = true;
    stopReason = `Stopped at max page limit (${MAX_PAGES}).`;
  }

  items.sort((a, b) => {
    const dateA = a.dateKey || '';
    const dateB = b.dateKey || '';
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return a.name.localeCompare(b.name);
  });

  const payload = {
    metadata: {
      generatedAt: new Date().toISOString(),
      itemCount: items.length,
      source: BASE_URL,
      isPartial,
      stopReason: stopReason || undefined,
    },
    items,
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(payload));

  console.log(
    `Wrote ${items.length} archive meeting records to ${OUTPUT_PATH} (pages=${fetchedPages}, partial=${isPartial})`,
  );
  if (stopReason) {
    console.log(stopReason);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
