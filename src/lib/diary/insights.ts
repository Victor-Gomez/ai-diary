import { getRecentAnalyses } from './entries';
import { collectFacets } from './analysis';

export interface MoodTrendPoint {
  date: string; // ISO date key
  mood: number;
  stress: number;
  energy: number;
}

export interface Insights {
  entriesAnalyzed: number;
  avgMood: number | null;
  avgStress: number | null;
  avgEnergy: number | null;
  trend: MoodTrendPoint[];
  topTopics: { label: string; count: number }[];
}

/** Aggregate signals for the dashboard mood summary and trend chart. */
export function getInsights(limit = 30): Insights {
  const recent = getRecentAnalyses(limit);
  if (recent.length === 0) {
    return {
      entriesAnalyzed: 0,
      avgMood: null,
      avgStress: null,
      avgEnergy: null,
      trend: [],
      topTopics: [],
    };
  }

  const avg = (fn: (a: (typeof recent)[number]['analysis']) => number) =>
    recent.reduce((s, r) => s + fn(r.analysis), 0) / recent.length;

  // recent is newest-first; reverse for a left-to-right chronological trend.
  const trend: MoodTrendPoint[] = [...recent]
    .reverse()
    .map((r) => ({
      date: r.entry.createdAt.slice(0, 10),
      mood: r.analysis.mood,
      stress: r.analysis.stress,
      energy: r.analysis.energy,
    }));

  const topicCounts = new Map<string, number>();
  for (const r of recent) {
    for (const t of r.analysis.topics) {
      topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    }
  }
  const topTopics = [...topicCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    entriesAnalyzed: recent.length,
    avgMood: avg((a) => a.mood),
    avgStress: avg((a) => a.stress),
    avgEnergy: avg((a) => a.energy),
    trend,
    topTopics,
  };
}

export { collectFacets };
