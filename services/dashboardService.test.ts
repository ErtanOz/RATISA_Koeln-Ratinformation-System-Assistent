import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRecentPaperCount, fetchUpcomingDashboardMeetings } from './dashboardService';
import * as apiService from './oparlApiService';

vi.mock('./oparlApiService', async () => {
  const actual = await vi.importActual<typeof import('./oparlApiService')>('./oparlApiService');

  return {
    ...actual,
    getList: vi.fn(),
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
});
