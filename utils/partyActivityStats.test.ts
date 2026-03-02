import { describe, expect, it } from 'vitest';
import { Organization, Paper } from '../types';
import { buildFactionMatchers } from './factionMatching';
import { computePartyActivityStats } from './partyActivityStats';

function createOrganization(overrides: Partial<Organization>): Organization {
  return {
    id: overrides.id || 'org-1',
    type: overrides.type || 'https://schema.oparl.org/1.1/Organization',
    body: overrides.body || 'https://example.org/body',
    name: overrides.name || 'Dummy',
    membership: overrides.membership || [],
    created: overrides.created || '2026-01-01T00:00:00+01:00',
    modified: overrides.modified || '2026-01-01T00:00:00+01:00',
    shortName: overrides.shortName,
    classification: overrides.classification,
  };
}

function createPaper(overrides: Partial<Paper>): Paper {
  return {
    id: overrides.id || 'paper-1',
    type: overrides.type || 'https://schema.oparl.org/1.1/Paper',
    body: overrides.body || 'https://example.org/body',
    name: overrides.name || 'Antrag',
    reference: overrides.reference || 'AN/0001/2026',
    date: overrides.date || '2026-01-01',
    paperType: overrides.paperType || 'Antrag',
    consultation: overrides.consultation || [],
    created: overrides.created || '2026-01-01T00:00:00+01:00',
    modified: overrides.modified || '2026-01-01T00:00:00+01:00',
    relatedPaper: overrides.relatedPaper,
    mainFile: overrides.mainFile,
    auxiliaryFile: overrides.auxiliaryFile,
    location: overrides.location,
    underDirectionOf: overrides.underDirectionOf,
    originator: overrides.originator,
  };
}

describe('computePartyActivityStats', () => {
  it('counts multiple faction matches fully and puts unmatched motions into Unbekannt', () => {
    const factionMatchers = buildFactionMatchers([
      createOrganization({
        id: 'cdu',
        name: 'Christlich Demokratische Union (CDU)',
        shortName: 'CDU',
        classification: 'Fraktionen und Gruppen',
      }),
      createOrganization({
        id: 'spd',
        name: 'Sozialdemokratische Partei Deutschlands (SPD)',
        shortName: 'SPD',
        classification: 'Fraktionen und Gruppen',
      }),
    ]);

    const papers = [
      createPaper({
        id: 'p1',
        date: '2026-01-10',
        paperType: 'Antrag nach § 3',
        name: 'Antrag der CDU-Fraktion zur Verkehrssicherheit',
      }),
      createPaper({
        id: 'p2',
        date: '2026-01-11',
        paperType: 'Gemeinsamer Antrag',
        name: 'Antrag der CDU und SPD zur Mobilität',
      }),
      createPaper({
        id: 'p3',
        date: '2026-01-12',
        paperType: 'Antrag nach § 3',
        name: 'Antrag zur Begrünung öffentlicher Flächen',
      }),
      createPaper({
        id: 'p4',
        date: '2025-12-30',
        paperType: 'Antrag',
        name: 'Antrag der CDU-Fraktion aus Vorjahr',
      }),
      createPaper({
        id: 'p5',
        date: '2026-01-13',
        paperType: 'Mitteilung',
        name: 'Mitteilung der Verwaltung',
      }),
    ];

    const result = computePartyActivityStats({
      papers,
      year: '2026',
      factionMatchers,
    });

    expect(result.motionCount).toBe(3);
    expect(result.mentionCount).toBe(4);

    const statsByName = new Map(result.stats.map((entry) => [entry.name, entry]));
    expect(statsByName.get('CDU')?.count).toBe(2);
    expect(statsByName.get('SPD')?.count).toBe(1);
    expect(statsByName.get('Unbekannt')?.count).toBe(1);
    expect(statsByName.get('CDU')?.percentage).toBeCloseTo(50, 6);
    expect(statsByName.get('SPD')?.percentage).toBeCloseTo(25, 6);
    expect(statsByName.get('Unbekannt')?.percentage).toBeCloseTo(25, 6);
  });

  it('returns empty stats when no motion exists in the selected year', () => {
    const factionMatchers = buildFactionMatchers([
      createOrganization({
        id: 'cdu',
        name: 'Christlich Demokratische Union (CDU)',
        shortName: 'CDU',
        classification: 'Fraktionen und Gruppen',
      }),
    ]);

    const papers = [
      createPaper({
        id: 'old-paper',
        date: '2025-02-01',
        paperType: 'Antrag',
        name: 'Antrag der CDU-Fraktion',
      }),
      createPaper({
        id: 'mitteilung',
        date: '2026-02-01',
        paperType: 'Mitteilung',
        name: 'Mitteilung zum Stand',
      }),
    ];

    const result = computePartyActivityStats({
      papers,
      year: '2026',
      factionMatchers,
    });

    expect(result.motionCount).toBe(0);
    expect(result.mentionCount).toBe(0);
    expect(result.stats).toEqual([]);
  });
});
