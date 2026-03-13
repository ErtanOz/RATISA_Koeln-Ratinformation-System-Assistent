import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useAtlasData } from './hooks/useAtlasData';
import { AtlasDistrictFeatureCollection, AtlasMeetingRecord } from './types';

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
];

describe('App atlas routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/atlas');
    vi.mocked(useAtlasData).mockReturnValue({
      districts,
      records,
      metadata: {
        generatedAt: '2026-03-12T00:00:00.000Z',
        itemCount: records.length,
        matchedItemCount: records.length,
        source: 'test',
        isPartial: false,
      },
      loading: false,
      error: null,
      liveDataWarning: null,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('renders the atlas page when /atlas is opened directly in the browser', async () => {
    render(<App />);

    expect(await screen.findByText('Köln Bezirke')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bezirk Porz/i })).toBeInTheDocument();
    expect(screen.getByText('Porz-Wahn Verkehrsprojekt')).toBeInTheDocument();
  });
});
