// Publishing: the admin writing a scored award vote's winners into the awards archive, once and for good. Each
// voted award's place-one candidates in its tally (several when level) become that season's winners, each credited to
// the team season the frozen snapshot credits them to, through the curated edit that the awards archive's pages are
// refreshed and expired by (lib/data/curated-edits.ts). The vote becomes published in the same statement.
//
// Publishing is refused while the award vote has no tally at all (no ballot counted when it was scored): it would write
// no winners and still close the hand-entry awards editor for the season, for good. An award with no tally in a vote
// that has others is published without winners, keeping any hand-entered ones (an award with no candidates is left off
// the ballot).
//
// After publishing nothing changes the season's award vote again: every other write requires an earlier state
// (prepare, rookie changes and retrying lookups prepared; opening prepared; the ballot lock, ballots and scoring open;
// reopening scored), voiding and restoring refuse a published vote, and the hand-entry awards editor refuses the season. There is no un-publishing. Refused for a
// rehearsal (rehearsal.ts).
//
// Awards are keyed by catalogue ID (lib/awards.ts) here and in the archive alike (docs/adr/0009-awards-are-catalogue-ids.md).
import { sql } from 'drizzle-orm';
import { savePublishedWinners } from '@/lib/data/curated-edits';
import type { AwardVoteState } from './model';
import { rankedPlayerName } from './ballot-snapshot';
import type { AwardVotePorts } from './ports';
import { rehearsalRefusal, type RehearsalRefusal } from './rehearsal';

export interface PublishInput {
    seasonYear: number;
}

export type PublishRejection = RehearsalRefusal
    /** not scored: never opened, open again, or already published */
    | 'not-scored'
    /** scored with no ballot counting, so no award has a tally */
    | 'no-tally';

export type PublishResult = { ok: true } | { ok: false; reason: PublishRejection };

/** the season's place-one tally lines as `winner` */
const placeOne = (seasonYear: number) => sql`(
    select t.season_year, t.award, t.player_id
    from league.award_vote_tallies t
    where t.season_year = ${seasonYear} and t.place = 1) as winner`;

/** whether the season's award vote has any tally line */
const anyTally = (seasonYear: number) => sql`exists (select 1 from league.award_vote_tallies t where t.season_year = ${seasonYear})`;

export function createPublish({ db }: AwardVotePorts) {
    async function refusal(seasonYear: number): Promise<Exclude<PublishResult, { ok: true }> | null> {
        const [vote] = await db.rows<{ state: AwardVoteState }>(sql`select state from league.award_votes where season_year = ${seasonYear}`);
        if (!vote || vote.state !== 'scored') return { ok: false, reason: 'not-scored' };
        const [{ tallied }] = await db.rows<{ tallied: boolean }>(sql`select ${anyTally(seasonYear)} as tallied`);
        return tallied ? null : { ok: false, reason: 'no-tally' };
    }

    return async function publish({ seasonYear }: PublishInput): Promise<PublishResult> {
        const rehearsal = await rehearsalRefusal(db, seasonYear);
        if (rehearsal) return { ok: false, reason: rehearsal };
        const refused = await refusal(seasonYear);
        if (refused) return refused;

        const { published } = await savePublishedWinners(seasonYear, {
            gate: sql`update league.award_votes set state = 'published', published_at = clock_timestamp(), updated_at = now()
                      where season_year = ${seasonYear} and state = 'scored' and not rehearsal and ${anyTally(seasonYear)}
                      returning season_year`,
            // the snapshot names every ranked player and credits each candidate's team season
            winners: sql`select winner.award, winner.player_id, ${rankedPlayerName(sql`winner.season_year`, sql`winner.player_id`)} as name,
                                c.team_season_id
                         from ${placeOne(seasonYear)}
                         left join league.award_vote_candidates c
                                on c.season_year = winner.season_year and c.award = winner.award and c.player_id = winner.player_id`,
        });
        if (published) return { ok: true };
        return (await refusal(seasonYear)) ?? { ok: false, reason: 'not-scored' };
    };
}
