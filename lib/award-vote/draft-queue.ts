// Serializes optimistic draft saves for an owner's ballot so rapid ranking changes never commit out of order,
// stale failures never roll back newer edits or show stale errors, and submitting waits for any in-flight draft
// save before running. Pure TypeScript, browser-safe.
import type { BallotProblem } from './ballot';

export type BallotSaveResult =
    | { ok: true }
    | { error: string; fix?: string; problems?: BallotProblem[] };

export interface BallotSaveQueue<T> {
    /** Latest optimistic (or rolled-back) ballot state. */
    current(): T;
    /** Last snapshot confirmed persisted by the server. */
    saved(): T;
    /** Whether a submission is currently in flight. */
    submitting(): boolean;
    /** Queue a draft change; at most one save runs at a time, coalescing intermediate edits. */
    enqueue(next: T): Promise<void>;
    /** Wait for any in-flight draft save (cancelling superseded queued drafts), then run submit. */
    submit(snapshot: T, runSubmit: (value: T) => Promise<BallotSaveResult>): Promise<BallotSaveResult>;
}

/** Create a serialized draft-save queue with single-flight coalescing and submit flush semantics. */
export function createBallotSaveQueue<T>({
    initial,
    save,
    onRollback,
}: {
    initial: T;
    save: (value: T) => Promise<BallotSaveResult>;
    onRollback: (restored: T, error: Exclude<BallotSaveResult, { ok: true }>) => void;
}): BallotSaveQueue<T> {
    let latest = initial;
    let persisted = initial;
    let pending: { value: T; version: number } | null = null;
    let version = 0;
    let inFlight: Promise<void> | null = null;
    let submitting = false;

    const drain = async () => {
        while (pending !== null && !submitting) {
            const job = pending;
            pending = null;
            const result = await save(job.value).catch((): BallotSaveResult => ({
                error: 'Could not save your ballot. Try again.',
            }));
            if ('error' in result) {
                if (!submitting && job.version === version) {
                    latest = persisted;
                    onRollback(persisted, result);
                }
                continue;
            }
            persisted = job.value;
        }
    };

    const startDrain = () => {
        if (!inFlight) {
            const run = drain().finally(() => {
                if (inFlight === run) inFlight = null;
            });
            inFlight = run;
        }
        return inFlight;
    };

    return {
        current: () => latest,
        saved: () => persisted,
        submitting: () => submitting,
        enqueue: next => {
            if (submitting) return Promise.resolve();
            latest = next;
            pending = { value: next, version: ++version };
            return startDrain();
        },
        submit: async (snapshot, runSubmit) => {
            if (submitting) return { error: 'Your ballot is already being submitted.' };
            submitting = true;
            latest = snapshot;
            pending = null;
            version++;
            try {
                if (inFlight) await inFlight;
                const result = await runSubmit(snapshot).catch((): BallotSaveResult => ({
                    error: 'Could not submit your ballot. Try again.',
                }));
                if (!('error' in result)) persisted = snapshot;
                return result;
            } finally {
                submitting = false;
            }
        },
    };
}
