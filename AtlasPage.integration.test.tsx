import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasPage } from './AtlasPage';
import { AtlasDistrictFeatureCollection, AtlasMeetingRecord } from './types';
import { useAtlasData } from './hooks/useAtlasData';

vi.mock('./hooks/useAtlasData', () => ({
  useAtlasData: vi.fn(),
}));

const districts: AtlasDistrictFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { districtId: 'porz', label: 'Porz', districtNumber: '7' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { districtId: 'kalk', label: 'Kalk', districtNumber: '8' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [1.2, 0],
            [2.2, 0],
            [2.2, 1],
            [1.2, 1],
            [1.2, 0],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { districtId: 'mulheim', label: 'Mülheim', districtNumber: '9' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [2.4, 0],
            [3.4, 0],
            [3.4, 1],
            [2.4, 1],
            [2.4, 0],
          ],
        ],
      },
    },
  ],
};

const records: AtlasMeetingRecord[] = [
  {
    id: 'archive-porz',
    name: 'Porz-Wahn Verkehrsprojekt',
    start: '2025-05-10T16:00:00+02:00',
    dateKey: '2025-05-10',
    location: 'Porz',
    source: 'archive',
    searchText: 'porz wahn verkehrsprojekt',
    spatialMatches: [
      {
        districtId: 'porz',
        matchedTerms: ['Porz', 'Wahn'],
        sourceFields: ['searchText'],
        confidence: 'high',
      },
    ],
  },
  {
    id: 'live-kalk',
    name: 'Freiraum Kalker Höfe',
    start: '2026-03-10T16:00:00+01:00',
    dateKey: '2026-03-10',
    location: 'Kalk',
    source: 'live',
    searchText: 'freiraum kalker hoefe',
    spatialMatches: [
      {
        districtId: 'kalk',
        matchedTerms: ['Kalker Höfe'],
        sourceFields: ['searchText'],
        confidence: 'medium',
      },
    ],
  },
  {
    id: 'live-mulheim',
    name: 'Sanierung Mülheimer Brücke',
    start: '2026-03-12T16:00:00+01:00',
    dateKey: '2026-03-12',
    location: 'Mülheim',
    source: 'live',
    searchText: 'sanierung muelheimer bruecke',
    spatialMatches: [
      {
        districtId: 'mulheim',
        matchedTerms: ['Mülheimer Brücke'],
        sourceFields: ['searchText'],
        confidence: 'high',
      },
    ],
  },
];

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
};

function renderAtlas(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/atlas"
          element={
            <>
              <AtlasPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AtlasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAtlasData).mockReturnValue({
      districts,
      records,
      metadata: {
        generatedAt: '2026-03-12T00:00:00.000Z',
        itemCount: records.length,
        matchedItemCount: records.length,
        source: 'test',
        isPartial: true,
        stopReason: 'Test partial index',
      },
      loading: false,
      error: null,
      liveDataWarning: null,
      refetch: vi.fn(),
    });
  });

  it('applies URL filters on initial render', async () => {
    renderAtlas('/atlas?district=porz&mode=archive&confidence=high&q=wahn&minDate=2025-01-01&maxDate=2025-12-31');

    await waitFor(() => expect(screen.getByText('Bezirk Porz')).toBeInTheDocument());

    expect(screen.getByText('Porz-Wahn Verkehrsprojekt')).toBeInTheDocument();
    expect(screen.queryByText('Freiraum Kalker Höfe')).not.toBeInTheDocument();
    expect(screen.queryByText('Sanierung Mülheimer Brücke')).not.toBeInTheDocument();
  });

  it('updates the URL and panel when a district is selected on the map', async () => {
    renderAtlas('/atlas');

    fireEvent.click(screen.getByRole('button', { name: /Bezirk Porz/i }));

    await waitFor(() =>
      expect(screen.getByTestId('location-search').textContent).toContain('district=porz'),
    );
    expect(screen.getByText('Bezirk Porz')).toBeInTheDocument();
    expect(screen.getByText('Porz-Wahn Verkehrsprojekt')).toBeInTheDocument();
    expect(screen.queryByText('Freiraum Kalker Höfe')).not.toBeInTheDocument();
  });

  it('shows the partial archive warning and respects mode filters', async () => {
    renderAtlas('/atlas?mode=live');

    await waitFor(() =>
      expect(screen.getByText(/Der Archivindex ist unvollständig/i)).toBeInTheDocument(),
    );

    expect(screen.getByText('Freiraum Kalker Höfe')).toBeInTheDocument();
    expect(screen.getByText('Sanierung Mülheimer Brücke')).toBeInTheDocument();
    expect(screen.queryByText('Porz-Wahn Verkehrsprojekt')).not.toBeInTheDocument();
  });

  it('keeps the map visible when only live atlas data is unavailable', async () => {
    vi.mocked(useAtlasData).mockReturnValue({
      districts,
      records: records.filter((record) => record.source === 'archive'),
      metadata: {
        generatedAt: '2026-03-12T00:00:00.000Z',
        itemCount: 1,
        matchedItemCount: 1,
        source: 'test',
        isPartial: false,
      },
      loading: false,
      error: null,
      liveDataWarning:
        'Live-Sitzungen konnten nicht geladen werden. Der Atlas zeigt aktuell nur Archivdaten.',
      refetch: vi.fn(),
    });

    renderAtlas('/atlas');

    await waitFor(() =>
      expect(screen.getByText(/Live-Sitzungen konnten nicht geladen werden/i)).toBeInTheDocument(),
    );

    expect(screen.getByText('Köln Bezirke')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bezirk Porz/i })).toBeInTheDocument();
    expect(screen.getByText('Porz-Wahn Verkehrsprojekt')).toBeInTheDocument();
  });

  it('renders a clear empty state when filters remove all matches', async () => {
    renderAtlas('/atlas?district=porz&mode=live');

    await waitFor(() =>
      expect(
        screen.getByText(/Für die aktuellen Filter wurden keine räumlich zugeordneten Sitzungen gefunden/i),
      ).toBeInTheDocument(),
    );
  });
});
