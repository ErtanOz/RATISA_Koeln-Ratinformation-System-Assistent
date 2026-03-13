import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AtlasArchiveIndexDocument, AtlasDistrictFeatureCollection, AtlasLexiconDocument } from '../types';
import * as atlasService from '../services/atlasService';
import * as apiService from '../services/oparlApiService';
import { useAtlasData } from './useAtlasData';

vi.mock('../services/atlasService', async () => {
  const actual = await vi.importActual<typeof import('../services/atlasService')>(
    '../services/atlasService',
  );

  return {
    ...actual,
    loadKoelnDistricts: vi.fn(),
    loadKoelnSpatialLexicon: vi.fn(),
    loadAtlasArchiveIndex: vi.fn(),
  };
});

vi.mock('../services/oparlApiService', async () => {
  const actual = await vi.importActual<typeof import('../services/oparlApiService')>(
    '../services/oparlApiService',
  );

  return {
    ...actual,
    getListSnapshot: vi.fn(),
  };
});

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

const lexicon: AtlasLexiconDocument = {
  generatedAt: '2026-03-12T00:00:00.000Z',
  source: 'test',
  entries: [{ term: 'Porz', districtId: 'porz', kind: 'district', strong: true, aliases: [] }],
};

const archiveIndex: AtlasArchiveIndexDocument = {
  metadata: {
    generatedAt: '2026-03-12T00:00:00.000Z',
    itemCount: 1,
    matchedItemCount: 1,
    source: 'test',
    isPartial: false,
  },
  items: [
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
  ],
};

describe('useAtlasData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(atlasService.loadKoelnDistricts).mockResolvedValue(districts);
    vi.mocked(atlasService.loadKoelnSpatialLexicon).mockResolvedValue(lexicon);
    vi.mocked(atlasService.loadAtlasArchiveIndex).mockResolvedValue(archiveIndex);
  });

  it('keeps archive data available when live meetings cannot be loaded', async () => {
    vi.mocked(apiService.getListSnapshot).mockRejectedValue(new Error('Dienst nicht verfügbar.'));

    const { result } = renderHook(() => useAtlasData());

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() =>
      expect(result.current.liveDataWarning).toMatch(/Live-Sitzungen konnten nicht geladen werden/i),
    );

    expect(result.current.error).toBeNull();
    expect(result.current.districts).toEqual(districts);
    expect(result.current.metadata).toEqual(archiveIndex.metadata);
    expect(result.current.records).toEqual(archiveIndex.items);
  });
});
