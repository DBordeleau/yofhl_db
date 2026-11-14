// Fantrax's website standings table: the season-to-date table the Team Stats CSV is exported from, with each
// team's rank, W/L/T and points for and against. The public API's standings have no points against.
import { globalFetch, websiteRequest } from './leaders';

export interface TableStanding {
    /** the Fantrax team */
    teamId: string;
    /** 1-based place in the table */
    rank: number;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: number;
    pointsAgainst: number;
}

interface StandingsPage {
    displayedSelections?: { view?: string; timeframeType?: string };
    fantasyTeamInfo?: Record<string, unknown>;
    tableList?: {
        fixedHeader?: { cells?: { key?: string }[] };
        header?: { cells?: { key?: string }[] };
        rows?: { fixedCells?: { content?: string; teamId?: string }[]; cells?: { content?: string }[] }[];
    }[];
}

const COLUMNS = ['win', 'loss', 'tie', 'pointsFor', 'pointsAgainst'] as const;
const invalid = () => new Error('Fantrax returned an incomplete or unexpected standings table');

function count(value: string | undefined) {
    if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) throw invalid();
    return Number(value);
}
function points(value: string | undefined) {
    const number = typeof value === 'string' && value.trim() ? Number(value.replace(/,/g, '')) : NaN;
    if (!Number.isFinite(number)) throw invalid();
    return number;
}

// shortcut: Fantrax's website standings endpoint is undocumented; replace it when the public API gives points against.
export async function loadStandingsTable(leagueId: string, fetcher = globalFetch): Promise<TableStanding[]> {
    const data = await websiteRequest(leagueId, 'getStandings', { leagueId, view: 'ALL' }, 'standings', fetcher) as StandingsPage | undefined;
    if (data?.displayedSelections?.view !== 'ALL' || data.displayedSelections.timeframeType !== 'YEAR_TO_DATE' ||
        !data.fantasyTeamInfo || !Array.isArray(data.tableList)) throw invalid();
    const keys = (cells?: { key?: string }[]) => (cells ?? []).map(cell => cell.key);
    // The per-period results tables follow it, keyed by away and home team.
    const tables = data.tableList.filter(table => keys(table.fixedHeader?.cells).join() === 'rank,team');
    if (tables.length !== 1 || !Array.isArray(tables[0].rows)) throw invalid();
    const [table] = tables;
    const columns = COLUMNS.map(key => keys(table.header?.cells).indexOf(key));
    if (columns.some(column => column < 0)) throw invalid();

    const teams = Object.keys(data.fantasyTeamInfo);
    const standings = table.rows!.map(row => {
        const [rank, team] = row.fixedCells ?? [];
        const [wins, losses, ties, pointsFor, pointsAgainst] = columns.map(column => row.cells?.[column]?.content);
        if (typeof team?.teamId !== 'string' || !teams.includes(team.teamId)) throw invalid();
        return { teamId: team.teamId, rank: count(rank?.content), wins: count(wins), losses: count(losses), ties: count(ties),
            pointsFor: points(pointsFor), pointsAgainst: points(pointsAgainst) };
    });
    // every team once, ranked 1 to n
    if (standings.length !== teams.length || new Set(standings.map(row => row.teamId)).size !== teams.length ||
        standings.some((row, index) => row.rank !== index + 1)) throw invalid();
    return standings;
}
