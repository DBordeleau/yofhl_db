// Keeper enrichment: each rostered player's age and previous NHL season from the NHL module (lib/nhl/), and their
// previous fantasy season from the archive. NHL answers are kept for a day across owners and visits; an unmatched
// player or an NHL failure is shown as unavailable and never stops the roster loading or keeper choices.
import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';
import { cached, rows } from '@/lib/data/db';
import { splitPositions } from '@/lib/league';
import { createNhl } from '@/lib/nhl/create-nhl';
import { ageOn, type Nhl, type NhlIdentity, type NhlPlayer } from '@/lib/nhl/model';
import { KEEPER_SEASON, type KeeperPlayer, type PlayerDetails } from './model';

const PREVIOUS_SEASON = KEEPER_SEASON - 1;
const DAY = 86400;
/** how many players are looked up at once */
const BATCH = 6;

type NhlDetails = Pick<PlayerDetails, 'nhlId' | 'birthDate' | 'previousSeason' | 'stats' | 'checkedAt'>;

/** the previous season's line as the keeper page shows it; no line in a known season history is no NHL games */
function previousSeasonDetails(player: NhlPlayer, checkedAt: string): NhlDetails {
    const line = player.seasons?.[PREVIOUS_SEASON];
    const stats = !player.seasons ? null : !line
        ? { games: 0, goals: null, assists: null, points: null, wins: null, gaa: null, savePct: null }
        : { games: line.games, goals: line.goals, assists: line.assists, points: line.points, wins: line.wins,
            gaa: line.goalsAgainstAverage, savePct: line.savePercentage };
    return { nhlId: player.nhlId, birthDate: player.birthDate, previousSeason: PREVIOUS_SEASON, stats, checkedAt };
}

const previousFantasyStats = cached(() => rows<{ id: string; points: number; perGame: number }>(sql`
    select player_id as id, fpts::float8 as points, fpg::float8 as "perGame"
    from league.player_seasons where season_year = ${PREVIOUS_SEASON}`), `keeper-previous-fantasy-stats-${PREVIOUS_SEASON}`);

/** `YYYY-MM-DD` in Toronto */
const torontoDate = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

/** keeper enrichment over this NHL, its answers kept for a day */
export function keeperEnrichment(nhl: Nhl, now: () => Date = () => new Date()) {
    const identify = unstable_cache((name: string, playerId: string, positions: string[], nhlTeam: string) =>
        nhl.identify({ name, playerId, positions, nhlTeam }), ['keeper-nhl-identities-v2'], { revalidate: DAY });
    const details = unstable_cache(async (nhlId: NhlIdentity) => previousSeasonDetails(await nhl.player(nhlId), now().toISOString()),
        ['keeper-nhl-profiles-v2', String(KEEPER_SEASON)], { revalidate: DAY });

    return async function enrich(roster: KeeperPlayer[]): Promise<KeeperPlayer[]> {
        const fantasy = new Map((await previousFantasyStats()).map(row => [row.id, row]));
        const today = torontoDate(now());
        const enriched: KeeperPlayer[] = [];
        for (let i = 0; i < roster.length; i += BATCH) {
            enriched.push(...await Promise.all(roster.slice(i, i + BATCH).map(async player => {
                let found: NhlDetails | null = null;
                try {
                    const nhlId = await identify(player.name, player.id, splitPositions(player.position), player.nhlTeam);
                    if (nhlId !== null) found = await details(nhlId);
                } catch { /* Missing data is shown as unavailable; keeper choices still work. */ }
                const archived = fantasy.get(player.id);
                const shown: PlayerDetails = {
                    nhlId: null, birthDate: null, previousSeason: PREVIOUS_SEASON, stats: null, checkedAt: null,
                    ...found, age: ageOn(found?.birthDate ?? null, today),
                    fantasyPoints: archived?.points ?? null, fantasyPerGame: archived?.perGame ?? null,
                };
                return { ...player, details: shown };
            })));
        }
        return enriched;
    };
}

export const enrichKeeperRoster = keeperEnrichment(createNhl());
