// A past season's Pick'em, read from Pick'em's own record alone (ADR 0005): its recorded weeks and their frozen
// results, and its entries shown with their franchises' season identities.
import { sql } from 'drizzle-orm';
import { leagueTags } from '@/lib/data/cache-tags';
import { cached, rows } from '@/lib/data/db';
import { countedPairings, frozenScore, type CountedWeek, type PickemEntry } from './locked-week';
import type { PickemFranchise } from './model';
import type { RecordedWeek } from './recorded-weeks';

// Every franchise with its season identity and that season's owner. A season not imported yet has no team seasons,
// so its franchises fall back to their current identity and owner.
const seasonEntriesQuery = (seasonYear: number) => sql`
    select c.id,
           case when s.team_season_id is null then c.name else s.name end as name,
           case when s.team_season_id is null then c.abbreviation else s.abbreviation end as abbreviation,
           case when s.team_season_id is null then c.logo else s.logo end as logo,
           case when s.team_season_id is null then co.name else so.name end as owner
    from league.current_teams c
    left join league.season_teams s on s.franchise_id = c.id and s.season_year = ${seasonYear}::int
    left join league.team_seasons st on st.id = s.team_season_id
    left join league.owners so on so.id = st.owner_id
    left join league.team_seasons ct on ct.id = c.latest_team_season_id
    left join league.owners co on co.id = ct.owner_id`;

const readSeasonTeams = cached(async (seasonYear: number) => rows<PickemFranchise & { owner: string | null }>(seasonEntriesQuery(seasonYear)),
    'pickem-season-entries', [leagueTags.franchiseCards]);

/**
 * A past season's entries, by franchise. Cached: the season import expires every league read, and a branding edit
 * (which a season not imported yet falls back to) expires it with the franchise cards.
 */
export async function readSeasonEntries(seasonYear: number): Promise<Map<number, PickemEntry>> {
    const found = await readSeasonTeams(seasonYear);
    return new Map(found.map(({ owner, ...franchise }) => [franchise.id, { franchise, owner }]));
}

/** A past season's week as Pick'em names it: the live season's names are gone with it */
export const pastWeekName = (week: number) => `Week ${week}`;

/** A recorded week as it is scored from the record alone: its frozen results and scores, or none while it is not frozen */
export function recordedWeek(seasonYear: number, recorded: RecordedWeek, entries: Map<number, PickemEntry>): CountedWeek {
    const winners = recorded.frozen ? recorded.pairings.map(pairing => pairing.winner) : null;
    const scores = recorded.frozen ? recorded.pairings.map(frozenScore) : null;
    return { seasonYear, week: recorded.week, name: pastWeekName(recorded.week), lock: recorded.lock, ...countedPairings(recorded.pairings, entries, winners, scores) };
}
