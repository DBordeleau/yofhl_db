// Refreshing the archive: the admin's recovery when publishing wrote the winners but a view refresh failed after the
// commit (docs/adr/0002). Publishing can't be repeated, so this re-runs what publishing does once the winners are
// written: refresh the awards archive's views and expire its pages, the award pages' tallies and the season's ballots
// page (the 'awardVotePublished' curated edit's effects). Only for a published award vote; refused for a rehearsal
// (rehearsal.ts). Safe to run any number of times.
import { sql } from 'drizzle-orm';
import { refreshPublishedWinners } from '@/lib/data/curated-edits';
import type { AwardVotePorts } from './ports';
import { publishedVote } from './published-vote';
import { rehearsalRefusal, type RehearsalRefusal } from './rehearsal';

export interface RefreshArchiveInput {
    seasonYear: number;
}

export type RefreshArchiveRejection = RehearsalRefusal | 'not-published';

export type RefreshArchiveResult = { ok: true } | { ok: false; reason: RefreshArchiveRejection };

export function createRefreshArchive({ db }: AwardVotePorts) {
    return async function refreshArchive({ seasonYear }: RefreshArchiveInput): Promise<RefreshArchiveResult> {
        const rehearsal = await rehearsalRefusal(db, seasonYear);
        if (rehearsal) return { ok: false, reason: rehearsal };
        const [vote] = await db.rows<{ published: boolean }>(sql`
            select ${publishedVote} as published from league.award_votes v where v.season_year = ${seasonYear}`);
        if (!vote?.published) return { ok: false, reason: 'not-published' };
        await refreshPublishedWinners(seasonYear);
        return { ok: true };
    };
}
