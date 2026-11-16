// Submitting a ballot: the owner's complete rankings, which count, saved as their draft too. Refused, naming what is
// missing, unless every rank of every award on the ballot is filled and no candidate is ranked twice in one award
// (every ranked candidate being one of the award's frozen candidates, and GM of the Year not ranking the owner's own
// franchise, are checked for drafts and ballots alike). A
// submitted ballot can be changed and submitted again until the ballot lock. The writes' rules are in
// ballot-write.ts.
import { ballotProblems, type BallotProblem } from './ballot';
import type { AwardVotePorts } from './ports';
import { startBallotWrite, writeBallot, type BallotWriteInput, type BallotWriteRejection } from './ballot-write';

export type SubmitBallotInput = BallotWriteInput;
export type SubmitBallotRejection = BallotWriteRejection | 'incomplete';
export type SubmitBallotResult =
    | { ok: true }
    | { ok: false; reason: BallotWriteRejection }
    /** what keeps the ballot from being complete, by award in ballot order */
    | { ok: false; reason: 'incomplete'; problems: BallotProblem[] };

export function createSubmitBallot(ports: AwardVotePorts) {
    return async function submitBallot(input: SubmitBallotInput): Promise<SubmitBallotResult> {
        const start = await startBallotWrite(ports, input);
        if (!start.ok) return start;
        const problems = ballotProblems(start.writer.rankings, start.writer.awards);
        if (problems.length) return { ok: false, reason: 'incomplete', problems };
        return writeBallot(ports, input.seasonYear, start.writer, true);
    };
}
