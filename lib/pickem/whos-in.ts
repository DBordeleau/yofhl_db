// Who's in for the next week to lock (GLOSSARY.md, "Pick'em"): every active franchise, and whether its entry has a
// Pick'em pick on every matchup of the week. It says nothing about which side anyone picked.
import { sql } from 'drizzle-orm';
import { leagueTags } from '@/lib/data/cache-tags';
import { cached, rows } from '@/lib/data/db';
import { pairOfMatchup, samePair, type LivePickemWeek, type MatchupPair, type PickemFranchise } from './model';
import { pickemSeasonTag } from './recorded-weeks';

/** Expires a week's cached who's-in list: a save or clear that changes which matchups an entry has picked expires it */
export const pickemWhosInTag = (seasonYear: number, week: number) => `pickem-whos-in-${seasonYear}-${week}`;

/** One active franchise on the who's-in list */
export interface PickemWhoIsIn {
    /** the franchise's current identity */
    franchise: PickemFranchise;
    /** the owner's name the site shows for the franchise, or null when it has none */
    owner: string | null;
    /** whether the entry has a Pick'em pick on every matchup of the week */
    in: boolean;
}

// Every active franchise with its current identity and owner, and the pairs its entry has picked that week. Only
// the pairs leave the database, never the franchise picked.
const whosInQuery = (seasonYear: number, week: number) => sql`
    select c.id, c.name, c.abbreviation, c.logo, o.name as owner,
           coalesce((select json_agg(json_build_array(p.low_franchise_id, p.high_franchise_id))
                     from league.pickem_picks p
                     where p.season_year = ${seasonYear}::int and p.week = ${week}::int and p.entry_franchise_id = c.id), '[]') as pairs
    from league.current_teams c
    left join league.team_seasons t on t.id = c.latest_team_season_id
    left join league.owners o on o.id = t.owner_id
    where not c.defunct
    order by c.name, c.id`;

// Cached until a save or clear changes the pairs some entry has picked that week. It reads current identities and
// owners too, so a team's branding edit expires it with the franchise cards.
const readPickedPairs = cached(async (seasonYear: number, week: number) =>
    rows<PickemFranchise & { owner: string | null; pairs: MatchupPair[] }>(whosInQuery(seasonYear, week)),
'pickem-whos-in', (seasonYear, week) => [pickemSeasonTag(seasonYear), pickemWhosInTag(seasonYear, week), leagueTags.franchiseCards]);

/** The who's-in list for `week`; a pick on a pair that no longer meets that week does not count */
export async function readWhosIn(week: LivePickemWeek): Promise<PickemWhoIsIn[]> {
    const found = await readPickedPairs(week.seasonYear, week.week);
    const pairs = week.matchups.map(pairOfMatchup);
    return found.map(({ owner, pairs: picked, ...franchise }) => ({
        franchise, owner,
        in: pairs.length > 0 && pairs.every(pair => picked.some(item => samePair(pair, item))),
    }));
}
