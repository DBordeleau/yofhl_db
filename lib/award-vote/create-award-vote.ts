// The award vote module (GLOSSARY.md, "Award vote"): every rule of a season's award vote. Server actions and pages
// call its operations and hold no award vote rules of their own. Time comes from the clock port.
//
// Its interface so far; each operation lives in its own file and is assembled here:
//  - prepare (prepare.ts): build or rebuild a season's frozen candidate snapshot from Fantrax and the archive, in
//    bounded batches that resume from recorded progress
//  - readPreview (read-preview.ts): the admin's view of a season's award vote: its state, its ballot as owners will
//    see it, from the snapshot, and which franchises have submitted a ballot
//  - readRookieReview (read-rookie-review.ts): the Teemu Trophy's computed rookies, the young players the NHL
//    lookup could not match or failed to look up, and the admin's changes
//  - adjustRookie (adjust-rookie.ts): the admin adding a player to the rookies or removing one, before opening
//  - retryFailedLookups (retry-failed-lookups.ts): the admin looking the failed lookups up again, before opening
//  - openVoting (open-voting.ts): the admin opening a prepared award vote with its ballot lock
//  - moveBallotLock (move-ballot-lock.ts): the admin moving the ballot lock later while voting is open
//  - readOwnerBallot (read-owner-ballot.ts): the open ballot as a signed-in owner reads it, with their franchise's
//    own rankings and which franchises have submitted
//  - saveDraft (save-draft.ts) and submitBallot (submit-ballot.ts): an owner's ballot writes for their franchise,
//    until the ballot lock (ballot-write.ts)
//  - readBallotNudge (read-ballot-nudge.ts): whether the header nudges a franchise to cast its ballot
//  - scoreBallots (score-ballots.ts): the admin scoring the submitted ballots into each award's tally, once every
//    franchise has submitted or the ballot lock has passed
//  - readTallies (read-tallies.ts): the admin's read of a scored award vote's tallies
//  - readBallots (read-ballots.ts): the admin's read of every submitted ballot's rankings, once ballots stop changing
//  - reopenVoting (reopen-voting.ts): the admin reopening a scored award vote with a new ballot lock
//  - voidBallot and restoreBallot (void-ballot.ts): the admin throwing a submitted ballot out with a reason, and
//    counting it again, after the ballot lock and before publishing; a scored vote's tallies follow at once
//  - publish (publish.ts): the admin writing a scored award vote's winners into the awards archive, for good
//  - readPublishedTallies (read-published-tallies.ts) and readPublishedBallots (read-published-ballots.ts): what
//    visitors see once a vote is published, each award's tallies and each season's ballots; cached, and expired by
//    publishing. Never before publishing, never a rehearsal. The admin reads above are not for public use.
// A ballot's rules (its awards and depths, reading rankings, what makes it complete) are in ballot.ts; how ballots
// become tallies in tally.ts. Every operation past preparing refuses a rehearsal first (rehearsal.ts).
//
// Which seasons may have an award vote, and the rehearsal, is in rehearsal.ts. Who is a candidate for each award and which stats they show is in voted-awards.ts; the season's date ranges in
// season-dates.ts; listing a ballot award's candidates (top 50, sorting, search) in candidate-list.ts.
import { createAdjustRookie } from './adjust-rookie';
import { createReadBallotNudge } from './read-ballot-nudge';
import { createReadOwnerBallot } from './read-owner-ballot';
import { createSaveDraft } from './save-draft';
import { createSubmitBallot } from './submit-ballot';
import { createMoveBallotLock } from './move-ballot-lock';
import { createOpenVoting } from './open-voting';
import type { AwardVotePorts } from './ports';
import { createPrepare } from './prepare';
import { createReadPreview } from './read-preview';
import { createReadRookieReview } from './read-rookie-review';
import { createReopenVoting } from './reopen-voting';
import { createRetryFailedLookups } from './retry-failed-lookups';
import { createReadBallots } from './read-ballots';
import { createReadTallies } from './read-tallies';
import { createScoreBallots } from './score-ballots';
import { createRestoreBallot, createVoidBallot } from './void-ballot';
import { createPublish } from './publish';
import { createReadPublishedBallots } from './read-published-ballots';
import { createReadPublishedTallies } from './read-published-tallies';

export type { AwardVoteClock, AwardVoteDatabase, AwardVoteFantrax, AwardVoteLeagueInfo, AwardVoteNhl, AwardVoteOwnerSession, AwardVotePorts, AwardVoteRange, NhlLookupPlayer, NhlPlayerRecord } from './ports';
export type { AdjustRookieInput, AdjustRookieRejection, AdjustRookieResult } from './adjust-rookie';
export type { BallotProblem, OwnerBallotAward, RankedAward } from './ballot';
export type { BallotStatus } from './ballot-status';
export type { BallotWriteRejection } from './ballot-write';
export type { BallotNudge, ReadBallotNudgeInput } from './read-ballot-nudge';
export type { OwnBallot, OwnerBallotView, ReadOwnerBallotInput } from './read-owner-ballot';
export type { SaveDraftInput, SaveDraftRejection, SaveDraftResult } from './save-draft';
export type { SubmitBallotInput, SubmitBallotRejection, SubmitBallotResult } from './submit-ballot';
export type { AwardVoteState, BallotAward, BallotRankings, CreditedTeam, PlayerAwardId, PlayerCandidate, StatLine, StatSetName } from './model';
export type { MoveBallotLockInput, MoveBallotLockRejection, MoveBallotLockResult } from './move-ballot-lock';
export type { OpenVotingInput, OpenVotingRejection, OpenVotingResult } from './open-voting';
export type { PrepareInput, PrepareRejection, PrepareResult } from './prepare';
export type { AwardVotePreview, AwardVoteSummary, ReadPreviewInput } from './read-preview';
export type { ReadRookieReviewInput, RookieReview, RookieReviewPlayer } from './read-rookie-review';
export type { AdminBallot, ReadBallotsInput, ReadBallotsRejection, ReadBallotsResult } from './read-ballots';
export type { AwardTally, ReadTalliesInput, ReadTalliesRejection, ReadTalliesResult, TallyLine } from './read-tallies';
export type { ReopenVotingInput, ReopenVotingRejection, ReopenVotingResult } from './reopen-voting';
export type { ScoreBallotsInput, ScoreBallotsRejection, ScoreBallotsResult } from './score-ballots';
export type { RestoreBallotInput, RestoreBallotRejection, RestoreBallotResult, VoidBallotInput, VoidBallotRejection, VoidBallotResult } from './void-ballot';
export type { PublishInput, PublishRejection, PublishResult } from './publish';
export type { PublicBallot, PublicBallotAward, PublicRankedPlayer, ReadPublishedBallotsInput, ReadPublishedBallotsRejection, ReadPublishedBallotsResult } from './read-published-ballots';
export type { PublishedTally, ReadPublishedTalliesInput } from './read-published-tallies';
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
        openVoting: createOpenVoting(ports),
        moveBallotLock: createMoveBallotLock(ports),
        readOwnerBallot: createReadOwnerBallot(ports),
        saveDraft: createSaveDraft(ports),
        submitBallot: createSubmitBallot(ports),
        readBallotNudge: createReadBallotNudge(ports),
        scoreBallots: createScoreBallots(ports),
        readTallies: createReadTallies(ports),
        readBallots: createReadBallots(ports),
        reopenVoting: createReopenVoting(ports),
        voidBallot: createVoidBallot(ports),
        restoreBallot: createRestoreBallot(ports),
        publish: createPublish(ports),
        readPublishedTallies: createReadPublishedTallies(ports),
        readPublishedBallots: createReadPublishedBallots(ports),
    };
}

export type AwardVote = ReturnType<typeof createAwardVote>;
