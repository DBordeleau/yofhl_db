export interface GoalieStart { date: string; player: string; points: number }

// Fantrax counts every start on the day the cap is reached, then stops on following days.
export function removeExtraGoalieStarts(total: number, starts: GoalieStart[], limit: number) {
    if (!Number.isFinite(total) || !Number.isInteger(limit) || limit < 1) throw new Error('Invalid goalie scoring total or limit');
    const ordered = [...starts].sort((a, b) => a.date.localeCompare(b.date));
    const seen = new Set<string>();
    let cutoff: string | null = null;
    ordered.forEach((start, index) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start.date) || !Number.isFinite(Date.parse(start.date)) || !start.player || !Number.isFinite(start.points)) throw new Error('Invalid goalie start');
        const key = `${start.date}:${start.player}`;
        if (seen.has(key)) throw new Error(`Duplicate goalie start: ${key}`);
        seen.add(key);
        if (index === limit - 1) cutoff = start.date;
    });
    const excluded = cutoff === null ? [] : ordered.filter(start => start.date > cutoff!);
    const removedCents = excluded.reduce((sum, start) => sum + Math.round(start.points * 100), 0);
    return { score: (Math.round(total * 100) - removedCents) / 100, excluded };
}
