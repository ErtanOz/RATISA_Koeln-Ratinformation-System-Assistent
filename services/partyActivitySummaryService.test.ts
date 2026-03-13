import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPartyActivitySummaryCache,
  getPartyActivityStatsForYear,
  loadPartyActivitySummary,
} from './partyActivitySummaryService';

describe('partyActivitySummaryService', () => {
  afterEach(() => {
    clearPartyActivitySummaryCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads and caches the summary document', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          metadata: {
            generatedAt: '2026-03-12T00:00:00.000Z',
            source: 'test',
            paperCount: 10,
            organizationCount: 2,
            yearCount: 1,
          },
          years: {
            '2026': {
              stats: [{ name: 'Alpha', count: 3, percentage: 100 }],
              motionCount: 3,
              mentionCount: 3,
            },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await loadPartyActivitySummary();
    const second = await loadPartyActivitySummary();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('returns the requested top slice for a year and falls back to empty stats', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            metadata: {
              generatedAt: '2026-03-12T00:00:00.000Z',
              source: 'test',
              paperCount: 10,
              organizationCount: 2,
              yearCount: 1,
            },
            years: {
              '2026': {
                stats: [
                  { name: 'Alpha', count: 4, percentage: 50 },
                  { name: 'Beta', count: 3, percentage: 37.5 },
                  { name: 'Gamma', count: 1, percentage: 12.5 },
                ],
                motionCount: 5,
                mentionCount: 8,
              },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const topTwo = await getPartyActivityStatsForYear('2026', 2);
    const missing = await getPartyActivityStatsForYear('2025', 8);

    expect(topTwo.stats).toEqual([
      { name: 'Alpha', count: 4, percentage: 50 },
      { name: 'Beta', count: 3, percentage: 37.5 },
    ]);
    expect(topTwo.motionCount).toBe(5);
    expect(topTwo.mentionCount).toBe(8);

    expect(missing).toEqual({
      stats: [],
      motionCount: 0,
      mentionCount: 0,
    });
  });
});
