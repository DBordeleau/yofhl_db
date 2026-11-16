// Publishing: the admin writing a scored award vote's winners into the awards archive, once and for good. Each
// voted award's place-one candidates in its tally (several when level) become that season's winners, each credited to
// the team season the frozen snapshot credits them to, through the curated edit that the awards archive's pages are
// refreshed and expired by (lib/data/curated-edits.ts). The vote becomes published in the same statement.
//
// After publishing nothing changes the season's award vote again: every other write requires an earlier state
// (prepare, rookie changes and retrying lookups prepared; opening prepared; the ballot lock, ballots and scoring open;
// reopening scored), and the hand-entry awards editor refuses the season. There is no un-publishing. Refused for a
// rehearsal (rehearsal.ts).
//
// Awards are keyed by catalogue ID here (lib/awards.ts) and by award type in the archive, matched by the catalogue
// name. An award type the archive is missing would lose its winners, so publishing is refused until it is added.
import { sql } from 'drizzle-orm';
import { savePublishedWinners } from '@/lib/data/curated-edits';
import { PLAYER_AWARD_IDS, type AwardVoteState } from './model';
import type { AwardVotePorts } from './ports';
import { rehearsalRefusal, type RehearsalRefusal } from './rehearsal';
import { awardDefinition } from './voted-awards';

export interface PublishInput {
    seasonYear: number;
}

export type PublishRejection = RehearsalRefusal
    /** not scored: never opened, open again, or already published */
    | 'not-scored';

export type PublishResult = { ok: true }
    | { ok: false; reason: PublishRejection }
    /** the archive has no award type by these catalogue names, for awards that have a winner */
    | { ok: false; reason: 'missing-award-type'; awardTypes: string[] };

/** each voted award's catalogue ID and the archive's name for it */
const archiveNames = () => sql`(values ${sql.join(PLAYER_AWARD_IDS.map(award => sql`(${award}::text, ${awardDefinition(award).name}::text)`), sql`, `)})
    as names (award, name)`;

/** the season's place-one tally lines as `winner`, with the archive's award type for each, or null where it has none */
const placeOne = (seasonYear: number) => sql`(
    select t.season_year, t.award, t.player_id, names.name as award_name, ty.id as award_type_id
    from league.award_vote_tallies t
    join ${archiveNames()} on names.award = t.award
    left join league.award_types ty on ty.name = names.name
    where t.season_year = ${seasonYear} and t.place = 1) as winner`;

export function createPublish({ db }: AwardVotePorts) {
    async function refusal(seasonYear: number): Promise<Exclude<PublishResult, { ok: true }> | null> {
        const [vote] = await db.rows<{ state: AwardVoteState }>(sql`select state from league.award_votes where season_year = ${seasonYear}`);
        if (!vote || vote.state !== 'scored') return { ok: false, reason: 'not-scored' };
        const missing = await db.rows<{ name: string }>(sql`select distinct winner.award_name as name from ${placeOne(seasonYear)} where winner.award_type_id is null order by 1`);
        return missing.length ? { ok: false, reason: 'missing-award-type', awardTypes: missing.map(row => row.name) } : null;
    }

    return async function publish({ seasonYear }: PublishInput): Promise<PublishResult> {
        const rehearsal = await rehearsalRefusal(db, seasonYear);
        if (rehearsal) return { ok: false, reason: rehearsal };
        const refused = await refusal(seasonYear);
        if (refused) return refused;

        const { published } = await savePublishedWinners(seasonYear, {
            gate: sql`update league.award_votes set state = 'published', published_at = clock_timestamp(), updated_at = now()
                      where season_year = ${seasonYear} and state = 'scored' and not rehearsal
                        and not exists (select 1 from ${placeOne(seasonYear)} where winner.award_type_id is null)
                      returning season_year`,
            // the snapshot names every ranked player and credits each candidate's team season
            winners: sql`select winner.award_type_id, winner.player_id, coalesce(p.name, winner.player_id) as name, c.team_season_id
                         from ${placeOne(seasonYear)}
                         left join league.award_vote_players p on p.season_year = winner.season_year and p.player_id = winner.player_id
                         left join league.award_vote_candidates c
                                on c.season_year = winner.season_year and c.award = winner.award and c.player_id = winner.player_id`,
        });
        if (published) return { ok: true };
        return (await refusal(seasonYear)) ?? { ok: false, reason: 'not-scored' };
    };
}
