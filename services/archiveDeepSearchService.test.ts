import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearArchiveMeetingIndexCache,
  loadArchiveMeetingIndex,
  queryArchiveMeetingIndex,
  searchArchiveMeetingIndex,
} from './archiveDeepSearchService';

describe('archiveDeepSearchService', () => {
  afterEach(() => {
    clearArchiveMeetingIndexCache();
    vi.restoreAllMocks();
  });

  it('searches the archive index by normalized text and date range', () => {
    const results = searchArchiveMeetingIndex(
      {
        metadata: {
          generatedAt: '2026-03-11T00:00:00.000Z',
          itemCount: 3,
          source: 'test',
          isPartial: false,
        },
        items: [
          {
            id: 'm-1',
            name: 'Radverkehr Ausschuss',
            start: '2026-02-10T10:00:00+01:00',
            dateKey: '2026-02-10',
            location: 'Rathaus',
            searchText: 'radverkehr ausschuss rathaus',
          },
          {
            id: 'm-2',
            name: 'Schulbau Sitzung',
            start: '2026-01-05T10:00:00+01:00',
            dateKey: '2026-01-05',
            location: 'Spanischer Bau',
            searchText: 'schulbau sitzung spanischer bau',
          },
          {
            id: 'm-3',
            name: 'Radverkehr Strategie',
            start: '2026-03-01T10:00:00+01:00',
            dateKey: '2026-03-01',
            location: 'Rathaus',
            searchText: 'radverkehr strategie rathaus',
          },
        ],
      },
      {
        query: 'Rädverkehr',
        minDate: '2026-02-01',
      },
    );

    expect(results.map((item) => item.id)).toEqual(['m-3', 'm-1']);
  });

  it('returns paged archive index results with total matches', () => {
    const index = {
      metadata: {
        generatedAt: '2026-03-11T00:00:00.000Z',
        itemCount: 4,
        source: 'test',
        isPartial: false,
      },
      items: [
        {
          id: 'm-1',
          name: 'Aelteste Sitzung',
          start: '2024-01-05T10:00:00+01:00',
          dateKey: '2024-01-05',
          location: 'Historisches Rathaus',
          searchText: 'aelteste sitzung historisches rathaus',
        },
        {
          id: 'm-2',
          name: 'Zweite Sitzung',
          start: '2024-01-12T10:00:00+01:00',
          dateKey: '2024-01-12',
          location: 'Historisches Rathaus',
          searchText: 'zweite sitzung historisches rathaus',
        },
        {
          id: 'm-3',
          name: 'Maerz Sitzung',
          start: '2024-03-01T10:00:00+01:00',
          dateKey: '2024-03-01',
          location: 'Spanischer Bau',
          searchText: 'maerz sitzung spanischer bau',
        },
        {
          id: 'm-4',
          name: 'April Sitzung',
          start: '2024-04-01T10:00:00+02:00',
          dateKey: '2024-04-01',
          location: 'Spanischer Bau',
          searchText: 'april sitzung spanischer bau',
        },
      ],
    };

    const maxDateOnly = queryArchiveMeetingIndex(index, {
      maxDate: '2024-01-31',
      offset: 0,
      limit: 10,
    });

    expect(maxDateOnly.totalMatches).toBe(2);
    expect(maxDateOnly.items.map((item) => item.id)).toEqual(['m-2', 'm-1']);

    const boundedPage = queryArchiveMeetingIndex(index, {
      minDate: '2024-01-01',
      maxDate: '2024-04-30',
      offset: 1,
      limit: 2,
    });

    expect(boundedPage.totalMatches).toBe(4);
    expect(boundedPage.items.map((item) => item.id)).toEqual(['m-3', 'm-2']);
  });

  it('caches the archive index fetch until the cache is cleared', async () => {
    const payload = {
      metadata: {
        generatedAt: '2026-03-11T00:00:00.000Z',
        itemCount: 1,
        source: 'test',
        isPartial: false,
      },
      items: [{ id: 'm-1', name: 'Archiv', searchText: 'archiv' }],
    };

    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetchMock);

    const first = await loadArchiveMeetingIndex();
    const second = await loadArchiveMeetingIndex();

    expect(first).toEqual(payload);
    expect(second).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clearArchiveMeetingIndexCache();
    await loadArchiveMeetingIndex();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
