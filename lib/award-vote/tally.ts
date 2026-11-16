// Each individual voted award's tally (GLOSSARY.md, "Tally"), computed in the database from a season's ballots:
// only submitted ballots that are not void count, and a draft never does. Each rank is worth its points from
// PLAYER_AWARD_POINTS (an award ranked fewer than five deep uses the first ones). Places are ordered by points, then
// first-place votes, then second-place votes and so on through the award's depth; candidates level on all of them
// share a place, the next place skipping as many as share it, and several at place one are all winners.
//
// Only scoring, and voiding or restoring a ballot in a scored award vote (void-ballot.ts), write tallies, through
// `replaceTallies`, as part of the one statement that also changes the award vote or the ballot, so the tallies and
// what they are computed from change together.
import { sql, type SQL } from 'drizzle-orm';
import { PLAYER_AWARD_POINTS } from './model';

/**
 * Locks the season's award vote row until the transaction ends. Scoring, voiding and restoring run it before their
 * statement, in the same writeInOrder(), so that statement's snapshot is taken only once the lock is held: under READ
 * COMMITTED each statement sees what was committed before it began, and a lock taken inside a statement doesn't change
 * what the rest of it reads. So each reads the ballots and tallies as any other of them, a ballot write
 * (ballot-write.ts) or publishing that held the row left them, and a ballot write waiting on the lock rechecks the
 * state it leaves.
 *
 * Publishing is one statement (docs/adr/0002), so its snapshot is taken before it waits: publishing that starts while
 * a void or restore holds the lock still reads the tallies from before it.
 */
export const lockAwardVote = (seasonYear: number) => sql`select 1 from league.award_votes where season_year = ${seasonYear}::int for update`;

/** the ballots (`b`) that count: submitted, and not void. A draft never counts */
export const countedBallot = sql`b.submitted is not null and b.void_reason is null`;

const POINTS = sql.raw(`array[${PLAYER_AWARD_POINTS.join(', ')}]::int[]`);

/**
 * CTEs (to follow `with gate as (...)`, comma included by the caller) that replace `seasonYear`'s tallies with those
 * computed from its counting ballots, only when the CTE named `gate` returns a row. The new rows are upserted and the
 * rows no longer ranked deleted, so the two parts touch disjoint rows (docs/adr/0002).
 *
 * `counts` says which submitted ballots (`b`) count, by default `countedBallot`. Every part of a statement reads the
 * ballots as they were before it, so a statement that voids or restores a ballot passes the condition as it leaves
 * them.
 */
export function replaceTallies(seasonYear: number, gate: SQL, counts: SQL = countedBallot): SQL {
    return sql`
        tally_ranks as (
            select a.key as award, r.player_id, r.rank::int as rank
            from league.award_vote_ballots b
            cross join lateral jsonb_each(b.submitted) a
            cross join lateral jsonb_array_elements_text(a.value) with ordinality r(player_id, rank)
            where b.season_year = ${seasonYear}::int and b.submitted is not null and (${counts}) and r.player_id is not null
        ),
        tally_lines as (
            select c.award, c.player_id,
                   (select sum((${POINTS})[r.rank]) from tally_ranks r where r.award = c.award and r.player_id = c.player_id)::int as points,
                   array(select count(r.rank)::int
                         from generate_series(1, (select max(d.rank) from tally_ranks d where d.award = c.award)) g(rank)
                         left join tally_ranks r on r.award = c.award and r.player_id = c.player_id and r.rank = g.rank
                         group by g.rank order by g.rank) as votes
            from (select distinct award, player_id from tally_ranks) c
        ),
        tally_placed as (
            select award, player_id, points, votes, rank() over (partition by award order by points desc, votes desc) as place
            from tally_lines
        ),
        tally_written as (
            insert into league.award_vote_tallies (season_year, award, player_id, points, votes, place)
            select ${seasonYear}::int, award, player_id, points, votes, place from tally_placed
            where exists (select 1 from ${gate})
            on conflict (season_year, award, player_id) do update set points = excluded.points, votes = excluded.votes, place = excluded.place
        ),
        tally_cleared as (
            delete from league.award_vote_tallies t
            where t.season_year = ${seasonYear}::int and exists (select 1 from ${gate})
              and not exists (select 1 from tally_placed p where p.award = t.award and p.player_id = t.player_id)
        )`;
}
