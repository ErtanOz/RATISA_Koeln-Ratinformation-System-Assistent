import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { usePaperResults } from '../../hooks/usePaperResults';
import {
  loadPaperSearchIndex,
  PaperSearchIndexDocument,
  queryPaperSearchIndex,
} from '../../services/paperDeepSearchService';
import {
  DocumentTextIcon,
  FavoriteButton,
  MagnifyingGlassIcon,
  Pagination,
  TableSkeleton,
} from '../../components/ui';
import { Paper } from '../../types';
import { encodeUrl, formatDateOnly } from '../../utils/routeFormatting';
import { validateDateRange } from '../../utils/dateFilters';
import { DateInputField } from './DateInputField';

const PAPER_DEEP_SEARCH_ITEMS_PER_PAGE = 20;

const PAPER_DEEP_PARAM_KEYS = ['deepQ', 'deepType', 'deepMinDate', 'deepMaxDate', 'deepPage'] as const;

const PAPER_TYPE_OPTIONS = [
  { value: 'Antrag', label: 'Antrag' },
  { value: 'Anfrage', label: 'Anfrage' },
  { value: 'Mitteilung', label: 'Mitteilung' },
  { value: 'Beschlussvorlage', label: 'Beschlussvorlage' },
  { value: 'Niederschrift', label: 'Niederschrift' },
];

type PaperDeepResultItem = Pick<
  Paper,
  'id' | 'name' | 'reference' | 'date' | 'paperType' | 'consultation'
>;

interface PaperDeepSearchProps {
  onActiveChange?: (isActive: boolean) => void;
}

export const PaperDeepSearch: React.FC<PaperDeepSearchProps> = ({ onActiveChange }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const urlQuery = searchParams.get('deepQ') || '';
  const urlPaperType = searchParams.get('deepType') || '';
  const urlMinDate = searchParams.get('deepMinDate') || '';
  const urlMaxDate = searchParams.get('deepMaxDate') || '';
  const hasUrlSearchInput = Boolean(urlQuery || urlPaperType || urlMinDate || urlMaxDate);
  const urlPage = Math.max(1, parseInt(searchParams.get('deepPage') || '1', 10) || 1);

  const [query, setQuery] = useState(urlQuery);
  const [paperType, setPaperType] = useState(urlPaperType);
  const [minDate, setMinDate] = useState(urlMinDate);
  const [maxDate, setMaxDate] = useState(urlMaxDate);
  const [currentPage, setCurrentPage] = useState(hasUrlSearchInput ? urlPage : 1);
  const [index, setIndex] = useState<PaperSearchIndexDocument | null>(null);
  const [isLoadingIndex, setIsLoadingIndex] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const wasActiveRef = useRef(hasUrlSearchInput);

  const deferredQuery = useDeferredValue(query);
  const deferredPaperType = useDeferredValue(paperType);
  const deferredMinDate = useDeferredValue(minDate);
  const deferredMaxDate = useDeferredValue(maxDate);
  const hasSearchInput = Boolean(
    query.trim() || paperType.trim() || minDate.trim() || maxDate.trim(),
  );
  const hasDeferredSearchInput = Boolean(
    deferredQuery.trim() ||
      deferredPaperType.trim() ||
      deferredMinDate.trim() ||
      deferredMaxDate.trim(),
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
      const nextIndex = await loadPaperSearchIndex();
      setIndex(nextIndex);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Vorlagenindex konnte nicht geladen werden.');
    } finally {
      setIsLoadingIndex(false);
    }
  }, [index, isLoadingIndex]);

  useEffect(() => {
    setQuery((previous) => (previous === urlQuery ? previous : urlQuery));
    setPaperType((previous) => (previous === urlPaperType ? previous : urlPaperType));
    setMinDate((previous) => (previous === urlMinDate ? previous : urlMinDate));
    setMaxDate((previous) => (previous === urlMaxDate ? previous : urlMaxDate));
    setCurrentPage((previous) => {
      const nextPage = hasUrlSearchInput ? urlPage : 1;
      return previous === nextPage ? previous : nextPage;
    });
  }, [hasUrlSearchInput, urlMaxDate, urlMinDate, urlPage, urlPaperType, urlQuery]);

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
      const normalizedPaperType = paperType.trim();
      const normalizedMinDate = minDate.trim();
      const normalizedMaxDate = maxDate.trim();

      if (normalizedQuery) nextParams.set('deepQ', normalizedQuery);
      else nextParams.delete('deepQ');

      if (normalizedPaperType) nextParams.set('deepType', normalizedPaperType);
      else nextParams.delete('deepType');

      if (normalizedMinDate) nextParams.set('deepMinDate', normalizedMinDate);
      else nextParams.delete('deepMinDate');

      if (normalizedMaxDate) nextParams.set('deepMaxDate', normalizedMaxDate);
      else nextParams.delete('deepMaxDate');

      if (currentPage > 1) nextParams.set('deepPage', String(currentPage));
      else nextParams.delete('deepPage');
    } else if (wasActiveRef.current) {
      PAPER_DEEP_PARAM_KEYS.forEach((param) => nextParams.delete(param));
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
  }, [currentPage, hasSearchInput, location.search, maxDate, minDate, navigate, paperType, query]);

  const resultPage = useMemo(() => {
    if (!index || !hasDeferredSearchInput || validationError) {
      return {
        items: [] as PaperDeepResultItem[],
        totalMatches: 0,
        currentPage: 1,
        totalPages: 1,
      };
    }

    let result = queryPaperSearchIndex(index, {
      query: deferredQuery,
      paperType: deferredPaperType,
      minDate: deferredMinDate,
      maxDate: deferredMaxDate,
      offset: (currentPage - 1) * PAPER_DEEP_SEARCH_ITEMS_PER_PAGE,
      limit: PAPER_DEEP_SEARCH_ITEMS_PER_PAGE,
    });

    const totalPages = Math.max(
      1,
      Math.ceil(result.totalMatches / PAPER_DEEP_SEARCH_ITEMS_PER_PAGE),
    );
    const safePage = Math.min(Math.max(1, currentPage), totalPages);

    if (safePage !== currentPage) {
      result = queryPaperSearchIndex(index, {
        query: deferredQuery,
        paperType: deferredPaperType,
        minDate: deferredMinDate,
        maxDate: deferredMaxDate,
        offset: (safePage - 1) * PAPER_DEEP_SEARCH_ITEMS_PER_PAGE,
        limit: PAPER_DEEP_SEARCH_ITEMS_PER_PAGE,
      });
    }

    const items = result.items.map<PaperDeepResultItem>((item) => ({
      id: item.id,
      name: item.name,
      reference: item.reference,
      date: item.dateKey,
      paperType: item.paperType,
      consultation: [],
    }));

    return {
      items,
      totalMatches: result.totalMatches,
      currentPage: safePage,
      totalPages,
    };
  }, [
    currentPage,
    deferredMaxDate,
    deferredMinDate,
    deferredPaperType,
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

  const paperResults = usePaperResults(resultPage.items);

  return (
    <section className="app-archive-search-panel mb-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-app-text">
            <DocumentTextIcon /> Vorlagen-Tiefensuche
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-app-muted">
            Laedt einen kompakten Vorlagenindex nur bei Bedarf und durchsucht historische
            Vorlagen separat von der normalen Listenansicht.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          {isLoadingIndex && <span className="app-badge-warning">Vorlagenindex wird geladen...</span>}
          {index && <span className="app-badge-warning">Index geladen</span>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)_minmax(0,0.7fr)_minmax(0,0.7fr)]">
        <div className="min-w-0">
          <label htmlFor="paper-deep-search-query" className="app-label app-label-compact">
            Suche
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute left-4 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-app-muted">
              <MagnifyingGlassIcon />
            </div>
            <input
              id="paper-deep-search-query"
              type="search"
              aria-label="Historische Vorlagen durchsuchen"
              value={query}
              onFocus={() => void ensureIndexLoaded()}
              onClick={() => void ensureIndexLoaded()}
              onChange={(event) => {
                setQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Alte Vorlagen, Referenzen oder Typen durchsuchen..."
              className="app-archive-search-input"
            />
          </div>
        </div>

        <div className="min-w-0">
          <label htmlFor="paper-deep-search-type" className="app-label app-label-compact">
            Typ
          </label>
          <select
            id="paper-deep-search-type"
            aria-label="Vorlagentyp"
            value={paperType}
            onFocus={() => void ensureIndexLoaded()}
            onClick={() => void ensureIndexLoaded()}
            onChange={(event) => {
              setPaperType(event.target.value);
              setCurrentPage(1);
            }}
            className="app-select h-14 rounded-[1rem] bg-app-surface"
          >
            <option value="">Alle Typen</option>
            {PAPER_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <DateInputField
          label="Von"
          ariaLabel="Vorlagen von"
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
          ariaLabel="Vorlagen bis"
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
        Nur <span className="font-semibold">Bis</span> ausfuellen, um Vorlagen vor einem Stichtag
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
          <span className="app-badge-muted">{index.metadata.itemCount} indexierte Vorlagen</span>
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
          Der Vorlagenindex wird erst bei Ihrer ersten Eingabe geladen. So bleibt die normale
          Vorlagenliste schnell.
        </p>
      )}

      {index && !hasDeferredSearchInput && !validationError && (
        <p className="mt-3 text-xs text-app-muted">
          Geben Sie einen Suchbegriff, einen Typ oder einen Zeitraum ein, um historische Vorlagen
          ueber den kompakten Index zu finden.
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
                setPaperType('');
                setMinDate('');
                setMaxDate('');
                setCurrentPage(1);
              }}
              className="text-xs font-medium text-app-warning transition-colors hover:text-app-accent"
            >
              Eingaben leeren
            </button>
          </div>

          <div className="app-surface hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-app-text">
                <thead className="bg-app-surface-alt text-xs font-bold uppercase tracking-[0.16em] text-app-muted">
                  <tr>
                    <th className="p-4 pl-6">Betreff</th>
                    <th className="p-4 whitespace-nowrap">Datum</th>
                    <th className="p-4 whitespace-nowrap">Typ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border">
                  {isLoadingIndex && !index && (
                    <TableSkeleton columnClasses={['', '', '']} rowCount={4} />
                  )}
                  {resultPage.items.map((item) => (
                    <tr
                      key={item.id}
                      className="group border-b border-app-border transition-colors hover:bg-app-surface-alt/70 last:border-0"
                    >
                      <td className="relative p-4 pl-6 pr-10 font-medium">
                        <Link
                          to={`/papers/${encodeUrl(item.id)}`}
                          className="mb-1 block font-semibold text-app-text transition-colors hover:text-app-accent"
                        >
                          {item.name}
                        </Link>
                        <span className="font-mono text-xs text-app-muted">{item.reference}</span>
                        {paperResults[item.id] && (
                          <div className="mt-1">
                            <span className="app-badge-success">Ergebnis: {paperResults[item.id]}</span>
                          </div>
                        )}
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                          <FavoriteButton
                            item={{
                              id: item.id,
                              type: 'paper',
                              name: item.name,
                              path: `/papers/${encodeUrl(item.id)}`,
                              info: item.reference,
                            }}
                          />
                        </div>
                      </td>
                      <td className="p-4 font-mono text-sm whitespace-nowrap text-app-muted">
                        {formatDateOnly(item.date)}
                      </td>
                      <td className="p-4 text-xs uppercase tracking-wide whitespace-nowrap text-app-muted">
                        <span className="app-badge-muted">{item.paperType || 'Sonstige'}</span>
                      </td>
                    </tr>
                  ))}
                  {!resultPage.items.length && (
                    <tr>
                      <td colSpan={3} className="p-12 text-center text-app-muted">
                        Keine Treffer im Vorlagenindex gefunden.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4 md:hidden">
            {resultPage.items.map((item) => (
              <div key={item.id} className="app-surface relative flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between">
                  <span className="app-badge-info">{item.paperType || 'Vorlage'}</span>
                  <FavoriteButton
                    item={{ id: item.id, type: 'paper', name: item.name, path: `/papers/${encodeUrl(item.id)}` }}
                  />
                </div>
                <Link
                  to={`/papers/${encodeUrl(item.id)}`}
                  className="mt-1 text-base font-semibold leading-tight text-app-text"
                >
                  {item.name}
                </Link>
                {paperResults[item.id] && (
                  <span className="app-badge-success">Ergebnis: {paperResults[item.id]}</span>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-xs text-app-muted">{item.reference}</span>
                  <span className="text-xs text-app-muted">{formatDateOnly(item.date)}</span>
                </div>
              </div>
            ))}
            {!resultPage.items.length && (
              <div className="py-2 text-sm text-app-muted">Keine Treffer im Vorlagenindex gefunden.</div>
            )}
          </div>

          <Pagination
            currentPage={resultPage.currentPage}
            totalPages={resultPage.totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}
    </section>
  );
};
