import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArchiveDeepSearch } from './App';
import * as archiveService from './services/archiveDeepSearchService';

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

function buildArchiveIndex(count: number) {
  return {
    metadata: {
      generatedAt: '2026-03-11T00:00:00.000Z',
      itemCount: count,
      source: 'test',
      isPartial: false,
    },
    items: Array.from({ length: count }, (_, index) => {
      const itemNumber = index + 1;
      const day = String(itemNumber).padStart(2, '0');
      return {
        id: `archive-${itemNumber}`,
        name: `Archiv ${day}`,
        start: `2025-01-${day}T10:00:00+01:00`,
        dateKey: `2025-01-${day}`,
        location: 'Historisches Rathaus',
        searchText: `archiv ${day} historisches rathaus`,
      };
    }),
  };
}

const LocationSearch = () => {
  const location = useLocation();

  return <div data-testid="location-search">{location.search}</div>;
};

function renderArchiveDeepSearch(initialEntry = '/archive') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ArchiveDeepSearch />
      <LocationSearch />
    </MemoryRouter>,
  );
}

describe('ArchiveDeepSearch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(archiveService.loadArchiveMeetingIndex).mockResolvedValue(buildArchiveIndex(25));
  });

  it('shows Von/Bis labels and validates reversed date ranges', async () => {
    renderArchiveDeepSearch();

    expect(screen.getByLabelText('Von')).toBeInTheDocument();
    expect(screen.getByLabelText('Bis')).toBeInTheDocument();
    expect(
      screen.getByText((_, node) =>
        node?.textContent === 'Nur Bis ausfuellen, um Sitzungen vor einem Stichtag zu finden.',
      ),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Von'), { target: { value: '2025-02-10' } });
    fireEvent.change(screen.getByLabelText('Bis'), { target: { value: '2025-02-01' } });

    expect(
      screen.getByText('Das Startdatum darf nicht nach dem Enddatum liegen.'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('location-search').textContent).toContain('minDate=2025-02-10');
      expect(screen.getByTestId('location-search').textContent).toContain('maxDate=2025-02-01');
    });
  });

  it('shows the real total count and paginates through deep-search results', async () => {
    renderArchiveDeepSearch();

    fireEvent.focus(screen.getByRole('searchbox', { name: 'Archiv durchsuchen' }));

    await waitFor(() =>
      expect(screen.getByText(/25 archivierte Sitzungen/)).toBeInTheDocument(),
    );
    expect(screen.getByText('Index geladen')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Bis'), { target: { value: '2025-12-31' } });

    await waitFor(() => expect(screen.getByText('20 von 25 Treffern')).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByTestId('location-search').textContent).toContain('maxDate=2025-12-31'),
    );

    expect(screen.getByText('Archiv 25')).toBeInTheDocument();
    expect(screen.queryByText('Archiv 05')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Seite 2' }));

    await waitFor(() => expect(screen.getByText('5 von 25 Treffern')).toBeInTheDocument());

    expect(screen.getByText('Archiv 05')).toBeInTheDocument();
    expect(screen.queryByText('Archiv 25')).not.toBeInTheDocument();
  });

  it('loads the archive index when the search field receives focus', async () => {
    renderArchiveDeepSearch();

    fireEvent.focus(screen.getByRole('searchbox', { name: 'Archiv durchsuchen' }));

    await waitFor(() =>
      expect(archiveService.loadArchiveMeetingIndex).toHaveBeenCalled(),
    );
  });

  it('loads the archive index when the visible Bis date field is clicked', async () => {
    renderArchiveDeepSearch();

    fireEvent.click(screen.getByRole('button', { name: 'Bis auswaehlen' }));

    await waitFor(() =>
      expect(archiveService.loadArchiveMeetingIndex).toHaveBeenCalled(),
    );
  });

  it('hydrates from URL params and clears them when inputs are reset', async () => {
    renderArchiveDeepSearch('/archive?q=rathaus&maxDate=2025-12-31');

    await waitFor(() =>
      expect(archiveService.loadArchiveMeetingIndex).toHaveBeenCalled(),
    );

    expect(screen.getByRole('searchbox', { name: 'Archiv durchsuchen' })).toHaveValue('rathaus');

    await waitFor(() => expect(screen.getByText('20 von 25 Treffern')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Seite 2' }));

    await waitFor(() => expect(screen.getByText('5 von 25 Treffern')).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByTestId('location-search').textContent).toContain('page=2'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Eingaben leeren' }));

    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: 'Archiv durchsuchen' })).toHaveValue('');
      expect(screen.getByTestId('location-search').textContent).toBe('');
    });
  });
});
