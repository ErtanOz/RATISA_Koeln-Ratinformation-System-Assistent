import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PartyActivityChart } from './App';
import * as dashboardService from './services/dashboardService';

vi.mock('./services/dashboardService', async () => {
  const actual = await vi.importActual<typeof import('./services/dashboardService')>(
    './services/dashboardService',
  );

  return {
    ...actual,
    fetchPartyActivityStatsForYear: vi.fn(),
  };
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return { promise, resolve, reject };
}

describe('PartyActivityChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the loading spinner visible until exact party activity data is ready', async () => {
    const deferred = createDeferred<Awaited<ReturnType<typeof dashboardService.fetchPartyActivityStatsForYear>>>();
    vi.mocked(dashboardService.fetchPartyActivityStatsForYear).mockReturnValue(deferred.promise);

    render(<PartyActivityChart year="2026" />);

    expect(screen.getByRole('status', { name: /wird geladen/i })).toBeInTheDocument();

    deferred.resolve({
      stats: [{ name: 'Alpha', count: 4, percentage: 100 }],
      motionCount: 4,
      mentionCount: 4,
    });

    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.getByText('Top 8')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /wird geladen/i })).not.toBeInTheDocument();
  });

  it('keeps the empty state text when the selected year has no motions', async () => {
    vi.mocked(dashboardService.fetchPartyActivityStatsForYear).mockResolvedValue({
      stats: [],
      motionCount: 0,
      mentionCount: 0,
    });

    render(<PartyActivityChart year="2026" />);

    await waitFor(() =>
      expect(screen.getByText('Keine Anträge für 2026.')).toBeInTheDocument(),
    );
  });
});
