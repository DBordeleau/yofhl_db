import type { Metric } from './state';
export const COMPARE_COLORS = ['#1F6FC2', '#C8102E', '#B8860B', '#2E9E6B', '#7A4FD0'];
export interface ComparisonPlayer { id: string; name: string; playerStats: { Year: number; FPts: number; FPG: number }[] }
export interface ComparisonSeries { id: string; name: string; colour: string; values: (number | null)[] }
export interface ComparisonChart { years: number[]; series: ComparisonSeries[]; metric: Metric }

export function comparisonChart(players: ComparisonPlayer[], metric: Metric): ComparisonChart {
    const years = players.length < 2 ? [] : [...new Set(players[0].playerStats.map(row => row.Year))]
        .filter(year => players.every(player => player.playerStats.some(row => row.Year === year))).sort((a, b) => a - b);
    return { years, metric, series: players.map((player, index) => {
        const first = [...player.playerStats].sort((a, b) => a.Year - b.Year).find(row => row.FPts !== 0 || row.FPG !== 0)?.Year;
        return { id: player.id, name: player.name, colour: COMPARE_COLORS[index], values: years.map(year => {
            const row = player.playerStats.find(stats => stats.Year === year);
            const value = row?.[metric === 'fpts' ? 'FPts' : 'FPG'];
            return first === undefined || year < first || !Number.isFinite(value) ? null : value!;
        }) };
    }) };
}
