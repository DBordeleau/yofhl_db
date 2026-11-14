// Fantrax's website player stats table for the league's scoring, season to date: the same undocumented call the
// home page's scoring leaders use, read so that it covers every player who scored or is rostered without paging
// through all 8,000-odd NHL players. Signed out, Fantrax ignores a reversed sort and always lists fantasy points
// descending with negative totals last, so three reads cover the kept set: the table from the top until the
// first total that isn't positive, the table from the bottom until the first that isn't negative, and every
// rostered player.
import { globalFetch, loadStatsTable, numericStat, type StatsTableRequest } from './leaders';

export interface TablePlayer {
    /** bare Fantrax player ID */
    id: string;
    name: string;
    positions: string[];
    /** null when Fantrax lists no NHL team */
    nhlTeam: string | null;
    /** the Fantrax team the player is rostered on, or null for a free agent (a player on waivers included) */
    teamId: string | null;
    points: number;
    perGame: number | null;
}

type StatsPage = Awaited<ReturnType<typeof loadStatsTable>>;

const PAGE = 1000;
const invalid = (what: string) => new Error(`Fantrax returned an incomplete or unexpected player stats table (${what})`);

function tablePlayers(data: StatsPage, rostered: boolean): TablePlayer[] {
    const column = (key: string) => data.tableHeader.cells.findIndex(cell => cell.key === key);
    const [points, perGame, status] = [column('fpts'), column('fptsPerGame'), column('status')];
    if (points < 0 || perGame < 0 || status < 0) throw new Error('Fantrax scoring columns are missing');
    return data.statsTable.map(row => {
        const player = row.scorer;
        const team = row.cells?.[status];
        if (typeof player?.scorerId !== 'string' || !player.scorerId || typeof player.name !== 'string' || !player.name ||
            typeof player.posShortNames !== 'string' || typeof player.teamShortName !== 'string' || !team ||
            (team.teamId != null && typeof team.teamId !== 'string') || (rostered && !team.teamId)) throw new Error('Fantrax player is invalid');
        return {
            id: player.scorerId,
            name: player.name,
            positions: player.posShortNames.split(',').map(position => position.trim()).filter(Boolean),
            nhlTeam: player.teamShortName && player.teamShortName !== '(N/A)' ? player.teamShortName : null,
            teamId: team.teamId || null,
            points: numericStat(row.cells?.[points]?.content) ?? 0,
            perGame: numericStat(row.cells?.[perGame]?.content),
        };
    });
}

const leading = <T>(items: T[], keep: (item: T) => boolean) => {
    const end = items.findIndex(item => !keep(item));
    return end < 0 ? items : items.slice(0, end);
};

// shortcut: Fantrax's website stats endpoint is undocumented; replace it when a supported player-stats API is available.
export async function loadPlayerTable(leagueId: string, seasonYear: number, fetcher = globalFetch): Promise<TablePlayer[]> {
    const read = (request: StatsTableRequest, seasonCode?: string) => loadStatsTable(leagueId, seasonYear, request, seasonCode, fetcher);
    // shortcut: one page covers this league's rosters; add pagination if they ever exceed 1,000 players.
    const rostered = await read({ filter: 'ALL_TAKEN', page: 1, limit: PAGE, whole: true });
    const seasonCode = rostered.displayedSeasonOrProjection.code;

    const pages = new Map<number, TablePlayer[]>();
    let total: number | undefined;
    async function page(number: number) {
        const known = pages.get(number);
        if (known) return known;
        const data = await read({ filter: 'ALL', page: number, limit: PAGE }, seasonCode);
        total ??= data.paginatedResultSet.totalNumResults;
        if (data.paginatedResultSet.totalNumResults !== total) throw invalid('the table changed between pages');
        if (total === 0) throw invalid('no players');
        const players = tablePlayers(data, false);
        if (players.some((player, index) => index > 0 && player.points > players[index - 1].points)) throw new Error('Fantrax returned a player stats table out of fantasy points order');
        pages.set(number, players);
        return players;
    }

    const found = new Map<string, TablePlayer>();
    const add = (players: TablePlayer[]) => players.forEach(player => { if (!found.has(player.id)) found.set(player.id, player); });

    // the scorers, from the top until the first total that isn't positive
    let lowest = Infinity;
    for (let number = 1; ; number++) {
        const players = await page(number);
        if (players.length && players[0].points > lowest) throw new Error('Fantrax returned a player stats table out of fantasy points order');
        lowest = players.at(-1)?.points ?? lowest;
        const scored = leading(players, player => player.points > 0);
        add(scored);
        if (scored.length < players.length || number * PAGE >= total!) break;
    }
    // negative totals, from the bottom until the first that isn't negative
    for (let number = Math.ceil(total! / PAGE); number >= 1; number--) {
        const players = await page(number);
        const negative = leading([...players].reverse(), player => player.points < 0);
        add(negative.reverse());
        if (negative.length < players.length) break;
    }
    add(tablePlayers(rostered, true));
    return [...found.values()];
}
