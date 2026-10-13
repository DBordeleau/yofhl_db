interface StatsPage {
    displayedStatusOrTeam: string;
    displayedPosOrGroup: string;
    displayedSortType: string;
    displayedSortReversed: boolean;
    displayedView: string;
    displayedScoringCategoryType: string;
    displayedSeasonOrProjection: { code: string; name: string; timeframeTypeCode: string };
    seasonOrProjections: { code: string; name: string }[];
    paginatedResultSet: { pageNumber: number; totalNumResults: number };
    tableHeader: { cells: { key?: string }[] };
    statsTable: {
        scorer: { scorerId: string; name: string; posShortNames: string };
        cells: { content?: string; teamId?: string }[];
    }[];
}

// shortcut: Fantrax's website stats endpoint is undocumented; replace it when a supported player-stats API is available.
async function loadStatsTable(leagueId: string, seasonYear: number, roster = false) {
    const filter = roster ? 'ALL_TAKEN' : 'ALL';
    // shortcut: one page covers this league; add pagination if rosters ever exceed 1,000 players.
    const limit = roster ? 1000 : 5;
    async function request(season?: string): Promise<StatsPage> {
        const response = await fetch(`https://www.fantrax.com/fxpa/req?leagueId=${encodeURIComponent(leagueId)}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(12000),
            body: JSON.stringify({ msgs: [{ method: 'getPlayerStats', data: {
                leagueId, view: 'STATS', statusOrTeamFilter: filter, positionOrGroup: 'ALL', sortType: 'SCORE', sortReversed: false,
                scoringCategoryType: '5', pageNumber: '1', maxResultsPerPage: String(limit), miscDisplayType: '1',
                ...(season ? { seasonOrProjection: season } : {}),
            } }] }),
        });
        if (!response.ok) throw new Error(`Fantrax player stats returned ${response.status}`);
        const data = (await response.json()).responses?.[0]?.data as StatsPage | undefined;
        if (!Array.isArray(data?.statsTable) || !Array.isArray(data.tableHeader?.cells) || !Array.isArray(data.seasonOrProjections) ||
            data.displayedStatusOrTeam !== filter || data.displayedPosOrGroup !== 'ALL' || data.displayedSortType !== 'SCORE' || data.displayedSortReversed !== false ||
            data.displayedView !== 'STATS' || data.displayedScoringCategoryType !== '5' ||
            data.paginatedResultSet?.pageNumber !== 1 || !Number.isInteger(data.paginatedResultSet.totalNumResults) || data.paginatedResultSet.totalNumResults < 0 ||
            data.statsTable.length !== Math.min(limit, data.paginatedResultSet.totalNumResults) ||
            (roster && data.paginatedResultSet.totalNumResults > limit)) throw new Error('Fantrax returned an incomplete or unexpected player stats table');
        return data;
    }

    const seasonName = `${seasonYear}-${String(seasonYear + 1).slice(-2)} Reg Season - YTD`;
    let data = await request();
    if (data.displayedSeasonOrProjection?.name !== seasonName) {
        const season = data.seasonOrProjections.find(item => item.name === seasonName);
        if (!season) throw new Error('Fantrax did not offer current-season scoring totals');
        data = await request(season.code);
    }
    if (data.displayedSeasonOrProjection?.name !== seasonName || data.displayedSeasonOrProjection.timeframeTypeCode !== 'YEAR_TO_DATE' ||
        !data.displayedSeasonOrProjection.code.startsWith('SEASON_')) throw new Error('Fantrax returned the wrong scoring season');
    return data;
}

export async function loadScoringLeaders(leagueId: string, seasonYear: number) {
    const data = await loadStatsTable(leagueId, seasonYear);
    const pointsColumn = data.tableHeader.cells.findIndex(cell => cell.key === 'fpts');
    const teamColumn = data.tableHeader.cells.findIndex(cell => cell.key === 'status');
    if (pointsColumn < 0 || teamColumn < 0) throw new Error('Fantrax scoring columns are missing');
    const seen = new Set<string>();
    return data.statsTable.map(row => {
        const player = row.scorer;
        const value = row.cells?.[pointsColumn]?.content;
        const team = row.cells?.[teamColumn];
        if (typeof player?.scorerId !== 'string' || !player.scorerId || seen.has(player.scorerId) ||
            typeof player.name !== 'string' || !player.name || typeof player.posShortNames !== 'string' ||
            typeof value !== 'string' || !team || (team.content != null && typeof team.content !== 'string') ||
            (team.teamId != null && typeof team.teamId !== 'string')) throw new Error('Fantrax scoring leader is invalid');
        seen.add(player.scorerId);
        const points = /^(?:-|—|N\/A)?$/.test(value.trim()) ? 0 : Number(value.replace(/,/g, ''));
        if (!Number.isFinite(points)) throw new Error('Fantrax scoring total is invalid');
        return { id: player.scorerId, name: player.name, position: player.posShortNames, points, teamId: team.teamId ?? null, team: team.content ?? 'FA' };
    }).filter(player => player.points > 0).sort((a, b) => b.points - a.points);
}

export async function loadRosterStats(leagueId: string, seasonYear: number) {
    const data = await loadStatsTable(leagueId, seasonYear, true);
    const pointsColumn = data.tableHeader.cells.findIndex(cell => cell.key === 'fpts');
    const perGameColumn = data.tableHeader.cells.findIndex(cell => cell.key === 'fptsPerGame');
    if (pointsColumn < 0 || perGameColumn < 0) throw new Error('Fantrax roster scoring columns are missing');
    const seen = new Set<string>();
    const numeric = (value: string | undefined) => {
        if (typeof value !== 'string') throw new Error('Fantrax roster stat is missing');
        if (/^(?:-|—|N\/A)?$/.test(value.trim())) return null;
        const number = Number(value.replace(/,/g, ''));
        if (!Number.isFinite(number)) throw new Error('Fantrax roster stat is invalid');
        return number;
    };
    return Object.fromEntries(data.statsTable.map(row => {
        const id = row.scorer?.scorerId;
        if (typeof id !== 'string' || !id || seen.has(id)) throw new Error('Fantrax roster player is invalid');
        seen.add(id);
        return [id, { points: numeric(row.cells?.[pointsColumn]?.content), perGame: numeric(row.cells?.[perGameColumn]?.content) }];
    }));
}
