'use client';

// Every submitted ballot's rankings in admin, once ballots have stopped changing (the award vote module refuses the
// read before the ballot lock), with void ballots marked and their reasons; voiding with a reason and restoring
// until the award vote is published.
import { useState } from 'react';
import { restoreBallot, voidBallot } from '@/app/admin/ballot-void-actions';
import type { AdminBallot, BallotAward } from '@/lib/award-vote/create-award-vote';
import { VOID_REASON_LENGTH } from '@/lib/award-vote/model';
import { ADMIN_BUTTON, AdminActionStatus, easternTime, useAdminAction } from './admin-action';

export default function BallotReview({ year, ballots, awards, published }: {
    year: number;
    ballots: AdminBallot[];
    /** the ballot's awards, in ballot order, for their labels and candidates' names */
    awards: BallotAward[];
    published: boolean;
}) {
    const counting = ballots.filter(ballot => !ballot.voidReason).length;
    return <div className="mt-6 border-t border-line pt-5">
        <h3 className="font-wide text-base font-extrabold uppercase">Ballots</h3>
        <p className="mt-1 text-sm text-ink-soft">
            {counting} of {ballots.length} submitted {ballots.length === 1 ? 'ballot counts' : 'ballots count'}.
            {!published && ' A void ballot adds nothing to any tally, and can be restored until publishing.'}
        </p>
        {ballots.length === 0 && <p className="mt-3 text-sm text-ink-soft">No ballots were submitted.</p>}
        <ul className="mt-2">
            {ballots.map(ballot => <li key={ballot.franchise.id} className="border-b border-line/60 py-3">
                <SubmittedBallot year={year} ballot={ballot} awards={awards} published={published} />
            </li>)}
        </ul>
    </div>;
}

function SubmittedBallot({ year, ballot, awards, published }: { year: number; ballot: AdminBallot; awards: BallotAward[]; published: boolean }) {
    const { pending, result, run } = useAdminAction();
    const [voiding, setVoiding] = useState(false);
    const [reason, setReason] = useState('');
    const { franchise, owner, voidReason } = ballot;
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        run(async () => {
            const done = await voidBallot(year, franchise.id, reason);
            if ('message' in done) { setVoiding(false); setReason(''); }
            return done;
        });
    };

    return <>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm">
                <span className="font-bold">{franchise.name}</span>
                {owner && <span className="text-ink-soft"> · {owner}</span>}
                <span className="text-ink-soft"> · submitted {easternTime(ballot.submittedAt)}</span>
            </p>
            {voidReason && <p className="text-sm font-bold uppercase tracking-wide text-rink-red">Void</p>}
        </div>
        {voidReason && <p className="mt-1 text-sm"><span className="font-bold">Reason: </span>{voidReason}</p>}
        <details className="mt-1 text-sm">
            <summary className="cursor-pointer font-bold text-rink-blue">Rankings</summary>
            <dl className={`mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-[auto_1fr] ${voidReason ? 'text-ink-soft' : ''}`}>
                {awards.filter(award => ballot.rankings[award.award]?.length).map(award => {
                    const names = new Map(award.candidates.map(candidate => [candidate.playerId, candidate.name]));
                    return <div key={award.award} className="contents">
                        <dt className="font-bold">{award.label}</dt>
                        <dd>
                            <ol className="list-inside list-decimal">
                                {ballot.rankings[award.award]!.map((playerId, rank) => <li key={rank}>{playerId ? names.get(playerId) ?? playerId : '—'}</li>)}
                            </ol>
                        </dd>
                    </div>;
                })}
            </dl>
        </details>
        {!published && <div className="mt-2">
            {voidReason
                ? <button type="button" className={ADMIN_BUTTON} disabled={pending} onClick={() => run(() => restoreBallot(year, franchise.id))}>Restore ballot</button>
                : voiding
                    ? <form onSubmit={submit} className="flex flex-col gap-2">
                        <label className="flex flex-col gap-1 text-sm font-bold">
                            Why is this ballot void?
                            <textarea required maxLength={VOID_REASON_LENGTH} rows={2} value={reason} onChange={event => setReason(event.target.value)}
                                className="rounded-xl border border-line-strong bg-white px-3 py-2 font-normal" />
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <button type="submit" className={ADMIN_BUTTON} disabled={pending || !reason.trim()}>Void ballot</button>
                            <button type="button" className="min-h-11 px-3 text-sm font-bold text-rink-blue hover:underline" onClick={() => setVoiding(false)}>Cancel</button>
                        </div>
                    </form>
                    : <button type="button" className="min-h-11 text-sm font-bold text-rink-red hover:underline" onClick={() => setVoiding(true)}>Void ballot…</button>}
            <AdminActionStatus pending={pending} pendingText={voidReason ? 'Restoring…' : 'Voiding…'} result={result} />
        </div>}
    </>;
}
