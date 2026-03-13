import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PapersPage } from './App';
import * as apiService from './services/oparlApiService';
import * as paperSearchService from './services/paperDeepSearchService';

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

vi.mock('./services/paperDeepSearchService', async () => {
  const actual = await vi.importActual<typeof import('./services/paperDeepSearchService')>(
    './services/paperDeepSearchService',
  );

  return {
    ...actual,
    loadPaperSearchIndex: vi.fn(),
    clearPaperSearchIndexCache: vi.fn(),
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

describe('PapersPage deep mode', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
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
    vi.mocked(apiService.getListSnapshot).mockResolvedValue([
      {
        id: 'paper-current',
        name: 'Aktuelle Vorlage',
        reference: '2026/001',
        date: '2026-03-10',
        paperType: 'Mitteilung',
        consultation: [],
      },
    ] as any[]);
    vi.mocked(paperSearchService.loadPaperSearchIndex).mockResolvedValue({
      metadata: {
        generatedAt: '2026-03-13T00:00:00.000Z',
        itemCount: 1,
        source: 'test',
        isPartial: false,
      },
      items: [
        {
          id: 'paper-archive',
          name: 'Historische Vorlage Altbau',
          reference: '2019/045',
          paperType: 'Antrag',
          dateKey: '2019-02-10',
          searchText: 'historische vorlage altbau 2019/045 antrag',
        },
      ],
    });
  });

  it('keeps the normal papers list on snapshot mode when deep search is inactive', async () => {
    renderRoute('/papers', '/papers', <PapersPage />);

    await waitFor(() => expect(screen.getByText(/1 Ergebnisse/)).toBeInTheDocument());

    expect(screen.getAllByText('Aktuelle Vorlage').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText('Vorlage suchen...')).toBeInTheDocument();
    expect(screen.queryByText('Zeitraum filtern')).not.toBeInTheDocument();
    expect(paperSearchService.loadPaperSearchIndex).not.toHaveBeenCalled();
  });

  it('shows historical papers in deep mode, hides the normal list, and restores it after clearing', async () => {
    renderRoute('/papers?deepQ=historische', '/papers', <PapersPage />);

    await waitFor(() =>
      expect(paperSearchService.loadPaperSearchIndex).toHaveBeenCalled(),
    );
    await waitFor(() =>
      expect(screen.getAllByText('Historische Vorlage Altbau').length).toBeGreaterThan(0),
    );

    expect(screen.queryByPlaceholderText('Vorlage suchen...')).not.toBeInTheDocument();
    expect(screen.queryByText('Zeitraum filtern')).not.toBeInTheDocument();
    expect(screen.queryByText('Aktuelle Vorlage')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Eingaben leeren' }));

    await waitFor(() => expect(screen.getByPlaceholderText('Vorlage suchen...')).toBeInTheDocument());
    expect(screen.queryByText('Zeitraum filtern')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Aktuelle Vorlage').length).toBeGreaterThan(0));
    expect(screen.queryByText('Historische Vorlage Altbau')).not.toBeInTheDocument();
  });
});
