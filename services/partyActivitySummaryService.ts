import { PartyActivityStatsResult } from '../utils/partyActivityStats';

const PARTY_ACTIVITY_SUMMARY_URL = '/data/party-activity.summary.json';

interface PartyActivitySummaryDocument {
  metadata: {
    generatedAt: string;
    source: string;
    paperCount: number;
    organizationCount: number;
    yearCount: number;
  };
  years: Record<string, PartyActivityStatsResult>;
}

let summaryCache: PartyActivitySummaryDocument | null = null;
let summaryPromise: Promise<PartyActivitySummaryDocument> | null = null;

async function fetchSummary(): Promise<PartyActivitySummaryDocument> {
  const response = await fetch(PARTY_ACTIVITY_SUMMARY_URL, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Party activity summary could not be loaded (${response.status}).`);
  }

  return response.json() as Promise<PartyActivitySummaryDocument>;
}

export async function loadPartyActivitySummary(): Promise<PartyActivitySummaryDocument> {
  if (summaryCache) return summaryCache;

  if (!summaryPromise) {
    summaryPromise = fetchSummary()
      .then((document) => {
        summaryCache = document;
        return document;
      })
      .finally(() => {
        summaryPromise = null;
      });
  }

  return summaryPromise;
}

export async function getPartyActivityStatsForYear(
  year: string,
  topN = 8,
): Promise<PartyActivityStatsResult> {
  const summary = await loadPartyActivitySummary();
  const yearStats = summary.years[year];

  if (!yearStats) {
    return {
      stats: [],
      motionCount: 0,
      mentionCount: 0,
    };
  }

  return {
    stats: yearStats.stats.slice(0, topN),
    motionCount: yearStats.motionCount,
    mentionCount: yearStats.mentionCount,
  };
}

export function clearPartyActivitySummaryCache() {
  summaryCache = null;
  summaryPromise = null;
}
