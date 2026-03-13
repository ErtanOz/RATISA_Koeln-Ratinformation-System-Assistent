import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArchiveDeepSearch } from './shared/ArchiveDeepSearch';
import { getListSnapshot } from '../services/oparlApiService';
import { Meeting, PagedResponse } from '../types';
import {
  ErrorMessage,
  FavoriteButton,
  Pagination,
  PageTitle,
  TableSkeleton,
} from '../components/ui';
import { formatDateOnly, formatDateTime, encodeUrl } from '../utils/routeFormatting';

type MeetingListItem = Pick<Meeting, 'id' | 'name' | 'start' | 'end' | 'location'>;

const ARCHIVE_LIST_ITEMS_PER_PAGE = 25;

const getMeetingTimestamp = (dateStr?: string) => {
  if (!dateStr) return -1;
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? -1 : date.getTime();
};

const sortMeetingsDesc = (a: MeetingListItem, b: MeetingListItem) => {
  const timeA = getMeetingTimestamp(a.start);
  const timeB = getMeetingTimestamp(b.start);

  if (timeA === -1 && timeB === -1) return 0;
  if (timeA === -1) return 1;
  if (timeB === -1) return -1;

  const diff = timeB - timeA;
  if (diff !== 0) return diff;
  return (a.name || '').localeCompare(b.name || '');
};

const matchesMeetingDate = (meeting: MeetingListItem, minDate?: string, maxDate?: string) => {
  const date = meeting.start?.slice(0, 10);
  if (!date) return !minDate && !maxDate;
  if (minDate && date < minDate) return false;
  if (maxDate && date > maxDate) return false;
  return true;
};

const toPagedResponse = <T,>(
  pageItems: T[],
  currentPage: number,
  elementsPerPage: number,
  totalElements: number,
): PagedResponse<T> => {
  const totalPages = Math.max(1, Math.ceil(totalElements / elementsPerPage));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  return {
    data: pageItems,
    links: {},
    pagination: {
      currentPage: safePage,
      elementsPerPage,
      totalElements,
      totalPages,
    },
  };
};

const paginateItems = <T,>(items: T[], currentPage: number, elementsPerPage: number) => {
  const totalElements = items.length;
  const totalPages = Math.max(1, Math.ceil(totalElements / elementsPerPage));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const offset = (safePage - 1) * elementsPerPage;

  return toPagedResponse(
    items.slice(offset, offset + elementsPerPage),
    safePage,
    elementsPerPage,
    totalElements,
  );
};

const useArchiveMeetingsData = ({
  fallbackMaxDate,
  currentPage,
  enabled,
}: {
  fallbackMaxDate: string;
  currentPage: number;
  enabled: boolean;
}) => {
  const [snapshotItems, setSnapshotItems] = useState<MeetingListItem[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();

    const fetchArchiveData = async () => {
      setIsLoading(true);
      setError(null);

      setSnapshotItems([]);

      try {
        const nextSnapshot = await getListSnapshot<Meeting>('meetings', controller.signal);
        if (controller.signal.aborted) return;

        setSnapshotItems(
          nextSnapshot.map((item) => ({
            id: item.id,
            name: item.name,
            start: item.start,
            end: item.end,
            location: item.location,
          })),
        );
        setIsLoading(false);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setError(error as Error);
          setIsLoading(false);
        }
      }
    };

    void fetchArchiveData();
    return () => controller.abort();
  }, [enabled, reloadToken]);

  const data = useMemo(() => {
    if (!enabled) return null;

    if (isLoading && snapshotItems.length === 0) return null;

    return paginateItems(
      snapshotItems.filter((item) => matchesMeetingDate(item, undefined, fallbackMaxDate)).sort(sortMeetingsDesc),
      currentPage,
      ARCHIVE_LIST_ITEMS_PER_PAGE,
    );
  }, [
    currentPage,
    enabled,
    fallbackMaxDate,
    isLoading,
    snapshotItems,
  ]);

  return {
    data,
    isLoading,
    error,
    refetch,
  };
};

export const MeetingArchive: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const today = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);
  const urlParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const hasDeepSearchParams = Boolean(
    urlParams.get('q') || urlParams.get('minDate') || urlParams.get('maxDate'),
  );
  const currentPage = Math.max(1, parseInt(urlParams.get('page') || '1', 10) || 1);
  const [isDeepSearchActive, setIsDeepSearchActive] = useState(hasDeepSearchParams);

  useEffect(() => {
    setIsDeepSearchActive(hasDeepSearchParams);
  }, [hasDeepSearchParams]);

  const { data, isLoading, error, refetch } = useArchiveMeetingsData({
    fallbackMaxDate: today,
    currentPage,
    enabled: !isDeepSearchActive,
  });

  const displayData = data?.data || [];

  const handlePageChange = (page: number) => {
    const nextParams = new URLSearchParams(location.search);
    if (page > 1) nextParams.set('page', String(page));
    else nextParams.delete('page');
    navigate({ search: nextParams.toString() });
  };

  return (
    <div className="animate-in fade-in duration-300">
      <PageTitle title="Archiv" subtitle="Vergangene Sitzungen" />
      <ArchiveDeepSearch onActiveChange={setIsDeepSearchActive} />

      {!isDeepSearchActive && error && <ErrorMessage message={error.message} onRetry={refetch} />}

      {!isDeepSearchActive && !isLoading && data && (
        <p className="mb-3 text-xs text-app-muted">{data.pagination.totalElements} Ergebnisse</p>
      )}

      {!isDeepSearchActive && (
        <div className="app-surface hidden overflow-hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-app-text">
              <thead className="bg-app-surface-alt text-xs font-bold uppercase tracking-[0.16em] text-app-muted">
                <tr>
                  <th className="p-4 pl-6">Name</th>
                  <th className="p-4 hidden md:table-cell whitespace-nowrap">Datum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {isLoading && !data && <TableSkeleton columnClasses={['', 'hidden md:table-cell']} />}
                {displayData.map((item) => (
                  <tr key={item.id} className="group border-b border-app-border transition-colors hover:bg-app-surface-alt/70 last:border-0">
                    <td className="p-4 pl-6 font-medium relative pr-10">
                      <Link
                        to={`/meetings/${encodeUrl(item.id)}`}
                        className="block font-semibold text-app-text transition-colors hover:text-app-accent"
                      >
                        {item.name}
                      </Link>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <FavoriteButton
                          item={{
                            id: item.id,
                            type: 'meeting',
                            name: item.name,
                            path: `/meetings/${encodeUrl(item.id)}`,
                            info: formatDateTime(item.start),
                          }}
                        />
                      </div>
                    </td>
                    <td className="hidden p-4 font-mono text-sm text-app-muted md:table-cell whitespace-nowrap">
                      {formatDateTime(item.start)}
                    </td>
                  </tr>
                ))}
                {!isLoading && data && data.data.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-12 text-center text-app-muted">
                      Keine Ergebnisse gefunden.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isDeepSearchActive && (
        <div className="md:hidden space-y-4">
          {isLoading && !data && [1, 2, 3].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-xl bg-app-surface-alt" />
          ))}
          {displayData.map((item) => (
            <div
              key={item.id}
              className="app-surface relative flex flex-col gap-2 p-4 transition-colors hover:bg-app-surface-alt"
            >
              <div className="flex justify-between items-start">
                <span className="app-badge-accent">
                  {formatDateOnly(item.start)}
                </span>
                <FavoriteButton item={{ id: item.id, type: 'meeting', name: item.name, path: `/meetings/${encodeUrl(item.id)}` }} />
              </div>
              <Link
                to={`/meetings/${encodeUrl(item.id)}`}
                className="mt-1 text-lg font-semibold leading-tight text-app-text"
              >
                {item.name}
              </Link>
            </div>
          ))}
          {!isLoading && data && data.data.length === 0 && (
            <div className="py-10 text-center text-app-muted">Keine Ergebnisse gefunden.</div>
          )}
        </div>
      )}

      {!isDeepSearchActive && data && (
        <Pagination
          currentPage={data.pagination.currentPage}
          totalPages={data.pagination.totalPages}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
};

export default MeetingArchive;
