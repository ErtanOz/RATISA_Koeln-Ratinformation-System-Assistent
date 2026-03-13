import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArchiveMeetingIndexDocument,
  ArchiveMeetingIndexItem,
  loadArchiveMeetingIndex,
  queryArchiveMeetingIndex,
} from '../../services/archiveDeepSearchService';
import { ArchiveBoxIcon, MagnifyingGlassIcon, Pagination } from '../../components/ui';
import { formatDateOnly, formatDateTime, encodeUrl } from '../../utils/routeFormatting';
import { validateDateRange } from '../../utils/dateFilters';
import { DateInputField } from './DateInputField';

const ARCHIVE_DEEP_SEARCH_ITEMS_PER_PAGE = 20;

interface ArchiveDeepSearchProps {
  onActiveChange?: (isActive: boolean) => void;
}

export const ArchiveDeepSearch: React.FC<ArchiveDeepSearchProps> = ({ onActiveChange }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const urlQuery = searchParams.get('q') || '';
  const urlMinDate = searchParams.get('minDate') || '';
  const urlMaxDate = searchParams.get('maxDate') || '';
  const hasUrlSearchInput = Boolean(urlQuery || urlMinDate || urlMaxDate);
  const urlPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  const [query, setQuery] = useState(urlQuery);
  const [minDate, setMinDate] = useState(urlMinDate);
  const [maxDate, setMaxDate] = useState(urlMaxDate);
  const [currentPage, setCurrentPage] = useState(hasUrlSearchInput ? urlPage : 1);
  const [index, setIndex] = useState<ArchiveMeetingIndexDocument | null>(null);
  const [isLoadingIndex, setIsLoadingIndex] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const wasActiveRef = useRef(hasUrlSearchInput);

  const deferredQuery = useDeferredValue(query);
  const deferredMinDate = useDeferredValue(minDate);
  const deferredMaxDate = useDeferredValue(maxDate);
  const hasSearchInput = Boolean(query.trim() || minDate.trim() || maxDate.trim());
  const hasDeferredSearchInput = Boolean(
    deferredQuery.trim() || deferredMinDate.trim() || deferredMaxDate.trim(),
  );
  const validationError = useMemo(
    () => validateDateRange(minDate || undefined, maxDate || undefined),
    [maxDate, minDate],
  );

  const ensureIndexLoaded = useCallback(async () => {
    if (index || isLoadingIndex) return;

    setIsLoadingIndex(true);
    setLoadError(null);

    try {
      const nextIndex = await loadArchiveMeetingIndex();
      setIndex(nextIndex);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Archivindex konnte nicht geladen werden.');
    } finally {
      setIsLoadingIndex(false);
    }
  }, [index, isLoadingIndex]);

  useEffect(() => {
    setQuery((previous) => (previous === urlQuery ? previous : urlQuery));
    setMinDate((previous) => (previous === urlMinDate ? previous : urlMinDate));
    setMaxDate((previous) => (previous === urlMaxDate ? previous : urlMaxDate));
    setCurrentPage((previous) => {
      const nextPage = hasUrlSearchInput ? urlPage : 1;
      return previous === nextPage ? previous : nextPage;
    });
  }, [hasUrlSearchInput, urlMaxDate, urlMinDate, urlPage, urlQuery]);

  useEffect(() => {
    onActiveChange?.(hasSearchInput);
  }, [hasSearchInput, onActiveChange]);

  useEffect(() => {
    if (hasSearchInput) void ensureIndexLoaded();
  }, [ensureIndexLoaded, hasSearchInput]);

  useEffect(() => {
    const nextParams = new URLSearchParams(location.search);

    if (hasSearchInput) {
      const normalizedQuery = query.trim();
      const normalizedMinDate = minDate.trim();
      const normalizedMaxDate = maxDate.trim();

      if (normalizedQuery) nextParams.set('q', normalizedQuery);
      else nextParams.delete('q');

      if (normalizedMinDate) nextParams.set('minDate', normalizedMinDate);
      else nextParams.delete('minDate');

      if (normalizedMaxDate) nextParams.set('maxDate', normalizedMaxDate);
      else nextParams.delete('maxDate');

      if (currentPage > 1) nextParams.set('page', String(currentPage));
      else nextParams.delete('page');
    } else if (wasActiveRef.current) {
      nextParams.delete('q');
      nextParams.delete('minDate');
      nextParams.delete('maxDate');
      nextParams.delete('page');
    } else {
      wasActiveRef.current = false;
      return;
    }

    const currentSearch = location.search.startsWith('?') ? location.search.slice(1) : location.search;
    const nextSearch = nextParams.toString();

    wasActiveRef.current = hasSearchInput;

    if (nextSearch !== currentSearch) {
      navigate({ search: nextSearch }, { replace: true });
    }
  }, [currentPage, hasSearchInput, location.search, maxDate, minDate, navigate, query]);

  const resultPage = useMemo(() => {
    if (!index || !hasDeferredSearchInput || validationError) {
      return {
        items: [] as ArchiveMeetingIndexItem[],
        totalMatches: 0,
        currentPage: 1,
        totalPages: 1,
      };
    }

    let result = queryArchiveMeetingIndex(index, {
      query: deferredQuery,
      minDate: deferredMinDate,
      maxDate: deferredMaxDate,
      offset: (currentPage - 1) * ARCHIVE_DEEP_SEARCH_ITEMS_PER_PAGE,
      limit: ARCHIVE_DEEP_SEARCH_ITEMS_PER_PAGE,
    });

    const totalPages = Math.max(1, Math.ceil(result.totalMatches / ARCHIVE_DEEP_SEARCH_ITEMS_PER_PAGE));
    const safePage = Math.min(Math.max(1, currentPage), totalPages);

    if (safePage !== currentPage) {
      result = queryArchiveMeetingIndex(index, {
        query: deferredQuery,
        minDate: deferredMinDate,
        maxDate: deferredMaxDate,
        offset: (safePage - 1) * ARCHIVE_DEEP_SEARCH_ITEMS_PER_PAGE,
        limit: ARCHIVE_DEEP_SEARCH_ITEMS_PER_PAGE,
      });
    }

    return {
      ...result,
      currentPage: safePage,
      totalPages,
    };
  }, [
    currentPage,
    deferredMaxDate,
    deferredMinDate,
    deferredQuery,
    hasDeferredSearchInput,
    index,
    validationError,
  ]);

  useEffect(() => {
    if (hasDeferredSearchInput && resultPage.currentPage !== currentPage) {
      setCurrentPage(resultPage.currentPage);
    }
  }, [currentPage, hasDeferredSearchInput, resultPage.currentPage]);

  return (
    <section className="app-archive-search-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-app-text">
            <ArchiveBoxIcon /> Archiv-Tiefensuche
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-app-muted">
            Laedt einen kompakten Archivindex nur bei Bedarf und durchsucht alte Sitzungen separat
            vom normalen Listenfilter.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          {isLoadingIndex && <span className="app-badge-warning">Archivindex wird geladen...</span>}
          {index && <span className="app-badge-warning">Index geladen</span>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.7fr)]">
        <div className="min-w-0">
          <label htmlFor="archive-deep-search-query" className="app-label app-label-compact">
            Suche
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-4 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-app-muted">
              <MagnifyingGlassIcon />
            </div>
            <input
              id="archive-deep-search-query"
              type="search"
              aria-label="Archiv durchsuchen"
              value={query}
              onFocus={() => void ensureIndexLoaded()}
              onClick={() => void ensureIndexLoaded()}
              onChange={(event) => {
                setQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Alte Sitzungen, Themen oder Orte durchsuchen..."
              className="app-archive-search-input"
            />
          </div>
        </div>
        <DateInputField
          label="Von"
          ariaLabel="Von"
          value={minDate}
          onFocus={() => void ensureIndexLoaded()}
          onChange={(nextValue) => {
            setMinDate(nextValue);
            setCurrentPage(1);
          }}
          variant="compact"
        />
        <DateInputField
          label="Bis"
          ariaLabel="Bis"
          value={maxDate}
          onFocus={() => void ensureIndexLoaded()}
          onChange={(nextValue) => {
            setMaxDate(nextValue);
            setCurrentPage(1);
          }}
          variant="compact"
        />
      </div>

      <p className="mt-3 text-[11px] text-app-warning">
        Nur <span className="font-semibold">Bis</span> ausfuellen, um Sitzungen vor einem Stichtag
        zu finden.
      </p>

      {validationError && (
        <p className="mt-3 rounded-md border border-app-danger/25 bg-app-danger/10 px-3 py-2 text-xs text-app-danger">
          {validationError}
        </p>
      )}

      {loadError && (
        <p className="mt-3 rounded-md border border-app-danger/25 bg-app-danger/10 px-3 py-2 text-xs text-app-danger">
          {loadError}
        </p>
      )}

      {index && (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-app-muted">
          <span className="app-badge-muted">{index.metadata.itemCount} archivierte Sitzungen</span>
          <span className="app-badge-muted">Stand {formatDateOnly(index.metadata.generatedAt)}</span>
          {index.metadata.isPartial && (
            <span className="app-badge-warning">
              Teilindex: {index.metadata.stopReason || 'Quelle war nicht vollstaendig erreichbar'}
            </span>
          )}
        </div>
      )}

      {!index && !isLoadingIndex && !loadError && (
        <p className="mt-3 text-xs text-app-muted">
          Der Archivindex wird erst bei Ihrer ersten Eingabe geladen. So bleibt die normale
          Archivliste schnell.
        </p>
      )}

      {index && !hasDeferredSearchInput && !validationError && (
        <p className="mt-3 text-xs text-app-muted">
          Geben Sie einen Suchbegriff oder einen Zeitraum ein, um alte Archivsitzungen ueber den
          kompakten Index zu finden.
        </p>
      )}

      {index && hasDeferredSearchInput && !validationError && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-app-muted">
              {resultPage.totalMatches > resultPage.items.length
                ? `${resultPage.items.length} von ${resultPage.totalMatches} Treffern`
                : `${resultPage.totalMatches} Treffer`}
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setMinDate('');
                setMaxDate('');
                setCurrentPage(1);
              }}
              className="text-xs font-medium text-app-warning transition-colors hover:text-app-accent"
            >
              Eingaben leeren
            </button>
          </div>

          {resultPage.items.length > 0 ? (
            <>
              {resultPage.items.map((item) => (
                <Link
                  key={item.id}
                  to={`/meetings/${encodeUrl(item.id)}`}
                  className="block rounded-[1.15rem] border border-app-border/80 bg-app-surface px-4 py-4 transition-colors hover:bg-app-surface-alt/70"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-app-text">{item.name}</p>
                      <p className="mt-1 text-xs text-app-muted">{item.location || 'Ort unbekannt'}</p>
                    </div>
                    <div className="whitespace-nowrap text-xs font-mono text-app-warning">
                      {formatDateTime(item.start)}
                    </div>
                  </div>
                </Link>
              ))}
              <Pagination
                currentPage={resultPage.currentPage}
                totalPages={resultPage.totalPages}
                onPageChange={setCurrentPage}
              />
            </>
          ) : (
            <p className="py-2 text-sm text-app-muted">Keine Treffer im Archivindex gefunden.</p>
          )}
        </div>
      )}
    </section>
  );
};
