import { describe, expect, it } from 'vitest';
import { AtlasLexiconDocument, AtlasMeetingRecord } from '../types';
import {
  createAtlasMatcher,
  filterAtlasRecords,
  mapArchiveItemToAtlasRecord,
  matchAtlasFields,
  mergeAtlasRecords,
} from './atlasService';

const lexicon: AtlasLexiconDocument = {
  generatedAt: '2026-03-12T00:00:00.000Z',
  source: 'test',
  entries: [
    { term: 'Porz', districtId: 'porz', kind: 'district', strong: true },
    { term: 'Wahn', districtId: 'porz', kind: 'stadtteil', strong: true },
    { term: 'Kalker Höfe', districtId: 'kalk', kind: 'landmark', strong: true, aliases: ['Kalker Hoefe'] },
    { term: 'Mülheimer Brücke', districtId: 'mulheim', kind: 'landmark', strong: true, aliases: ['Muelheimer Bruecke'] },
    { term: 'Eil', districtId: 'porz', kind: 'stadtteil', strong: false },
  ],
};

describe('atlasService', () => {
  it('matches direct district and place names to the expected districts', () => {
    const matcher = createAtlasMatcher(lexicon);

    const porzMatch = matchAtlasFields(
      { searchText: 'Verkehrskonzept fuer Koeln-Porz-Wahn' },
      matcher,
    );
    expect(porzMatch[0]).toMatchObject({
      districtId: 'porz',
      confidence: 'high',
    });

    const kalkMatch = matchAtlasFields(
      { searchText: 'Mitteilung zu den Kalker Hoefe' },
      matcher,
    );
    expect(kalkMatch[0]).toMatchObject({
      districtId: 'kalk',
      confidence: 'medium',
    });

    const mulheimMatch = matchAtlasFields(
      { searchText: 'Sanierung der Muelheimer Bruecke' },
      matcher,
    );
    expect(mulheimMatch[0]).toMatchObject({
      districtId: 'mulheim',
      confidence: 'medium',
    });
  });

  it('avoids false positives through bounded term matching', () => {
    const matcher = createAtlasMatcher(lexicon);
    const matches = matchAtlasFields(
      { searchText: 'Ein Teil der Planung bleibt offen.' },
      matcher,
    );

    expect(matches).toEqual([]);
  });

  it('maps archive items and respects confidence filters', () => {
    const matcher = createAtlasMatcher(lexicon);
    const record = mapArchiveItemToAtlasRecord(
      {
        id: 'archive-1',
        name: 'Projekt Kalker Hoefe',
        start: '2026-03-12T16:00:00+01:00',
        dateKey: '2026-03-12',
        location: 'Kalk',
        searchText: 'projekt kalker hoefe kalk',
      },
      matcher,
    );

    expect(record.spatialMatches[0]).toMatchObject({
      districtId: 'kalk',
      confidence: 'medium',
    });

    expect(filterAtlasRecords([record], { confidence: 'high' })).toEqual([]);
    expect(filterAtlasRecords([record], { confidence: 'medium' })).toHaveLength(1);
  });

  it('prefers live records when merging duplicate ids', () => {
    const archiveRecord: AtlasMeetingRecord = {
      id: 'same-id',
      name: 'Archiv Porz',
      start: '2025-02-10T10:00:00+01:00',
      dateKey: '2025-02-10',
      location: 'Porz',
      source: 'archive',
      searchText: 'archiv porz',
      spatialMatches: [
        { districtId: 'porz', matchedTerms: ['Porz'], sourceFields: ['searchText'], confidence: 'high' },
      ],
    };

    const liveRecord: AtlasMeetingRecord = {
      ...archiveRecord,
      name: 'Live Porz',
      source: 'live',
    };

    const merged = mergeAtlasRecords([archiveRecord, liveRecord]);

    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('live');
    expect(merged[0].name).toBe('Live Porz');
  });
});
