import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationsPage } from './App';
import * as apiService from './services/oparlApiService';

vi.mock('./services/oparlApiService', async () => {
  const actual = await vi.importActual<typeof import('./services/oparlApiService')>(
    './services/oparlApiService',
  );

  return {
    ...actual,
    getListAll: vi.fn(),
    getList: vi.fn(),
  };
});

const organizations = [
  {
    id: 'org-1',
    type: 'https://schema.oparl.org/1.1/Organization',
    name: 'Ausschuss Verkehr',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    body: 'body-1',
    membership: [],
    classification: 'Fachausschüsse und weitere Gremien',
  },
  {
    id: 'org-2',
    type: 'https://schema.oparl.org/1.1/Organization',
    name: 'Ausschuss Bauen',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    body: 'body-1',
    membership: [],
    classification: 'Fachausschüsse und weitere Gremien',
  },
  {
    id: 'org-3',
    type: 'https://schema.oparl.org/1.1/Organization',
    name: 'Ausschuss Soziales',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    body: 'body-1',
    membership: [],
    classification: 'Fachausschüsse und weitere Gremien',
  },
  {
    id: 'org-4',
    type: 'https://schema.oparl.org/1.1/Organization',
    name: 'Fraktion Alpha',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    body: 'body-1',
    membership: [],
    classification: 'Fraktionen und Gruppen',
  },
  {
    id: 'org-5',
    type: 'https://schema.oparl.org/1.1/Organization',
    name: 'Fraktion Beta',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    body: 'body-1',
    membership: [],
    classification: 'Fraktionen und Gruppen',
  },
  {
    id: 'org-6',
    type: 'https://schema.oparl.org/1.1/Organization',
    name: 'BV Innenstadt',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    body: 'body-1',
    membership: [],
    classification: 'Bezirksvertretungen',
  },
  {
    id: 'org-7',
    type: 'https://schema.oparl.org/1.1/Organization',
    name: 'Rat Köln',
    created: '2026-01-01T00:00:00.000Z',
    modified: '2026-01-01T00:00:00.000Z',
    body: 'body-1',
    membership: [],
    classification: 'Rat',
  },
];

const pagedOrganizations = {
  data: organizations,
  links: {},
  pagination: {
    currentPage: 1,
    elementsPerPage: organizations.length,
    totalElements: organizations.length,
    totalPages: 1,
  },
};

function renderOrganizations(initialEntry = '/organizations') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/organizations" element={<OrganizationsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OrganizationsPage filters and chart interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiService.getListAll).mockResolvedValue(organizations as any[]);
    vi.mocked(apiService.getList).mockResolvedValue(pagedOrganizations as any);
  });

  it('maps legacy organizationType query to canonical classification filter', async () => {
    renderOrganizations('/organizations?organizationType=Fraktion');

    const select = (await screen.findByRole('combobox')) as HTMLSelectElement;

    await waitFor(() => expect(select.value).toBe('Fraktionen und Gruppen'));
    await waitFor(() => expect(screen.getByText(/2 Ergebnisse/)).toBeInTheDocument());

    expect(screen.getAllByText('Fraktion Alpha').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ausschuss Verkehr')).not.toBeInTheDocument();
  });

  it('filters by classification when select value changes', async () => {
    renderOrganizations();

    const select = (await screen.findByRole('combobox')) as HTMLSelectElement;
    await waitFor(() => expect(screen.getByText(/7 Ergebnisse/)).toBeInTheDocument());

    fireEvent.change(select, { target: { value: 'Rat' } });

    await waitFor(() => expect(screen.getByText(/1 Ergebnisse/)).toBeInTheDocument());
    expect(select.value).toBe('Rat');
    expect(screen.getAllByText('Rat Köln').length).toBeGreaterThan(0);
    expect(screen.queryByText('Fraktion Alpha')).not.toBeInTheDocument();
  });

  it('toggles classification filter when clicking chart legend entries', async () => {
    renderOrganizations();

    const select = (await screen.findByRole('combobox')) as HTMLSelectElement;
    await waitFor(() => expect(screen.getByText(/7 Ergebnisse/)).toBeInTheDocument());

    const fraktionenLegend = await screen.findByRole('button', { name: /Fraktionen und Gruppen/i });
    fireEvent.click(fraktionenLegend);

    await waitFor(() => expect(screen.getByText(/2 Ergebnisse/)).toBeInTheDocument());
    expect(select.value).toBe('Fraktionen und Gruppen');

    fireEvent.click(fraktionenLegend);
    await waitFor(() => expect(screen.getByText(/7 Ergebnisse/)).toBeInTheDocument());
    expect(select.value).toBe('');
  });

  it('toggles classification filter when clicking pie slices', async () => {
    renderOrganizations();

    const select = (await screen.findByRole('combobox')) as HTMLSelectElement;
    await waitFor(() => expect(screen.getByText(/7 Ergebnisse/)).toBeInTheDocument());

    const firstSlice = await screen.findByTestId('pie-segment-0');
    fireEvent.click(firstSlice);

    await waitFor(() => expect(screen.getByText(/3 Ergebnisse/)).toBeInTheDocument());
    expect(select.value).toBe('Fachausschüsse und weitere Gremien');

    fireEvent.click(firstSlice);
    await waitFor(() => expect(screen.getByText(/7 Ergebnisse/)).toBeInTheDocument());
    expect(select.value).toBe('');
  });
});
