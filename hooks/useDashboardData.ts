import { useCallback, useEffect, useRef, useState } from 'react';
import { Meeting } from '../types';
import {
  DASHBOARD_RECENT_PAPER_WINDOW_DAYS,
  fetchRecentPaperCount,
  fetchUpcomingDashboardMeetings,
} from '../services/dashboardService';

export function useDashboardData() {
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [recentPaperCount, setRecentPaperCount] = useState(0);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [papersLoading, setPapersLoading] = useState(true);
  const [meetingsError, setMeetingsError] = useState<Error | null>(null);
  const [papersError, setPapersError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const now = new Date();
    setMeetingsLoading(true);
    setPapersLoading(true);
    setMeetingsError(null);
    setPapersError(null);

    const loadMeetings = async () => {
      try {
        const meetings = await fetchUpcomingDashboardMeetings(controller.signal, now);
        if (!controller.signal.aborted) {
          setUpcomingMeetings(meetings);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setMeetingsError(error as Error);
          setUpcomingMeetings([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setMeetingsLoading(false);
        }
      }
    };

    const loadPapers = async () => {
      try {
        const count = await fetchRecentPaperCount(
          controller.signal,
          now,
          DASHBOARD_RECENT_PAPER_WINDOW_DAYS,
        );
        if (!controller.signal.aborted) {
          setRecentPaperCount(count);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          setPapersError(error as Error);
          setRecentPaperCount(0);
        }
      } finally {
        if (!controller.signal.aborted) {
          setPapersLoading(false);
        }
      }
    };

    await Promise.allSettled([loadMeetings(), loadPapers()]);
  }, []);

  useEffect(() => {
    fetchData();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchData]);

  return {
    upcomingMeetings,
    recentPaperCount,
    recentPaperWindowDays: DASHBOARD_RECENT_PAPER_WINDOW_DAYS,
    meetingsLoading,
    papersLoading,
    meetingsError,
    papersError,
    refetch: fetchData,
  };
}
