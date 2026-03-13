import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchPartyActivityStatsForYear,
  fetchRecentPaperCount,
  fetchUpcomingDashboardMeetings,
} from './dashboardService';
import * as apiService from './oparlApiService';
import * as partySummaryService from './partyActivitySummaryService';

const apiMocks = vi.hoisted(() => ({
  getList: vi.fn(),
}));

vi.mock('./oparlApiService', async () => {
  const actualApiService = await vi.importActual<typeof import('./oparlApiService')>('./oparlApiService');

  return {
    ...actualApiService,
    getList: apiMocks.getList,
  };
});

vi.mock('./partyActivitySummaryService', async () => {
  const actual = await vi.importActual<typeof import('./partyActivitySummaryService')>(
    './partyActivitySummaryService',
  );

  return {
    ...actual,
    getPartyActivityStatsForYear: vi.fn(),
  };
});

function mockPagedResponse<T>(data: T[], hasNext = false) {
  return {
    data,
    links: hasNext ? { next: '/next-page' } : {},
    pagination: {
      currentPage: 1,
      elementsPerPage: data.length,
      totalElements: data.length,
      totalPages: 1,
    },
  };
}

describe('dashboardService', () => {
  beforeEach(() => {
    vi.mocked(apiService.getList).mockReset();
    vi.mocked(partySummaryService.getPartyActivityStatsForYear).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns the next upcoming meetings from a bounded page snapshot', async () => {
    const getListMock = vi.mocked(apiService.getList);

    getListMock.mockImplementation(async (resource, params) => {
      expect(resource).toBe('meetings');
      const page = Number((params as URLSearchParams).get('page') || '1');

      if (page === 1) {
        return mockPagedResponse(
          [
            { id: 'm-far', name: 'Herbstsitzung', start: '2026-10-20T10:00:00+02:00' },
            { id: 'm-5', name: 'Bezirksvertretung Innenstadt', start: '2026-03-12T16:00:00+01:00' },
          ] as any[],
          true,
        ) as any;
      }

      if (page === 2) {
        return mockPagedResponse(
          [
            { id: 'm-1', name: 'Kulturausschuss', start: '2026-03-12T15:30:00+01:00' },
            { id: 'm-old', name: 'Vergangene Sitzung', start: '2026-03-10T12:00:00+01:00' },
            { id: 'm-4', name: 'Bezirksvertretung Kalk', start: '2026-03-12T17:00:00+01:00' },
          ] as any[],
          true,
        ) as any;
      }

      return mockPagedResponse(
        [
          { id: 'm-2', name: 'Orchester', start: '2026-03-12T15:30:00+01:00' },
          { id: 'm-3', name: 'Wallraf', start: '2026-03-12T15:30:00+01:00' },
          { id: 'm-4', name: 'Bezirksvertretung Kalk', start: '2026-03-12T17:00:00+01:00' },
          { id: 'm-6', name: 'Chorweiler', start: '2026-03-12T17:00:00+01:00' },
        ] as any[],
      ) as any;
    });

    const meetings = await fetchUpcomingDashboardMeetings(
      undefined,
      new Date('2026-03-11T09:00:00+01:00'),
    );

    expect(getListMock).toHaveBeenCalledTimes(3);
    expect(meetings.map((meeting) => meeting.id)).toEqual(['m-1', 'm-2', 'm-3', 'm-5', 'm-4']);
  });

  it('counts recent papers and stops after the batch crosses the cutoff date', async () => {
    const getListMock = vi.mocked(apiService.getList);

    getListMock.mockImplementation(async (resource, params) => {
      expect(resource).toBe('papers');
      const page = Number((params as URLSearchParams).get('page') || '1');

      if (page === 1) {
        return mockPagedResponse(
          [
            { id: 'p-1', date: '2026-03-10' },
            { id: 'p-2', date: '2026-03-03' },
          ] as any[],
          true,
        ) as any;
      }

      if (page === 2) {
        return mockPagedResponse(
          [
            { id: 'p-3', date: '2026-02-28' },
            { id: 'p-4', date: '2026-02-25' },
          ] as any[],
          true,
        ) as any;
      }

      if (page === 3) {
        return mockPagedResponse(
          [
            { id: 'p-4', date: '2026-02-25' },
            { id: 'p-5', date: '2026-02-20' },
          ] as any[],
          true,
        ) as any;
      }

      return mockPagedResponse([{ id: 'p-6', date: '2026-02-12' }] as any[]) as any;
    });

    const count = await fetchRecentPaperCount(undefined, new Date('2026-03-11T09:00:00+01:00'), 14);

    expect(count).toBe(4);
    expect(getListMock).toHaveBeenCalledTimes(3);
  });

  it('loads exact party activity stats from the summary service', async () => {
    vi.mocked(partySummaryService.getPartyActivityStatsForYear).mockResolvedValue({
      stats: [
        { name: 'Alpha', count: 2, percentage: 66.6666666667 },
        { name: 'Beta', count: 1, percentage: 33.3333333333 },
      ],
      motionCount: 2,
      mentionCount: 3,
    });

    const result = await fetchPartyActivityStatsForYear('2026');

    expect(apiService.getList).not.toHaveBeenCalled();
    expect(partySummaryService.getPartyActivityStatsForYear).toHaveBeenCalledWith('2026', 8);
    expect(result.motionCount).toBe(2);
    expect(result.mentionCount).toBe(3);
    const statsByName = new Map(result.stats.map((entry) => [entry.name, entry]));
    expect(statsByName.get('Alpha')?.count).toBe(2);
    expect(statsByName.get('Beta')?.count).toBe(1);
    expect(statsByName.get('Alpha')?.percentage).toBeCloseTo(66.6666666667, 6);
    expect(statsByName.get('Beta')?.percentage).toBeCloseTo(33.3333333333, 6);
  });

  it('propagates abort errors from summary-based party activity loading', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    vi.mocked(partySummaryService.getPartyActivityStatsForYear).mockResolvedValue({
      stats: [],
      motionCount: 0,
      mentionCount: 0,
    });

    const controller = new AbortController();
    controller.abort();

    await expect(fetchPartyActivityStatsForYear('2026', controller.signal)).rejects.toThrow('Aborted');
    expect(apiService.getList).not.toHaveBeenCalled();
  });
});
