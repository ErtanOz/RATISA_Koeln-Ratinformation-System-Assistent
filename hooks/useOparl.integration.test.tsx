import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useOparlFiltered } from './useOparl';
import * as apiService from '../services/oparlApiService';

vi.mock('../services/oparlApiService', async () => {
  const actual = await vi.importActual<typeof import('../services/oparlApiService')>(
    '../services/oparlApiService',
  );

  return {
    ...actual,
    getListSnapshot: vi.fn(),
  };
});

describe('useOparlFiltered', () => {
  it('filters and sorts data client-side', async () => {
    const getListSnapshotMock = vi.mocked(apiService.getListSnapshot);
    getListSnapshotMock.mockResolvedValue([
      { id: '1', name: 'Radweg-Ausbau', reference: 'A1', date: '2025-01-05' },
      { id: '2', name: 'Radverkehr Konzept', reference: 'A2', date: '2025-03-02' },
      { id: '3', name: 'Schulbau', reference: 'B1', date: '2025-02-01' },
    ] as any[]);

    const { result } = renderHook(() =>
      useOparlFiltered<any>('papers', {
        q: 'rad',
        minDate: '2025-01-01',
        maxDate: '2025-12-31',
        sortField: 'date',
        sortDesc: true,
        currentPage: 1,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.pagination.totalElements).toBe(2);
    expect(result.current.data?.data.map((x: any) => x.id)).toEqual(['2', '1']);
  });

  it('applies classification field filter for organizations', async () => {
    const getListSnapshotMock = vi.mocked(apiService.getListSnapshot);
    getListSnapshotMock.mockResolvedValue([
      { id: '1', name: 'Ausschuss A', classification: 'Fachausschüsse und weitere Gremien' },
      { id: '2', name: 'Fraktion A', classification: 'Fraktionen und Gruppen' },
      { id: '3', name: 'Fraktion B', classification: 'Fraktionen und Gruppen' },
      { id: '4', name: 'Rat', classification: 'Rat' },
    ] as any[]);

    const { result } = renderHook(() =>
      useOparlFiltered<any>('organizations', {
        fieldFilters: { classification: 'Fraktionen und Gruppen' },
        currentPage: 1,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.pagination.totalElements).toBe(2);
    expect(result.current.data?.data.map((x: any) => x.name)).toEqual(['Fraktion A', 'Fraktion B']);
  });
});
