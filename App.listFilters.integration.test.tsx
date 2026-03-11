import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MeetingArchive, MeetingsPage, PapersPage } from './App';
import * as apiService from './services/oparlApiService';
import * as archiveService from './services/archiveDeepSearchService';

vi.mock('./services/oparlApiService', async () => {
  const actual = await vi.importActual<typeof import('./services/oparlApiService')>(
    './services/oparlApiService',
  );

  return {
    ...actual,
    getItem: vi.fn(),
    getList: vi.fn(),
    getListAll: vi.fn(),
    getListSnapshot: vi.fn(),
  };
});

vi.mock('./services/archiveDeepSearchService', async () => {
  const actual = await vi.importActual<typeof import('./services/archiveDeepSearchService')>(
    './services/archiveDeepSearchService',
  );

  return {
    ...actual,
    loadArchiveMeetingIndex: vi.fn(),
    clearArchiveMeetingIndexCache: vi.fn(),
  };
});

function renderRoute(initialEntry: string, path: string, element: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('List page filter regressions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(apiService.getListAll).mockRejectedValue(new Error('deep pagination failed'));
    vi.mocked(apiService.getItem).mockRejectedValue(new Error('unexpected detail fetch'));
    vi.mocked(apiService.getList).mockResolvedValue({
      data: [],
      links: {},
      pagination: {
        currentPage: 1,
        elementsPerPage: 0,
        totalElements: 0,
        totalPages: 1,
      },
    } as any);
    vi.mocked(archiveService.loadArchiveMeetingIndex).mockResolvedValue({
      metadata: {
        generatedAt: '2026-03-11T00:00:00.000Z',
        itemCount: 0,
        source: 'test',
        isPartial: false,
      },
      items: [],
    });
  });

  it('filters meetings by date range using the bounded snapshot path', async () => {
    vi.mocked(apiService.getListSnapshot).mockResolvedValue([
      { id: 'm-1', name: 'Finanzausschuss', start: '2026-03-12T16:00:00+01:00' },
      { id: 'm-2', name: 'Verkehrsausschuss', start: '2026-03-20T16:00:00+01:00' },
      { id: 'm-3', name: 'Kulturausschuss', start: '2026-04-05T16:00:00+02:00' },
    ] as any[]);

    renderRoute(
      '/meetings?minDate=2026-03-15&maxDate=2026-03-31',
      '/meetings',
      <MeetingsPage />,
    );

    await waitFor(() => expect(screen.getByText(/1 Ergebnisse/)).toBeInTheDocument());

    expect(screen.getAllByText('Verkehrsausschuss').length).toBeGreaterThan(0);
    expect(screen.queryByText('Finanzausschuss')).not.toBeInTheDocument();
    expect(screen.queryByText('Kulturausschuss')).not.toBeInTheDocument();
    expect(apiService.getListSnapshot).toHaveBeenCalledWith('meetings', expect.any(AbortSignal));
    expect(apiService.getListAll).not.toHaveBeenCalled();
  });

  it('keeps archive meetings on the bounded snapshot path without explicit filters', async () => {
    vi.mocked(apiService.getListSnapshot).mockResolvedValue([
      { id: 'a-1', name: 'Vergangene Sitzung', start: '2026-03-05T10:00:00+01:00' },
      { id: 'a-2', name: 'Zukuenftige Sitzung', start: '2035-01-10T10:00:00+01:00' },
    ] as any[]);

    renderRoute('/archive', '/archive', <MeetingArchive />);

    await waitFor(() => expect(screen.getByText(/1 Ergebnisse/)).toBeInTheDocument());

    expect(screen.getAllByText('Vergangene Sitzung').length).toBeGreaterThan(0);
    expect(screen.queryByText('Zukuenftige Sitzung')).not.toBeInTheDocument();
    expect(apiService.getListSnapshot).toHaveBeenCalledWith('meetings', expect.any(AbortSignal));
    expect(archiveService.loadArchiveMeetingIndex).not.toHaveBeenCalled();
    expect(apiService.getListAll).not.toHaveBeenCalled();
  });

  it('filters archive meetings by old date range using the full archive index path', async () => {
    vi.mocked(apiService.getListSnapshot).mockResolvedValue([
      { id: 'recent-1', name: 'Neuere Sitzung', start: '2026-03-05T10:00:00+01:00' },
    ] as any[]);
    vi.mocked(archiveService.loadArchiveMeetingIndex).mockResolvedValue({
      metadata: {
        generatedAt: '2026-03-11T00:00:00.000Z',
        itemCount: 3,
        source: 'test',
        isPartial: false,
      },
      items: [
        {
          id: 'archive-1',
          name: 'Archiv Januar 2024',
          start: '2024-01-12T10:00:00+01:00',
          dateKey: '2024-01-12',
          location: 'Historisches Rathaus',
          searchText: 'archiv januar 2024 historisches rathaus',
        },
        {
          id: 'archive-2',
          name: 'Archiv Februar 2024',
          start: '2024-02-12T10:00:00+01:00',
          dateKey: '2024-02-12',
          location: 'Historisches Rathaus',
          searchText: 'archiv februar 2024 historisches rathaus',
        },
        {
          id: 'archive-3',
          name: 'Archiv Januar 2025',
          start: '2025-01-12T10:00:00+01:00',
          dateKey: '2025-01-12',
          location: 'Historisches Rathaus',
          searchText: 'archiv januar 2025 historisches rathaus',
        },
      ],
    });

    renderRoute(
      '/archive?minDate=2024-01-01&maxDate=2024-01-31',
      '/archive',
      <MeetingArchive />,
    );

    await waitFor(() => expect(screen.getByText(/1 Ergebnisse/)).toBeInTheDocument());

    expect(screen.getAllByText('Archiv Januar 2024').length).toBeGreaterThan(0);
    expect(screen.queryByText('Archiv Februar 2024')).not.toBeInTheDocument();
    expect(apiService.getListSnapshot).not.toHaveBeenCalled();
    expect(archiveService.loadArchiveMeetingIndex).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('routes archive text search through the archive index searchText field', async () => {
    vi.mocked(archiveService.loadArchiveMeetingIndex).mockResolvedValue({
      metadata: {
        generatedAt: '2026-03-11T00:00:00.000Z',
        itemCount: 2,
        source: 'test',
        isPartial: false,
      },
      items: [
        {
          id: 'archive-1',
          name: 'Aelteste Sitzung',
          start: '2024-01-12T10:00:00+01:00',
          dateKey: '2024-01-12',
          location: 'Historisches Rathaus',
          searchText: 'aelteste sitzung historisches rathaus',
        },
        {
          id: 'archive-2',
          name: 'Andere Sitzung',
          start: '2024-02-12T10:00:00+01:00',
          dateKey: '2024-02-12',
          location: 'Spanischer Bau',
          searchText: 'andere sitzung spanischer bau',
        },
      ],
    });

    renderRoute('/archive?q=rathaus', '/archive', <MeetingArchive />);

    await waitFor(() => expect(screen.getByText(/1 Ergebnisse/)).toBeInTheDocument());

    expect(screen.getAllByText('Aelteste Sitzung').length).toBeGreaterThan(0);
    expect(screen.queryByText('Andere Sitzung')).not.toBeInTheDocument();
    expect(apiService.getListSnapshot).not.toHaveBeenCalled();
    expect(archiveService.loadArchiveMeetingIndex).toHaveBeenCalled();
  });

  it('filters papers by paper type using the bounded snapshot path', async () => {
    vi.mocked(apiService.getListSnapshot).mockResolvedValue([
      {
        id: 'p-1',
        name: 'Mitteilung Radverkehr',
        reference: '2026/001',
        date: '2026-03-11',
        paperType: 'Mitteilung',
        consultation: [],
      },
      {
        id: 'p-2',
        name: 'Antrag Mobilitaet',
        reference: '2026/002',
        date: '2026-03-10',
        paperType: 'Antrag',
        consultation: [],
      },
      {
        id: 'p-3',
        name: 'Beschlussvorlage Schule',
        reference: '2026/003',
        date: '2026-03-09',
        paperType: 'Beschlussvorlage',
        consultation: [],
      },
    ] as any[]);

    renderRoute('/papers?paperType=Antrag', '/papers', <PapersPage />);

    await waitFor(() => expect(screen.getByText(/1 Ergebnisse/)).toBeInTheDocument());

    expect(screen.getAllByText('Antrag Mobilitaet').length).toBeGreaterThan(0);
    expect(screen.queryByText('Mitteilung Radverkehr')).not.toBeInTheDocument();
    expect(screen.queryByText('Beschlussvorlage Schule')).not.toBeInTheDocument();
    expect(apiService.getListAll).not.toHaveBeenCalled();
  });

  it('keeps list pages functional even if deep pagination would fail', async () => {
    vi.mocked(apiService.getListSnapshot).mockResolvedValue([
      { id: 'm-1', name: 'Stabile Sitzung', start: '2026-03-18T16:00:00+01:00' },
    ] as any[]);

    renderRoute('/meetings', '/meetings', <MeetingsPage />);

    await waitFor(() => expect(screen.getByText(/1 Ergebnisse/)).toBeInTheDocument());

    expect(screen.getAllByText('Stabile Sitzung').length).toBeGreaterThan(0);
    expect(apiService.getListAll).not.toHaveBeenCalled();
  });
});
