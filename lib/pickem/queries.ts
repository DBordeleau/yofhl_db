import { sql } from 'drizzle-orm';
import type { MatchupPair } from './model';

interface PickemPickTarget {
    seasonYear: number;
    week: number;
    entryFranchiseId: number;
    uid: string;
    matchup: MatchupPair;
    /** ISO timestamp */
    lock: string;
}

// Every write is one statement (ADR 0002) that rechecks, against the database clock, that the owner manages the
// entry's franchise, that it has not folded and that the week has not locked: neither its lock has passed nor
// settle has recorded it (a recorded week stays locked even if Fantrax later moves its start). It returns no row
// when the owner no longer manages the franchise, and `open: false` once the week has locked. `changed` says whether the entry's picked
// matchups changed (a new pick, or a pick cleared) rather than only the side picked, which is what who's in reads.
const entry = (target: PickemPickTarget) => sql`entry as (
    select f.id, clock_timestamp() < ${target.lock}::timestamptz
               and not exists (select 1 from league.pickem_weeks w where w.season_year = ${target.seasonYear}::int and w.week = ${target.week}::int) as open
    from league.franchises f join league.team_management m on m.franchise_id = f.id
    where f.id = ${target.entryFranchiseId}::int and f.folded_after_season is null and m.owner_uid = ${target.uid}
)`;

export const savePickemPickQuery = (target: PickemPickTarget, picked: number) => sql`
    with ${entry(target)},
    saved as (
        insert into league.pickem_picks (season_year, week, entry_franchise_id, low_franchise_id, high_franchise_id, picked_franchise_id)
        select ${target.seasonYear}::int, ${target.week}::int, entry.id, ${target.matchup[0]}::int, ${target.matchup[1]}::int, ${picked}::int
        from entry where entry.open
        on conflict (season_year, week, entry_franchise_id, low_franchise_id, high_franchise_id)
        do update set picked_franchise_id = excluded.picked_franchise_id, saved_at = clock_timestamp()
        returning xmax = 0 as inserted
    )
    select open, exists (select 1 from saved where inserted) as changed from entry`;

export const clearPickemPickQuery = (target: PickemPickTarget) => sql`
    with ${entry(target)},
    cleared as (
        delete from league.pickem_picks p using entry
        where entry.open and p.season_year = ${target.seasonYear}::int and p.week = ${target.week}::int
          and p.entry_franchise_id = entry.id
          and p.low_franchise_id = ${target.matchup[0]}::int and p.high_franchise_id = ${target.matchup[1]}::int
        returning 1
    )
    select open, exists (select 1 from cleared) as changed from entry`;

/** One entry's Pick'em picks for a week, whatever pairings they were made against */
export const entryPicksQuery = (seasonYear: number, week: number, entryFranchiseId: number) => sql`
    select low_franchise_id as low, high_franchise_id as high, picked_franchise_id as picked
    from league.pickem_picks
    where season_year = ${seasonYear}::int and week = ${week}::int and entry_franchise_id = ${entryFranchiseId}::int
    order by low_franchise_id, high_franchise_id`;
