// The award vote module (GLOSSARY.md, "Award vote"): every rule of a season's award vote. Server actions and pages
// call its operations and hold no award vote rules of their own. Time comes from the clock port.
//
// Its interface so far; each operation lives in its own file and is assembled here:
//  - prepare (prepare.ts): build or rebuild a season's frozen candidate snapshot from Fantrax and the archive, in
//    bounded batches that resume from recorded progress
//  - readPreview (read-preview.ts): a season's award vote and its ballot as owners will see it, from the snapshot
//  - readRookieReview (read-rookie-review.ts): the Teemu Trophy's computed rookies, the young players the NHL
//    lookup could not match or failed to look up, and the admin's changes
//  - adjustRookie (adjust-rookie.ts): the admin adding a player to the rookies or removing one, before opening
//  - retryFailedLookups (retry-failed-lookups.ts): the admin looking the failed lookups up again, before opening
// Opening, ballots, scoring and publishing come later; each must refuse a rehearsal first (rehearsal.ts).
//
// Which seasons may have an award vote, and the rehearsal, is in rehearsal.ts. Who is a candidate for each award and which stats they show is in voted-awards.ts; the season's date ranges in
// season-dates.ts; listing a ballot award's candidates (top 50, sorting, search) in candidate-list.ts.
import { createAdjustRookie } from './adjust-rookie';
import type { AwardVotePorts } from './ports';
import { createPrepare } from './prepare';
import { createReadPreview } from './read-preview';
import { createReadRookieReview } from './read-rookie-review';
import { createRetryFailedLookups } from './retry-failed-lookups';

export type { AwardVoteClock, AwardVoteDatabase, AwardVoteFantrax, AwardVoteLeagueInfo, AwardVoteNhl, AwardVotePorts, AwardVoteRange, NhlLookupPlayer, NhlPlayerRecord } from './ports';
export type { AdjustRookieInput, AdjustRookieRejection, AdjustRookieResult } from './adjust-rookie';
export type { AwardVoteState, BallotAward, CreditedTeam, PlayerAwardId, PlayerCandidate, StatLine, StatSetName } from './model';
export type { PrepareInput, PrepareRejection, PrepareResult } from './prepare';
export type { AwardVotePreview, AwardVoteSummary, ReadPreviewInput } from './read-preview';
export type { ReadRookieReviewInput, RookieReview, RookieReviewPlayer } from './read-rookie-review';
export type { RetryFailedLookupsInput, RetryFailedLookupsRejection, RetryFailedLookupsResult } from './retry-failed-lookups';
export type { SeasonDates } from './season-dates';
export type { AwardVoteKind, RehearsalRefusal } from './rehearsal';

export function createAwardVote(ports: AwardVotePorts) {
    return {
        prepare: createPrepare(ports),
        readPreview: createReadPreview(ports),
        readRookieReview: createReadRookieReview(ports),
        adjustRookie: createAdjustRookie(ports),
        retryFailedLookups: createRetryFailedLookups(ports),
    };
}

export type AwardVote = ReturnType<typeof createAwardVote>;
