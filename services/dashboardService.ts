import { Meeting, Paper } from '../types';
import { getList } from './oparlApiService';

export const DASHBOARD_UPCOMING_MEETING_LIMIT = 5;
export const DASHBOARD_MEETING_PAGE_LIMIT = 200;
export const DASHBOARD_MEETING_MAX_PAGES = 3;
export const DASHBOARD_PAPER_PAGE_LIMIT = 100;
export const DASHBOARD_PAPER_BATCH_SIZE = 3;
export const DASHBOARD_PAPER_MAX_PAGES = 6;
export const DASHBOARD_RECENT_PAPER_WINDOW_DAYS = 14;

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function subtractDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function extractDateKey(value?: string): string | undefined {
  if (typeof value !== 'string' || value.length < 10) return undefined;
  return value.slice(0, 10);
}

function buildParams(page: number, limit: number): URLSearchParams {
  return new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const uniqueItems = new Map<string, T>();
  items.forEach((item) => {
    if (!uniqueItems.has(item.id)) uniqueItems.set(item.id, item);
  });
  return Array.from(uniqueItems.values());
}

function compareMeetingsAsc(a: Meeting, b: Meeting): number {
  const timeA = new Date(a.start).getTime();
  const timeB = new Date(b.start).getTime();

  if (!Number.isFinite(timeA) && !Number.isFinite(timeB)) return 0;
  if (!Number.isFinite(timeA)) return 1;
  if (!Number.isFinite(timeB)) return -1;

  const diff = timeA - timeB;
  if (diff !== 0) return diff;
  return (a.name || '').localeCompare(b.name || '');
}

export async function fetchUpcomingDashboardMeetings(
  signal?: AbortSignal,
  now = new Date(),
): Promise<Meeting[]> {
  const todayKey = toLocalDateKey(now);
  const pages = Array.from({ length: DASHBOARD_MEETING_MAX_PAGES }, (_, index) => index + 1);

  const results = await Promise.all(
    pages.map((page) => getList<Meeting>('meetings', buildParams(page, DASHBOARD_MEETING_PAGE_LIMIT), signal)),
  );

  return dedupeById(results.flatMap((result) => result.data))
    .filter((meeting) => {
      const dateKey = extractDateKey(meeting.start);
      return Boolean(dateKey && dateKey >= todayKey);
    })
    .sort(compareMeetingsAsc)
    .slice(0, DASHBOARD_UPCOMING_MEETING_LIMIT);
}

export async function fetchRecentPaperCount(
  signal?: AbortSignal,
  now = new Date(),
  days = DASHBOARD_RECENT_PAPER_WINDOW_DAYS,
): Promise<number> {
  const cutoffKey = toLocalDateKey(subtractDays(now, days));
  const papers = new Map<string, Paper>();

  for (
    let pageStart = 1;
    pageStart <= DASHBOARD_PAPER_MAX_PAGES;
    pageStart += DASHBOARD_PAPER_BATCH_SIZE
  ) {
    const pageNumbers = Array.from(
      { length: Math.min(DASHBOARD_PAPER_BATCH_SIZE, DASHBOARD_PAPER_MAX_PAGES - pageStart + 1) },
      (_, index) => pageStart + index,
    );

    const batch = await Promise.all(
      pageNumbers.map((page) => getList<Paper>('papers', buildParams(page, DASHBOARD_PAPER_PAGE_LIMIT), signal)),
    );

    batch.forEach((page) => {
      page.data.forEach((paper) => {
        papers.set(paper.id, paper);
      });
    });

    const batchDates = batch
      .flatMap((page) => page.data.map((paper) => extractDateKey(paper.date)))
      .filter((value): value is string => Boolean(value));
    const oldestBatchDate = batchDates.length > 0 ? [...batchDates].sort()[0] : undefined;
    const hasMorePages = Boolean(batch[batch.length - 1]?.links.next);

    if (!hasMorePages || (oldestBatchDate && oldestBatchDate < cutoffKey)) {
      break;
    }
  }

  let count = 0;
  papers.forEach((paper) => {
    const dateKey = extractDateKey(paper.date);
    if (dateKey && dateKey >= cutoffKey) {
      count += 1;
    }
  });
  return count;
}
