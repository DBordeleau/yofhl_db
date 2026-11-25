// Fantrax's website goalie table: every NHL goalie's regular-season games played, season to date, read page by
// page with the same checks as the skater table. The season sync reads the live season's games played from it,
// and the games-played export (scripts/export-games-played.ts) read 2019–2026's.
import type { Fetcher } from './leaders';
import { loadPositionTable } from './position-table';

export interface TableGoalie {
    /** bare Fantrax player ID */
    id: string;
    /** the NHL regular-season games the goalie has appeared in (GLOSSARY.md), 0 for none */
    gamesPlayed: number;
}

export interface GoalieTable {
    /** the Fantrax code of the season the table is for */
    seasonCode: string;
    /** every goalie in the table, in its order */
    goalies: TableGoalie[];
}

export async function loadGoalieTable(leagueId: string, seasonYear: number, options: {
    fetcher?: Fetcher;
    /** each page's raw response, as Fantrax sent it */
    onPage?: (raw: unknown, page: number) => unknown;
} = {}): Promise<GoalieTable> {
    const { seasonCode, rows } = await loadPositionTable(leagueId, seasonYear, 'HOCKEY_GOALIE',
        page => page.rows.map(({ id, gamesPlayed }) => ({ id, gamesPlayed })), options);
    return { seasonCode, goalies: rows };
}
