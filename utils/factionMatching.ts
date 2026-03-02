import { Organization } from '../types';

export interface FactionMatcher {
  name: string;
  aliases: string[];
  normalizedAliases: string[];
  patterns: RegExp[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  values.forEach((value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  });
  return out;
}

function extractParenthesizedAliases(name: string): string[] {
  const aliases: string[] = [];
  const regex = /\(([^)]+)\)/g;
  let match: RegExpExecArray | null = regex.exec(name);
  while (match) {
    const content = match[1].trim();
    if (content) {
      aliases.push(content);
      content
        .split(/\s*(?:\/|,|;|\+|&| und )\s*/i)
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => aliases.push(part));
    }
    match = regex.exec(name);
  }
  return aliases;
}

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toAliasPattern(normalizedAlias: string): RegExp {
  const tokenPattern = normalizedAlias
    .split(' ')
    .filter(Boolean)
    .map((token) => escapeRegExp(token))
    .join('\\s+');
  return new RegExp(`(?:^|\\b)${tokenPattern}(?:\\b|$)`, 'i');
}

export function buildFactionMatchers(organizations: Organization[]): FactionMatcher[] {
  return organizations
    .filter((org) => normalizeText(org.classification || '') === 'fraktionen und gruppen')
    .map((org) => {
      const displayName = org.shortName?.trim() || org.name.trim();
      const aliases = uniqueStrings([
        org.shortName || '',
        org.name || '',
        ...extractParenthesizedAliases(org.name || ''),
      ]);
      const normalizedAliases = uniqueStrings(
        aliases
          .map((alias) => normalizeText(alias))
          .filter((alias) => alias.length >= 2),
      );

      return {
        name: displayName || 'Unbekannt',
        aliases,
        normalizedAliases,
        patterns: normalizedAliases.map(toAliasPattern),
      };
    })
    .filter((matcher) => matcher.patterns.length > 0);
}

export function matchFactions(text: string, factionMatchers: FactionMatcher[]): string[] {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return [];

  const matches = new Set<string>();
  factionMatchers.forEach((matcher) => {
    const found = matcher.patterns.some((pattern) => pattern.test(normalizedText));
    if (found) matches.add(matcher.name);
  });
  return Array.from(matches);
}
