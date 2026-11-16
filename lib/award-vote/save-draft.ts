// Saving a draft: the owner's unfinished ballot, saved on the site for their franchise as they rank, so it is there
// on another device. A draft never counts, may leave ranks empty and rank a candidate twice, and leaves a submitted
// ballot as it was until it is submitted again. The writes' rules are in ballot-write.ts.
import type { AwardVotePorts } from './ports';
import { startBallotWrite, writeBallot, type BallotWriteInput, type BallotWriteRejection } from './ballot-write';

export type SaveDraftInput = BallotWriteInput;
export type SaveDraftRejection = BallotWriteRejection;
export type SaveDraftResult = { ok: true } | { ok: false; reason: SaveDraftRejection };

export function createSaveDraft(ports: AwardVotePorts) {
    return async function saveDraft(input: SaveDraftInput): Promise<SaveDraftResult> {
        const start = await startBallotWrite(ports, input);
        if (!start.ok) return start;
        return writeBallot(ports, input.seasonYear, start.writer, false);
    };
}
