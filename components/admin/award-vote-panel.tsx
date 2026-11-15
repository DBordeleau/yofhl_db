'use client';

// The season's award vote in admin: preparing its ballot (batch after batch until done), opening voting and moving
// the ballot lock, who has submitted, and previewing the ballot as owners will see it. A rehearsal is marked as one
// throughout, and never opened.
import { useEffect, useState } from 'react';
import { prepareAwardVote } from '@/app/admin/award-vote-actions';
import { moveBallotLock, openVoting } from '@/app/admin/voting-actions';
import CandidateList from '@/components/award-vote/candidate-list';
import type { AwardVotePreview } from '@/lib/award-vote/create-award-vote';
import { ADMIN_BUTTON, AdminActionStatus, easternTime, useAdminAction } from './admin-action';

export default function AwardVotePanel({ year, preview }: { year: number; preview: AwardVotePreview }) {
    const { pending, result, run } = useAdminAction({ refreshAfterError: true });
    const [progress, setProgress] = useState<string | null>(null);
    const { vote, ballot } = preview;
    const rehearsal = preview.kind === 'rehearsal' || !!vote?.rehearsal;
    const unfinished = vote !== null && vote.preparedAt === null;

    const prepare = (startOver = false) => run(async () => {
        setProgress(null);
        for (let first = true; ; first = false) {
            const step = await prepareAwardVote(year, startOver && first);
            if ('error' in step || !step.more) return step;
            setProgress(step.message);
        }
    });

    return <div>
        {rehearsal && <p className="mb-3 text-sm font-bold">Rehearsal: never opened, never shown to owners.</p>}
        {!vote && <p className="text-sm text-ink-soft">Not prepared yet.</p>}
        {vote && <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="font-bold">State</dt><dd className="capitalize">{vote.rehearsal ? `${vote.state} (rehearsal)` : vote.state}</dd>
            <dt className="font-bold">Prepared</dt><dd>{vote.preparedAt ? easternTime(vote.preparedAt) : `Unfinished, started ${easternTime(vote.prepareStartedAt)}`}</dd>
            {vote.openedAt && <><dt className="font-bold">Opened</dt><dd>{easternTime(vote.openedAt)}</dd></>}
            {vote.ballotLock && <><dt className="font-bold">Ballot lock</dt><dd>{easternTime(vote.ballotLock)}</dd></>}
        </dl>}
        {(!vote || vote.state === 'prepared') && <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={ADMIN_BUTTON} disabled={pending} onClick={() => prepare()}>
                {`${unfinished ? 'Continue preparing' : vote ? 'Prepare again' : 'Prepare ballot'}${rehearsal ? ' (rehearsal)' : ''}`}
            </button>
            {unfinished && <button type="button" className={ADMIN_BUTTON} disabled={pending} onClick={() => prepare(true)}>Start over</button>}
        </div>}
        <AdminActionStatus pending={pending} pendingText={progress ?? 'Preparing…'} result={result} />
        {vote && !rehearsal && <Voting year={year} vote={vote} ballotStatus={preview.ballotStatus} />}
        {ballot && <BallotPreview ballot={ballot} rehearsal={rehearsal} />}
    </div>;
}

/** the browser's `datetime-local` value as an ISO time, or the empty string for none */
const isoFromLocal = (value: string) => {
    const time = value ? new Date(value).getTime() : NaN;
    return Number.isNaN(time) ? '' : new Date(time).toISOString();
};

/**
 * Opening a finished prepare with its ballot lock; once open, the ballot link to share, moving the ballot lock later
 * and which franchises have submitted (never their rankings)
 */
function Voting({ year, vote, ballotStatus }: {
    year: number;
    vote: NonNullable<AwardVotePreview['vote']>;
    ballotStatus: AwardVotePreview['ballotStatus'];
}) {
    const { pending, result, run } = useAdminAction();
    const [lock, setLock] = useState('');
    const [link, setLink] = useState('/owner/ballot');
    useEffect(() => setLink(`${window.location.origin}/owner/ballot`), []);
    const open = vote.state === 'open';
    if (vote.state === 'prepared' && !vote.preparedAt) return null;
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const ballotLock = isoFromLocal(lock);
        run(() => open ? moveBallotLock(year, ballotLock) : openVoting(year, ballotLock));
    };

    return <div className="mt-6 border-t border-line pt-5">
        <h3 className="font-wide text-base font-extrabold uppercase">Voting</h3>
        {(vote.state === 'prepared' || open) && <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm font-bold">
                {open ? 'New ballot lock (your time)' : 'Ballot lock (your time)'}
                <input type="datetime-local" required value={lock} onChange={event => setLock(event.target.value)}
                    className="h-11 rounded-xl border border-line-strong bg-white px-3 font-normal" />
            </label>
            <button type="submit" className={ADMIN_BUTTON} disabled={pending}>{open ? 'Move ballot lock' : 'Open voting'}</button>
        </form>}
        {!open && vote.state === 'prepared' && <p className="mt-2 text-sm text-ink-soft">Opening freezes the ballot: it can no longer be prepared again or have its rookies changed.</p>}
        <AdminActionStatus pending={pending} pendingText={open ? 'Moving…' : 'Opening…'} result={result} />
        {vote.state !== 'prepared' && <>
            <p className="mt-3 text-sm"><span className="font-bold">Ballot link: </span>
                <a href={link} className="break-all text-rink-blue hover:underline">{link}</a>
                <button type="button" className="ml-2 text-sm font-bold text-rink-blue hover:underline" onClick={() => void navigator.clipboard?.writeText(link)}>Copy</button>
            </p>
            {ballotStatus && <>
                <h4 className="mt-4 text-sm font-bold">Ballots submitted: {ballotStatus.filter(item => item.submitted).length} of {ballotStatus.length}</h4>
                <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                    {ballotStatus.map(item => <li key={item.franchise.id} className="flex justify-between gap-3 border-b border-line/60 py-1">
                        <span>{item.franchise.name}{item.owner ? <span className="text-ink-soft"> · {item.owner}</span> : null}</span>
                        <span className={item.submitted ? 'font-bold' : 'text-ink-soft'}>{item.submitted ? 'Submitted' : 'Not yet'}</span>
                    </li>)}
                </ul>
            </>}
        </>}
    </div>;
}

function BallotPreview({ ballot, rehearsal }: { ballot: NonNullable<AwardVotePreview['ballot']>; rehearsal: boolean }) {
    const [selected, setSelected] = useState(ballot[0]?.award);
    const award = ballot.find(item => item.award === selected) ?? ballot[0];
    if (!award) return null;
    return <div className="mt-6">
        <h3 className="font-wide text-base font-extrabold uppercase">{rehearsal ? 'Rehearsal ballot preview' : 'Ballot preview'}</h3>
        <div role="tablist" aria-label="Voted awards" className="mt-3 flex flex-wrap gap-2">
            {ballot.map(item => <button key={item.award} type="button" role="tab" aria-selected={item.award === award.award}
                onClick={() => setSelected(item.award)}
                className={`min-h-11 rounded-xl border px-3 text-sm font-bold ${item.award === award.award ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white hover:border-ink'}`}>
                {item.label}
            </button>)}
        </div>
        <div role="tabpanel" className="mt-4">
            <p className="mb-3 text-sm text-ink-soft">{award.honor}</p>
            <CandidateList key={award.award} award={award} />
        </div>
    </div>;
}
