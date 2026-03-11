
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getList, getItem, getListSnapshot } from '../services/oparlApiService';
import { PagedResponse } from '../types';

const ITEMS_PER_PAGE = 25;

// ─── Existing hooks (unchanged) ──────────────────────────────────────────────

export function useOparlList<T>(resource: string, params?: URLSearchParams) {
  const [data, setData] = useState<PagedResponse<T> | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const paramsString = useMemo(() => {
    if (!params) return '';
    const p = new URLSearchParams(params);
    p.sort();
    return p.toString();
  }, [params]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const currentParams = new URLSearchParams(paramsString);
      const result = await getList<T>(resource, currentParams, controller.signal);
      if (!controller.signal.aborted) { setData(result); setIsLoading(false); }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (!controller.signal.aborted) { console.error(`Failed to fetch ${resource}:`, e); setError(e as Error); setIsLoading(false); }
    }
  }, [resource, paramsString]);

  useEffect(() => {
    fetchData();
    return () => { if (abortControllerRef.current) abortControllerRef.current.abort(); };
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}

export function useOparlItem<T>(url: string | undefined | null) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (!url) { setIsLoading(false); setData(null); return; }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getItem<T>(url, controller.signal);
      if (!controller.signal.aborted) { setData(result); setIsLoading(false); }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      if (!controller.signal.aborted) { console.error(`Failed to fetch item ${url}:`, e); setError(e as Error); setIsLoading(false); }
    }
  }, [url]);

  useEffect(() => {
    fetchData();
    return () => { if (abortControllerRef.current) abortControllerRef.current.abort(); };
  }, [fetchData]);

  return { data, isLoading, error };
}

// ─── Client-side filtering hook ───────────────────────────────────────────────

export interface FilterConfig {
    q?: string;               // free-text search on name/reference/familyName
    minDate?: string;         // YYYY-MM-DD — compared against item.date / item.start
    maxDate?: string;         // YYYY-MM-DD
    dateField?: string;       // which field carries the date, default: 'date' (papers) / 'start' (meetings)
    fieldFilters?: Record<string, string>; // e.g. { paperType: 'Antrag' } — contains match
    sortField?: string;       // field to sort by
    sortDesc?: boolean;       // sort direction
    currentPage?: number;     // 1-based
}

function matchesText(item: any, q: string): boolean {
    if (!q) return true;
    const lower = q.toLowerCase();
    const fields = ['name', 'reference', 'familyName', 'givenName', 'shortName', 'classification'];
    return fields.some(f => typeof item[f] === 'string' && item[f].toLowerCase().includes(lower));
}

function matchesDate(item: any, minDate: string | undefined, maxDate: string | undefined, dateField: string): boolean {
    const raw = item[dateField];
    if (!raw) return !minDate && !maxDate; // if no date on item and no filter, include it
    const date = raw.substring(0, 10); // extract YYYY-MM-DD from ISO string
    if (minDate && date < minDate) return false;
    if (maxDate && date > maxDate) return false;
    return true;
}

function matchesFieldFilters(item: any, fieldFilters: Record<string, string>): boolean {
    return Object.entries(fieldFilters).every(([field, value]) => {
        if (!value) return true;
        const itemVal = item[field];
        if (itemVal == null) return false;
        return String(itemVal).toLowerCase().includes(value.toLowerCase());
    });
}

function sortItems<T>(items: T[], sortField: string, sortDesc: boolean): T[] {
    return [...items].sort((a: any, b: any) => {
        const va = a[sortField] ?? '';
        const vb = b[sortField] ?? '';
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return sortDesc ? -cmp : cmp;
    });
}

/**
 * Fetches a bounded snapshot and applies filters/sorting/pagination client-side.
 * This intentionally favors responsiveness over complete history coverage.
 */
export function useOparlFiltered<T extends { id: string }>(
    resource: string,
    filter: FilterConfig
) {
    const [allData, setAllData] = useState<T[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Detect the date field automatically based on common conventions
    const dateField = filter.dateField ?? (resource === 'meetings' ? 'start' : 'date');

    const fetchData = useCallback(async () => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;
        setIsLoading(true);
        setError(null);
        try {
            const items = await getListSnapshot<T>(resource, controller.signal);
            if (!controller.signal.aborted) {
                setAllData(items);
                setIsLoading(false);
            }
        } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return;
            if (!controller.signal.aborted) {
                console.error(`Failed to fetch ${resource}:`, e);
                setError(e as Error);
                setIsLoading(false);
            }
        }
    }, [resource]);

    useEffect(() => {
        fetchData();
        return () => { if (abortControllerRef.current) abortControllerRef.current.abort(); };
    }, [fetchData]);

    // Apply all client-side filters
    const filtered = useMemo(() => {
        let items = allData;

        if (filter.q?.trim()) {
            items = items.filter(item => matchesText(item, filter.q!.trim()));
        }
        if (filter.minDate || filter.maxDate) {
            items = items.filter(item => matchesDate(item, filter.minDate, filter.maxDate, dateField));
        }
        if (filter.fieldFilters && Object.keys(filter.fieldFilters).length > 0) {
            items = items.filter(item => matchesFieldFilters(item, filter.fieldFilters!));
        }

        if (filter.sortField) {
            items = sortItems(items, filter.sortField, filter.sortDesc ?? false);
        }

        return items;
    }, [allData, filter.q, filter.minDate, filter.maxDate, filter.fieldFilters, filter.sortField, filter.sortDesc, dateField]);

    // Apply client-side pagination
    const currentPage = Math.max(1, filter.currentPage ?? 1);
    const totalElements = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalElements / ITEMS_PER_PAGE));
    const safePage = Math.min(currentPage, totalPages);
    const pageData = useMemo(() => {
        const start = (safePage - 1) * ITEMS_PER_PAGE;
        return filtered.slice(start, start + ITEMS_PER_PAGE);
    }, [filtered, safePage]);

    const pagedResponse: PagedResponse<T> = {
        data: pageData,
        links: {},
        pagination: {
            currentPage: safePage,
            elementsPerPage: ITEMS_PER_PAGE,
            totalElements,
            totalPages,
        },
    };

    return {
        data: pagedResponse,
        isLoading,
        error,
        refetch: fetchData,
        totalUnfiltered: allData.length,
    };
}
