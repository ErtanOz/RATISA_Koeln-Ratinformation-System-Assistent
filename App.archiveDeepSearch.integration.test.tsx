import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

describe('ArchiveDeepSearch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.mocked(archiveService.loadArchiveMeetingIndex).mockResolvedValue(buildArchiveIndex(25));
  });

  it('shows Von/Bis labels and validates reversed date ranges', async () => {
    render(
      <MemoryRouter>
        <ArchiveDeepSearch />
      </MemoryRouter>,
    );

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
  });

  it('shows the real total count and paginates through deep-search results', async () => {
    render(
      <MemoryRouter>
        <ArchiveDeepSearch />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tiefensuche aktivieren' }));

    await waitFor(() =>
      expect(screen.getByText(/25 archivierte Sitzungen/)).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText('Bis'), { target: { value: '2025-12-31' } });

    await waitFor(() => expect(screen.getByText('20 von 25 Treffern')).toBeInTheDocument());

    expect(screen.getByText('Archiv 25')).toBeInTheDocument();
    expect(screen.queryByText('Archiv 05')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '2' }));

    await waitFor(() => expect(screen.getByText('5 von 25 Treffern')).toBeInTheDocument());

    expect(screen.getByText('Archiv 05')).toBeInTheDocument();
    expect(screen.queryByText('Archiv 25')).not.toBeInTheDocument();
  });
});
