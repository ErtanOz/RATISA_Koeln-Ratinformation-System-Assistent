import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaperDeepSearch } from './routes/shared/PaperDeepSearch';
import * as paperSearchService from './services/paperDeepSearchService';

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

function buildPaperIndex(count: number) {
  return {
    metadata: {
      generatedAt: '2026-03-13T00:00:00.000Z',
      itemCount: count,
      source: 'test',
      isPartial: false,
    },
    items: Array.from({ length: count }, (_, index) => {
      const itemNumber = index + 1;
      const day = String(itemNumber).padStart(2, '0');
      return {
        id: `paper-${itemNumber}`,
        name: `Historische Vorlage ${day}`,
        reference: `2025/${day}`,
        paperType: itemNumber % 2 === 0 ? 'Antrag' : 'Mitteilung',
        dateKey: `2025-01-${day}`,
        searchText: `historische vorlage ${day} 2025/${day} ${itemNumber % 2 === 0 ? 'antrag' : 'mitteilung'}`,
      };
    }),
  };
}

const LocationSearch = () => {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
};

function renderPaperDeepSearch(initialEntry = '/papers') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PaperDeepSearch />
      <LocationSearch />
    </MemoryRouter>,
  );
}

describe('PaperDeepSearch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(paperSearchService.loadPaperSearchIndex).mockResolvedValue(buildPaperIndex(25));
  });

  it('shows date labels and validates reversed date ranges', async () => {
    renderPaperDeepSearch();

    expect(screen.getByLabelText('Vorlagen von')).toBeInTheDocument();
    expect(screen.getByLabelText('Vorlagen bis')).toBeInTheDocument();
    expect(
      screen.getByText((_, node) =>
        node?.textContent === 'Nur Bis ausfuellen, um Vorlagen vor einem Stichtag zu finden.',
      ),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Vorlagen von'), { target: { value: '2025-02-10' } });
    fireEvent.change(screen.getByLabelText('Vorlagen bis'), { target: { value: '2025-02-01' } });

    expect(
      screen.getByText('Das Startdatum darf nicht nach dem Enddatum liegen.'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('location-search').textContent).toContain('deepMinDate=2025-02-10');
      expect(screen.getByTestId('location-search').textContent).toContain('deepMaxDate=2025-02-01');
    });
  });

  it('shows the real total count and paginates deep-search results', async () => {
    renderPaperDeepSearch();

    fireEvent.focus(screen.getByRole('searchbox', { name: 'Historische Vorlagen durchsuchen' }));

    await waitFor(() =>
      expect(screen.getByText(/25 indexierte Vorlagen/)).toBeInTheDocument(),
    );
    expect(screen.getByText('Index geladen')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Vorlagen bis'), { target: { value: '2025-12-31' } });

    await waitFor(() => expect(screen.getByText('20 von 25 Treffern')).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByTestId('location-search').textContent).toContain('deepMaxDate=2025-12-31'),
    );

    expect(screen.getAllByText('Historische Vorlage 25').length).toBeGreaterThan(0);
    expect(screen.queryByText('Historische Vorlage 05')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Seite 2' }));

    await waitFor(() => expect(screen.getByText('5 von 25 Treffern')).toBeInTheDocument());
    expect(screen.getAllByText('Historische Vorlage 05').length).toBeGreaterThan(0);
    expect(screen.queryByText('Historische Vorlage 25')).not.toBeInTheDocument();
  });

  it('loads the paper index when the search field receives focus', async () => {
    renderPaperDeepSearch();

    fireEvent.focus(screen.getByRole('searchbox', { name: 'Historische Vorlagen durchsuchen' }));

    await waitFor(() =>
      expect(paperSearchService.loadPaperSearchIndex).toHaveBeenCalled(),
    );
  });

  it('loads the paper index when the visible Bis date field is clicked', async () => {
    renderPaperDeepSearch();

    fireEvent.click(screen.getByRole('button', { name: 'Vorlagen bis auswaehlen' }));

    await waitFor(() =>
      expect(paperSearchService.loadPaperSearchIndex).toHaveBeenCalled(),
    );
  });

  it('hydrates from URL params and clears them when inputs are reset', async () => {
    renderPaperDeepSearch('/papers?deepQ=historische&deepType=Mitteilung&deepMaxDate=2025-12-31');

    await waitFor(() =>
      expect(paperSearchService.loadPaperSearchIndex).toHaveBeenCalled(),
    );

    expect(screen.getByRole('searchbox', { name: 'Historische Vorlagen durchsuchen' })).toHaveValue(
      'historische',
    );
    expect(screen.getByLabelText('Vorlagentyp')).toHaveValue('Mitteilung');

    await waitFor(() => expect(screen.getByText('13 Treffer')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Eingaben leeren' }));

    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: 'Historische Vorlagen durchsuchen' })).toHaveValue(
        '',
      );
      expect(screen.getByLabelText('Vorlagentyp')).toHaveValue('');
      expect(screen.getByTestId('location-search').textContent).toBe('');
    });
  });
});
