import { Paper } from '../types';
import { FactionMatcher, matchFactions } from './factionMatching';

export interface PartyActivityStat {
  name: string;
  count: number;
  percentage: number;
}

interface ComputePartyActivityStatsInput {
  papers: Paper[];
  year: string;
  factionMatchers: FactionMatcher[];
  topN?: number;
  unknownLabel?: string;
}

export interface PartyActivityStatsResult {
  stats: PartyActivityStat[];
  motionCount: number;
  mentionCount: number;
}

function isMotionPaperForYear(paper: Paper, year: string): boolean {
  if (!paper.date || !paper.date.startsWith(year)) return false;
  const paperType = (paper.paperType || '').toLowerCase();
  const paperName = (paper.name || '').toLowerCase();
  return paperType.includes('antrag') || paperName.includes('antrag');
}

export function computePartyActivityStats({
  papers,
  year,
  factionMatchers,
  topN = 8,
  unknownLabel = 'Unbekannt',
}: ComputePartyActivityStatsInput): PartyActivityStatsResult {
  const relevantMotions = papers.filter((paper) => isMotionPaperForYear(paper, year));
  const counts = new Map<string, number>();

  relevantMotions.forEach((paper) => {
    const sourceText = `${paper.name || ''} ${paper.paperType || ''}`.trim();
    const matches = matchFactions(sourceText, factionMatchers);
    if (matches.length === 0) {
      counts.set(unknownLabel, (counts.get(unknownLabel) || 0) + 1);
      return;
    }

    matches.forEach((match) => {
      counts.set(match, (counts.get(match) || 0) + 1);
    });
  });

  const mentionCount = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
  if (mentionCount === 0) {
    return { stats: [], motionCount: relevantMotions.length, mentionCount };
  }

  const stats = Array.from(counts.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0], 'de-DE');
    })
    .slice(0, topN)
    .map(([name, count]) => ({
      name,
      count,
      percentage: (count / mentionCount) * 100,
    }));

  return { stats, motionCount: relevantMotions.length, mentionCount };
}
