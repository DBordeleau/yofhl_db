// Serializes optimistic draft saves for an owner's ballot so rapid ranking changes never commit out of order,
// stale failures never roll back newer edits or show stale errors, and submitting flushes any in-flight or queued
// draft saves before running. Pure TypeScript, browser-safe.
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
    /** Flush any in-flight or queued draft saves, then run submit. */
    submit(snapshot: T, runSubmit: (value: T) => Promise<BallotSaveResult>): Promise<BallotSaveResult>;
}

async function runSafe(fn: () => Promise<BallotSaveResult>, fallback: string): Promise<BallotSaveResult> {
    try {
        return await fn();
    } catch {
        return { error: fallback };
    }
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
        try {
            while (pending !== null) {
                const job = pending;
                pending = null;
                const result = await runSafe(() => save(job.value), 'Could not save your ballot. Try again.');
                if ('error' in result) {
                    if (!submitting && job.version === version) {
                        latest = persisted;
                        onRollback(persisted, result);
                    }
                    continue;
                }
                persisted = job.value;
            }
        } finally {
            inFlight = null;
        }
    };

    const startDrain = () => {
        if (!inFlight) inFlight = drain();
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
            version++;
            try {
                if (inFlight) await inFlight;
                const result = await runSafe(() => runSubmit(snapshot), 'Could not submit your ballot. Try again.');
                if (!('error' in result)) persisted = snapshot;
                return result;
            } finally {
                submitting = false;
            }
        },
    };
}
