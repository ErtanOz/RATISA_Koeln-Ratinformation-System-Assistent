import { describe, expect, it } from 'vitest';
import { PaperSearchIndexDocument, queryPaperSearchIndex } from './paperDeepSearchService';

const buildIndex = (): PaperSearchIndexDocument => ({
  metadata: {
    generatedAt: '2026-03-13T00:00:00.000Z',
    itemCount: 5,
    source: 'test',
    isPartial: false,
  },
  items: [
    {
      id: 'paper-1',
      name: 'Radverkehr Konzept',
      reference: '2024/123',
      paperType: 'Mitteilung',
      dateKey: '2024-06-12',
      searchText: 'radverkehr konzept 2024/123 mitteilung',
    },
    {
      id: 'paper-2',
      name: 'Radweg Ausbau',
      reference: '2024/124',
      paperType: 'Antrag nach § 3 der GeschO des Rates',
      dateKey: '2024-06-10',
      searchText: 'radweg ausbau 2024/124 antrag nach § 3 der gescho des rates',
    },
    {
      id: 'paper-3',
      name: 'Schulbau Programm',
      reference: '2023/050',
      paperType: 'Beschlussvorlage',
      dateKey: '2023-02-20',
      searchText: 'schulbau programm 2023/050 beschlussvorlage',
    },
    {
      id: 'paper-4',
      name: 'Radverkehr',
      reference: '2022/010',
      paperType: 'Mitteilung',
      dateKey: '2022-04-04',
      searchText: 'radverkehr 2022/010 mitteilung',
    },
    {
      id: 'paper-5',
      name: 'Radverkehr Konzept Fortschreibung',
      reference: '2025/001',
      paperType: 'Mitteilung',
      dateKey: '2025-01-15',
      searchText: 'radverkehr konzept fortschreibung 2025/001 mitteilung',
    },
  ],
});

describe('paperDeepSearchService', () => {
  it('matches text by title and reference tokens', () => {
    const result = queryPaperSearchIndex(buildIndex(), {
      query: 'radverkehr 2024/123',
    });

    expect(result.totalMatches).toBe(1);
    expect(result.items.map((item) => item.id)).toEqual(['paper-1']);
  });

  it('filters by paper type', () => {
    const result = queryPaperSearchIndex(buildIndex(), {
      paperType: 'Antrag',
    });

    expect(result.totalMatches).toBe(1);
    expect(result.items[0]?.paperType).toContain('Antrag');
  });

  it('filters by date range', () => {
    const result = queryPaperSearchIndex(buildIndex(), {
      minDate: '2024-01-01',
      maxDate: '2024-12-31',
    });

    expect(result.items.map((item) => item.id)).toEqual(['paper-1', 'paper-2']);
  });

  it('orders by score first and paginates results', () => {
    const pageOne = queryPaperSearchIndex(buildIndex(), {
      query: 'radverkehr',
      offset: 0,
      limit: 2,
    });
    const pageTwo = queryPaperSearchIndex(buildIndex(), {
      query: 'radverkehr',
      offset: 2,
      limit: 2,
    });

    expect(pageOne.totalMatches).toBe(3);
    expect(pageOne.items.map((item) => item.id)).toEqual(['paper-4', 'paper-5']);
    expect(pageTwo.items.map((item) => item.id)).toEqual(['paper-1']);
  });
});
