// The award vote module (GLOSSARY.md, "Award vote"): every rule of a season's award vote. Server actions and pages
// call its operations and hold no award vote rules of their own. Time comes from the clock port.
//
// Its interface so far; each operation lives in its own file and is assembled here:
//  - prepare (prepare.ts): build or rebuild a season's frozen candidate snapshot from Fantrax and the archive, in
//    bounded batches that resume from recorded progress
//  - readPreview (read-preview.ts): a season's award vote and its ballot as owners will see it, from the snapshot
// Opening, ballots, scoring and publishing come later.
//
// Who is a candidate for each award and which stats they show is in voted-awards.ts; the season's date ranges in
// season-dates.ts; listing a ballot award's candidates (top 50, sorting, search) in candidate-list.ts.
import type { AwardVotePorts } from './ports';
import { createPrepare } from './prepare';
import { createReadPreview } from './read-preview';

export type { AwardVoteClock, AwardVoteDatabase, AwardVoteFantrax, AwardVoteLeagueInfo, AwardVoteNhl, AwardVotePorts, AwardVoteRange, NhlLookupPlayer, NhlPlayerRecord } from './ports';
export type { AwardVoteState, BallotAward, CreditedTeam, PlayerAwardId, PlayerCandidate, StatLine, StatSetName } from './model';
export type { PrepareInput, PrepareRejection, PrepareResult } from './prepare';
export type { AwardVotePreview, AwardVoteSummary, ReadPreviewInput } from './read-preview';
export type { SeasonDates } from './season-dates';

export function createAwardVote(ports: AwardVotePorts) {
    return {
        prepare: createPrepare(ports),
        readPreview: createReadPreview(ports),
    };
}

export type AwardVote = ReturnType<typeof createAwardVote>;
