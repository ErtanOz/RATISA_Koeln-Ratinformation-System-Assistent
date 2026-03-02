import { describe, expect, it } from 'vitest';
import { Organization } from '../types';
import { buildFactionMatchers, matchFactions } from './factionMatching';

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
    organizationType: overrides.organizationType,
    meeting: overrides.meeting,
    consultation: overrides.consultation,
    subOrganizationOf: overrides.subOrganizationOf,
  };
}

describe('factionMatching', () => {
  it('matches parenthesized abbreviations such as CDU', () => {
    const matchers = buildFactionMatchers([
      createOrganization({
        id: 'cdu',
        name: 'Christlich Demokratische Union (CDU)',
        shortName: 'CDU',
        classification: 'Fraktionen und Gruppen',
      }),
    ]);

    const matches = matchFactions('Antrag der CDU-Fraktion zum Verkehr', matchers);
    expect(matches).toEqual(['CDU']);
  });

  it('matches umlaut variants like GRÜNE and Gruene', () => {
    const matchers = buildFactionMatchers([
      createOrganization({
        id: 'gruene',
        name: 'Bündnis 90/Die Grünen (GRÜNE)',
        shortName: 'Grüne',
        classification: 'Fraktionen und Gruppen',
      }),
    ]);

    const matches = matchFactions('Antrag der Gruene Fraktion zur Mobilität', matchers);
    expect(matches).toEqual(['Grüne']);
  });

  it('finds multiple factions in the same text and deduplicates results', () => {
    const matchers = buildFactionMatchers([
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
      createOrganization({
        id: 'ausschuss',
        name: 'Mobilitätsausschuss',
        classification: 'Fachausschüsse und weitere Gremien',
      }),
    ]);

    const matches = matchFactions('Gemeinsamer Antrag der CDU und SPD; CDU unterstützt.', matchers);
    expect(matches.sort()).toEqual(['CDU', 'SPD']);
  });
});
