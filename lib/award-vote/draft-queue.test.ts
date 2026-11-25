import assert from 'node:assert/strict';
import test from 'node:test';
import { createBallotSaveQueue, type BallotSaveResult } from './draft-queue';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

async function flushMicrotasks() {
    for (let i = 0; i < 6; i++) await Promise.resolve();
}

test('rapid draft saves run strictly one at a time and finish with the latest edit persisted', async () => {
    const calls: string[] = [];
    const gates: ReturnType<typeof deferred<BallotSaveResult>>[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const rollbacks: string[] = [];

    const queue = createBallotSaveQueue<string>({
        initial: 'v0',
        save: async value => {
            calls.push(value);
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            const d = deferred<BallotSaveResult>();
            gates.push(d);
            try { return await d.promise; } finally { inFlight--; }
        },
        onRollback: restored => rollbacks.push(restored),
    });

    const p1 = queue.enqueue('v1');
    assert.equal(queue.current(), 'v1');
    const p2 = queue.enqueue('v2');
    assert.equal(queue.current(), 'v2');
    assert.deepEqual(calls, ['v1']);
    assert.equal(maxInFlight, 1);

    gates[0].resolve({ ok: true });
    await flushMicrotasks();
    assert.deepEqual(calls, ['v1', 'v2']);

    gates[1].resolve({ ok: true });
    await Promise.all([p1, p2]);
    assert.equal(queue.saved(), 'v2');
    assert.equal(queue.current(), 'v2');
    assert.deepEqual(rollbacks, []);
});

test('three or more rapid edits while saving coalesce intermediate drafts', async () => {
    const calls: string[] = [];
    const gates: ReturnType<typeof deferred<BallotSaveResult>>[] = [];

    const queue = createBallotSaveQueue<string>({
        initial: 'v0',
        save: value => {
            calls.push(value);
            const d = deferred<BallotSaveResult>();
            gates.push(d);
            return d.promise;
        },
        onRollback: () => assert.fail('unexpected rollback'),
    });

    const p1 = queue.enqueue('v1');
    queue.enqueue('v2');
    queue.enqueue('v3');
    const p4 = queue.enqueue('v4');
    assert.deepEqual(calls, ['v1']);

    gates[0].resolve({ ok: true });
    await flushMicrotasks();
    assert.deepEqual(calls, ['v1', 'v4']);

    gates[1].resolve({ ok: true });
    await Promise.all([p1, p4]);
    assert.equal(queue.saved(), 'v4');
    assert.equal(queue.current(), 'v4');
});

test('a stale failed save superseded by a newer edit does not roll back or report an error', async () => {
    const calls: string[] = [];
    const gates: ReturnType<typeof deferred<BallotSaveResult>>[] = [];
    const rollbacks: string[] = [];

    const queue = createBallotSaveQueue<string>({
        initial: 'v0',
        save: value => {
            calls.push(value);
            const d = deferred<BallotSaveResult>();
            gates.push(d);
            return d.promise;
        },
        onRollback: restored => rollbacks.push(restored),
    });

    const p1 = queue.enqueue('v1');
    const p2 = queue.enqueue('v2');
    gates[0].resolve({ error: 'stale failure' });
    await flushMicrotasks();

    assert.equal(queue.current(), 'v2');
    assert.deepEqual(rollbacks, []);
    assert.deepEqual(calls, ['v1', 'v2']);

    gates[1].resolve({ ok: true });
    await Promise.all([p1, p2]);
    assert.equal(queue.saved(), 'v2');
    assert.equal(queue.current(), 'v2');
    assert.deepEqual(rollbacks, []);
});

test('a failed latest save or rejection rolls back to the last server-persisted draft', async () => {
    const gates: ReturnType<typeof deferred<BallotSaveResult>>[] = [];
    const rollbacks: { restored: string; error: string; fix?: string }[] = [];

    const queue = createBallotSaveQueue<string>({
        initial: 'v0',
        save: () => {
            const d = deferred<BallotSaveResult>();
            gates.push(d);
            return d.promise;
        },
        onRollback: (restored, err) => rollbacks.push({ restored, error: err.error, fix: err.fix }),
    });

    const p1 = queue.enqueue('v1');
    gates[0].resolve({ ok: true });
    await p1;
    assert.equal(queue.saved(), 'v1');

    const p2 = queue.enqueue('v2');
    gates[1].resolve({ error: 'The ballot lock has passed.', fix: '/owner' });
    await p2;
    assert.equal(queue.current(), 'v1');
    assert.equal(queue.saved(), 'v1');
    assert.deepEqual(rollbacks, [{ restored: 'v1', error: 'The ballot lock has passed.', fix: '/owner' }]);

    const p3 = queue.enqueue('v3');
    gates[2].reject(new Error('network down'));
    await p3;
    assert.equal(queue.current(), 'v1');
    assert.deepEqual(rollbacks.at(-1), { restored: 'v1', error: 'Could not save your ballot. Try again.', fix: undefined });
});

test('submit flushes in-flight and queued drafts before running, preserving queued edits on failed submit', async () => {
    const calls: string[] = [];
    const saveGates: ReturnType<typeof deferred<BallotSaveResult>>[] = [];
    const submitGate = deferred<BallotSaveResult>();
    const rollbacks: string[] = [];

    const queue = createBallotSaveQueue<string>({
        initial: 'v0',
        save: value => {
            calls.push(`save:${value}`);
            const d = deferred<BallotSaveResult>();
            saveGates.push(d);
            return d.promise;
        },
        onRollback: restored => rollbacks.push(restored),
    });

    void queue.enqueue('v1');
    void queue.enqueue('v2'); // queued while v1 is in flight

    const submitPromise = queue.submit('v2', value => {
        calls.push(`submit:${value}`);
        return submitGate.promise;
    });

    assert.equal(queue.submitting(), true);
    assert.deepEqual(calls, ['save:v1'], 'submit waits for in-flight draft save');

    // Enqueues during submit (while in-flight save runs) are ignored.
    await queue.enqueue('v3');
    assert.equal(queue.current(), 'v2');

    // Superseded in-flight failure does not roll back v2; queued v2 draft is flushed before submit runs.
    saveGates[0].resolve({ error: 'superseded error' });
    await flushMicrotasks();
    assert.deepEqual(rollbacks, []);
    assert.deepEqual(calls, ['save:v1', 'save:v2'], 'queued v2 draft flushes before runSubmit');

    // Enqueues while the queued draft is flushing during submit are also ignored.
    await queue.enqueue('v4');
    assert.equal(queue.current(), 'v2');

    saveGates[1].resolve({ ok: true });
    await flushMicrotasks();
    assert.equal(queue.saved(), 'v2');
    assert.deepEqual(calls, ['save:v1', 'save:v2', 'submit:v2']);

    // Enqueues while runSubmit is in flight are ignored.
    await queue.enqueue('v5');
    assert.equal(queue.current(), 'v2');

    // Submit failure keeps current() and saved() at v2 so leaving or retrying does not lose edits.
    submitGate.resolve({ error: 'Your ballot is not complete yet.' });
    const firstSubmit = await submitPromise;
    assert.deepEqual(firstSubmit, { error: 'Your ballot is not complete yet.' });
    assert.equal(queue.submitting(), false);
    assert.equal(queue.current(), 'v2');
    assert.equal(queue.saved(), 'v2');
    assert.deepEqual(rollbacks, []);

    // A later failed draft edit rolls back to v2 (proving v2 stayed persisted after failed submit).
    const laterEdit = queue.enqueue('v3');
    saveGates[2].resolve({ error: 'temporary error' });
    await laterEdit;
    assert.equal(queue.current(), 'v2');
    assert.deepEqual(rollbacks, ['v2']);

    // A retry submit succeeds.
    const secondSubmit = await queue.submit('v2', async value => {
        calls.push(`submit:${value}`);
        return { ok: true };
    });
    assert.deepEqual(secondSubmit, { ok: true });
    assert.equal(queue.saved(), 'v2');
});

test('failed flushed draft save during submit does not roll back edits and allows submit retry', async () => {
    const calls: string[] = [];
    const saveGates: ReturnType<typeof deferred<BallotSaveResult>>[] = [];
    const submitGate = deferred<BallotSaveResult>();
    const rollbacks: string[] = [];

    const queue = createBallotSaveQueue<string>({
        initial: 'v0',
        save: value => {
            calls.push(`save:${value}`);
            const d = deferred<BallotSaveResult>();
            saveGates.push(d);
            return d.promise;
        },
        onRollback: restored => rollbacks.push(restored),
    });

    void queue.enqueue('v1');
    void queue.enqueue('v2');
    const submitPromise = queue.submit('v2', value => {
        calls.push(`submit:${value}`);
        return submitGate.promise;
    });

    // Duplicate concurrent submit is refused without disturbing the active submission.
    const duplicate = await queue.submit('v2', async () => {
        calls.push('submit:duplicate');
        return { ok: true };
    });
    assert.deepEqual(duplicate, { error: 'Your ballot is already being submitted.' });

    saveGates[0].resolve({ ok: true });
    await flushMicrotasks();
    assert.deepEqual(calls, ['save:v1', 'save:v2']);

    saveGates[1].reject(new Error('network down'));
    await flushMicrotasks();
    assert.deepEqual(rollbacks, []);
    assert.equal(queue.current(), 'v2');
    assert.equal(queue.saved(), 'v1');
    assert.deepEqual(calls, ['save:v1', 'save:v2', 'submit:v2']);

    submitGate.reject(new Error('network down'));
    const failed = await submitPromise;
    assert.deepEqual(failed, { error: 'Could not submit your ballot. Try again.' });
    assert.equal(queue.submitting(), false);
    assert.equal(queue.current(), 'v2');
    assert.equal(queue.saved(), 'v1');
    assert.deepEqual(rollbacks, []);

    const retried = await queue.submit('v2', async value => {
        calls.push(`submit:${value}`);
        return { ok: true };
    });
    assert.deepEqual(retried, { ok: true });
    assert.equal(queue.saved(), 'v2');
});
