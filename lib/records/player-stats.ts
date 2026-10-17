export const PLAYER_STATS = [
    { id: 'goals', label: 'Goals', column: 'G' },
    { id: 'assists', label: 'Assists', column: 'A' },
    { id: 'shots', label: 'Shots on goal', column: 'SOG' },
    { id: 'hits', label: 'Hits', column: 'Hit' },
    { id: 'blocks', label: 'Blocks', column: 'Blk' },
] as const;
export type PlayerStat = typeof PLAYER_STATS[number]['id'];
export type PlayerCategories = Record<PlayerStat, number>;
export interface CategorySeason extends PlayerCategories { id: string; year: number }

interface StatsPage {
    displayedView: string;
    displayedPosOrGroup: string;
    displayedStatusOrTeam: string;
    displayedSeasonOrProjection: { name: string; code: string; timeframeTypeCode: string };
    paginatedResultSet: { pageNumber: number; totalNumResults: number; totalNumPages: number };
    tableHeader: { cells: { shortName: string }[] };
    statsTable: { scorer: { scorerId: string }; cells: { content?: string }[] }[];
}

export function parseCategoryPage(value: unknown, year: number, pageNumber: number) {
    const data = value as StatsPage;
    const name = `${year - 1}-${String(year).slice(-2)} Reg Season - YTD`;
    if (data?.displayedView !== 'STATS' || data.displayedPosOrGroup !== 'HOCKEY_SKATING' || data.displayedStatusOrTeam !== 'ALL' ||
        data.displayedSeasonOrProjection?.name !== name || data.displayedSeasonOrProjection.timeframeTypeCode !== 'YEAR_TO_DATE' ||
        !data.displayedSeasonOrProjection.code.startsWith('SEASON_') || !Array.isArray(data.statsTable) || !Array.isArray(data.tableHeader?.cells) ||
        data.paginatedResultSet?.pageNumber !== pageNumber || !Number.isInteger(data.paginatedResultSet.totalNumPages) || data.paginatedResultSet.totalNumPages < 1 ||
        !Number.isInteger(data.paginatedResultSet.totalNumResults) || data.paginatedResultSet.totalNumResults < 1) throw new Error(`Unexpected Fantrax stats page for ${name}`);
    const columns = Object.fromEntries(PLAYER_STATS.map(stat => [stat.id, data.tableHeader.cells.findIndex(c => c.shortName === stat.column)])) as Record<PlayerStat, number>;
    const gamesColumn = data.tableHeader.cells.findIndex(c => c.shortName === 'GP');
    if (gamesColumn < 0 || Object.values(columns).some(index => index < 0)) throw new Error(`Missing stat columns for ${name}`);
    const seen = new Set<string>();
    const numeric = (content: string | undefined) => {
        if (content == null || /^(?:-|—|N\/A)?$/.test(content.trim())) return null;
        const result = Number(content.replace(/,/g, ''));
        if (!Number.isInteger(result) || result < 0) throw new Error('Invalid player category total');
        return result;
    };
    const allIds: string[] = [];
    const players: CategorySeason[] = [];
    for (const row of data.statsTable) {
        const id = row.scorer?.scorerId;
        if (!id || seen.has(id) || !Array.isArray(row.cells)) throw new Error('Missing or duplicate player in stats page');
        seen.add(id); allIds.push(id);
        const games = numeric(row.cells[gamesColumn]?.content);
        if (games == null || games === 0) continue;
        const totals = Object.fromEntries(PLAYER_STATS.map(stat => [stat.id, numeric(row.cells[columns[stat.id]]?.content)]));
        if (Object.values(totals).some(value => value === null)) throw new Error(`Incomplete categories for ${id}, ${name}`);
        players.push({ id, year, ...totals as PlayerCategories });
    }
    return { players, allIds, pagination: data.paginatedResultSet, seasonCode: data.displayedSeasonOrProjection.code };
}
