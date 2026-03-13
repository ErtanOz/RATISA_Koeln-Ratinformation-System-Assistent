import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildFactionMatchers } from '../utils/factionMatching.ts';
import { computePartyActivityStats } from '../utils/partyActivityStats.ts';
import type { Organization, Paper } from '../types.ts';

const BODY_BASE_URL = 'https://buergerinfo.stadt-koeln.de/oparl/bodies/stadtverwaltung_koeln';
const OUTPUT_PATH = path.resolve(process.cwd(), 'public', 'data', 'party-activity.summary.json');
const LIMITS = {
  organizations: 1000,
  papers: 5000,
};
const FETCH_TIMEOUT_MS = 120_000;
const MAX_CONCURRENCY = 1;
const MAX_RETRIES = 4;
const RETRYABLE_STATUSES = new Set([401, 408, 429, 500, 502, 503, 504]);

interface PagedResponse<T> {
  data: T[];
  links?: {
    next?: string;
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ratisa-party-summary-builder/1.0',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
          continue;
        }

        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= MAX_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error(`Request failed for ${url}`);
}

async function fetchResourcePage<T>(resource: string, page: number, limit: number): Promise<PagedResponse<T>> {
  const url = `${BODY_BASE_URL}/${resource}?page=${page}&limit=${limit}`;
  return fetchJson<PagedResponse<T>>(url);
}

async function fetchAllPages<T extends { id: string }>(resource: string, limit: number): Promise<T[]> {
  const items = new Map<string, T>();
  let nextPage = 1;
  let reachedLastPage = false;

  while (!reachedLastPage) {
    const pages = Array.from({ length: MAX_CONCURRENCY }, (_, index) => nextPage + index);
    const results = await Promise.all(
      pages.map(async (page) => {
        const payload = await fetchResourcePage<T>(resource, page, limit);
        return { page, payload };
      }),
    );

    results.forEach(({ payload }) => {
      payload.data.forEach((item) => {
        if (!items.has(item.id)) {
          items.set(item.id, item);
        }
      });
    });

    const lastPageInBatch = results.find(({ payload }) => !payload.links?.next);
    if (lastPageInBatch) {
      reachedLastPage = true;
    } else {
      nextPage += MAX_CONCURRENCY;
    }
  }

  return Array.from(items.values());
}

function collectYears(papers: Paper[]): string[] {
  return Array.from(
    new Set(
      papers
        .map((paper) => (typeof paper.date === 'string' ? paper.date.slice(0, 4) : ''))
        .filter((year) => /^\d{4}$/.test(year)),
    ),
  ).sort((a, b) => b.localeCompare(a));
}

async function main() {
  console.log('Building party activity summary...');

  const [organizations, papers] = await Promise.all([
    fetchAllPages<Organization>('organizations', LIMITS.organizations),
    fetchAllPages<Paper>('papers', LIMITS.papers),
  ]);

  const factionMatchers = buildFactionMatchers(organizations);
  const years = collectYears(papers);

  const summary = {
    metadata: {
      generatedAt: new Date().toISOString(),
      source: BODY_BASE_URL,
      paperCount: papers.length,
      organizationCount: organizations.length,
      yearCount: years.length,
    },
    years: Object.fromEntries(
      years.map((year) => [
        year,
        computePartyActivityStats({
          papers,
          year,
          factionMatchers,
          topN: Number.POSITIVE_INFINITY,
          unknownLabel: 'Unbekannt',
        }),
      ]),
    ),
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(summary, null, 2), 'utf8');

  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
