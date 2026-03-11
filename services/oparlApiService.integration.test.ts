import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFromApi, getItem, getList, getListAll, getListSnapshot, search } from './oparlApiService';

function mockPagedResponse() {
  return {
    data: [],
    links: {},
    pagination: {
      currentPage: 1,
      elementsPerPage: 25,
      totalElements: 0,
      totalPages: 1,
    },
  };
}

describe('fetchFromApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('maps HTTP 404 to a user-friendly ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{}', { status: 404, statusText: 'Not Found' }),
      ),
    );

    await expect(fetchFromApi('/missing-resource')).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiError',
        status: 404,
        statusText: 'Ressource nicht gefunden.',
      }),
    );
  });

  it('uses fresh cache entries and avoids duplicate fetches', async () => {
    const payload = { id: 'cached' };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchFromApi<typeof payload>('/cache-resource');
    const second = await fetchFromApi<typeof payload>('/cache-resource');

    expect(first).toEqual(payload);
    expect(second).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('revalidates cache with 304 and returns cached payload', async () => {
    vi.useFakeTimers();
    const payload = { id: 'with-etag' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { ETag: 'test-etag' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));

    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchFromApi<typeof payload>('/revalidate-resource');
    await vi.advanceTimersByTimeAsync(121_000);
    const second = await fetchFromApi<typeof payload>('/revalidate-resource');

    expect(first).toEqual(payload);
    expect(second).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('keeps only page and limit query params in getList()', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(mockPagedResponse()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const params = new URLSearchParams();
    params.set('q', 'verkehr');
    params.set('sort', '-date');
    params.set('page', '2');
    params.set('limit', '10');
    params.set('minDate', '2026-01-01');

    await getList('papers', params);
    const calledUrl = String(fetchMock.mock.calls[0][0]);

    expect(calledUrl).toContain('/oparl/bodies/stadtverwaltung_koeln/papers?');
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('limit=10');
    expect(calledUrl).not.toContain('q=');
    expect(calledUrl).not.toContain('sort=');
    expect(calledUrl).not.toContain('minDate=');
  });

  it('returns single-page list data via getListSnapshot()', async () => {
    const listResponse = {
      data: [{ id: 'a' }, { id: 'b' }],
      links: {},
      pagination: { currentPage: 1, elementsPerPage: 2, totalElements: 2, totalPages: 1 },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(listResponse), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const items = await getListSnapshot<{ id: string }>('meetings');

    expect(items).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/oparl/bodies/stadtverwaltung_koeln/meetings?limit=200',
    );
  });

  it('follows paginated getListAll() links and rewrites absolute next URLs to the proxy path', async () => {
    const page1 = {
      data: [{ id: 'a' }, { id: 'b' }],
      links: {
        next: 'https://buergerinfo.stadt-koeln.de/oparl/bodies/stadtverwaltung_koeln/meetings?page=2&limit=201',
      },
      pagination: { currentPage: 1, elementsPerPage: 2, totalElements: 4, totalPages: 2 },
    };
    const page2 = {
      data: [{ id: 'c' }, { id: 'd' }],
      links: {},
      pagination: { currentPage: 2, elementsPerPage: 2, totalElements: 4, totalPages: 2 },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const items = await getListAll<{ id: string }>('meetings', undefined, 201);

    expect(items).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      '/oparl/bodies/stadtverwaltung_koeln/meetings?limit=201',
    );
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      '/oparl/bodies/stadtverwaltung_koeln/meetings?page=2&limit=201',
    );
  });

  it('rewrites absolute URLs in getItem()', async () => {
    const detailResponse = { id: 'detail-id', name: 'Detail' };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(detailResponse), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const detail = await getItem<typeof detailResponse>(
      'https://buergerinfo.stadt-koeln.de/oparl/meetings/123',
    );

    expect(detail).toEqual(detailResponse);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/oparl/meetings/123');
  });

  it('aborts getListAll() pagination before requesting the next page', async () => {
    const controller = new AbortController();
    const page1 = {
      data: [{ id: 'a' }],
      links: {
        next: 'https://buergerinfo.stadt-koeln.de/oparl/bodies/stadtverwaltung_koeln/meetings?page=2&limit=202',
      },
      pagination: { currentPage: 1, elementsPerPage: 1, totalElements: 2, totalPages: 2 },
    };
    const fetchMock = vi.fn().mockImplementationOnce(() => {
      controller.abort();
      return Promise.resolve(new Response(JSON.stringify(page1), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getListAll<{ id: string }>('meetings', controller.signal, 202)).rejects.toThrow('Aborted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('validates invalid getItem() URLs and supports search paging', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(mockPagedResponse()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getItem('not-a-url')).rejects.toThrow('Invalid URL for getItem');

    await search('meetings', 'verkehr', 3);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('/oparl/bodies/stadtverwaltung_koeln/meetings?');
    expect(calledUrl).toContain('page=3');
  });

  it('returns a timeout ApiError when the request never resolves', async () => {
    vi.useFakeTimers();

    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      }),
    );

    const request = fetchFromApi('/very-slow-resource');
    const capturedError = request.catch((error) => error);

    await vi.advanceTimersByTimeAsync(15_001);

    const error = await capturedError;
    expect(error).toEqual(
      expect.objectContaining({
        name: 'ApiError',
        status: 0,
        statusText: expect.stringContaining('Zeitüberschreitung'),
      }),
    );
  });
});
