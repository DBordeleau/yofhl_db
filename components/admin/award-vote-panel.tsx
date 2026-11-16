'use client';

// The season's award vote in admin: preparing its ballot (batch after batch until done), opening voting and moving
// the ballot lock, who has submitted, scoring the ballots and reviewing each award's tally, reopening voting, every
// submitted ballot once the ballot lock has passed with voiding and restoring (ballot-review.tsx), and previewing
// the ballot as owners will see it. A rehearsal is marked as one throughout, and never opened.
import { useEffect, useState } from 'react';
import { prepareAwardVote } from '@/app/admin/award-vote-actions';
import { moveBallotLock, openVoting, publishAwardVote, refreshAwardVoteArchive, reopenVoting, scoreBallots } from '@/app/admin/voting-actions';
import CandidateList from '@/components/award-vote/candidate-list';
import type { AdminBallot, AwardTally, AwardVotePreview, ReadTalliesResult } from '@/lib/award-vote/create-award-vote';
import { ADMIN_BUTTON, AdminActionStatus, easternTime, useAdminAction } from './admin-action';
import BallotReview, { VoidBallots } from './ballot-review';

type Tallies = Extract<ReadTalliesResult, { ok: true }>;

export default function AwardVotePanel({ year, preview, tallies, ballots = null }: {
    year: number;
    preview: AwardVotePreview;
    tallies: Tallies | null;
    /** every submitted ballot, once the ballot lock has passed; null before */
    ballots?: AdminBallot[] | null;
}) {
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
            {vote.scoredAt && <><dt className="font-bold">Scored</dt><dd>{easternTime(vote.scoredAt)}</dd></>}
            {vote.publishedAt && <><dt className="font-bold">Published</dt><dd>{easternTime(vote.publishedAt)}</dd></>}
        </dl>}
        {(!vote || vote.state === 'prepared') && <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={ADMIN_BUTTON} disabled={pending} onClick={() => prepare()}>
                {`${unfinished ? 'Continue preparing' : vote ? 'Prepare again' : 'Prepare ballot'}${rehearsal ? ' (rehearsal)' : ''}`}
            </button>
            {unfinished && <button type="button" className={ADMIN_BUTTON} disabled={pending} onClick={() => prepare(true)}>Start over</button>}
        </div>}
        <AdminActionStatus pending={pending} pendingText={progress ?? 'Preparing…'} result={result} />
        {vote && !rehearsal && <Voting year={year} vote={vote} ballotStatus={preview.ballotStatus} />}
        {vote?.state === 'scored' && !rehearsal && <Publish year={year} />}
        {vote?.state === 'published' && <RefreshArchive year={year} />}
        {tallies && <TallyReview tallies={tallies} />}
        {ballots && ballot && <BallotReview year={year} ballots={ballots} awards={ballot} published={vote?.state === 'published'} />}
        {!ballots && vote?.state === 'open' && preview.voidBallots && <VoidBallots year={year} ballots={preview.voidBallots} />}
        {ballot && <BallotPreview ballot={ballot} rehearsal={rehearsal} />}
    </div>;
}

/** the browser's `datetime-local` value as an ISO time, or the empty string for none */
const isoFromLocal = (value: string) => {
    const time = value ? new Date(value).getTime() : NaN;
    return Number.isNaN(time) ? '' : new Date(time).toISOString();
};

/**
 * Opening a finished prepare with its ballot lock; once open, the ballot link to share, moving the ballot lock later,
 * which franchises have submitted (never their rankings) and scoring; once scored, reopening with a new ballot lock
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
    const scored = vote.state === 'scored';
    if (vote.state === 'prepared' && !vote.preparedAt) return null;
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const ballotLock = isoFromLocal(lock);
        run(() => open ? moveBallotLock(year, ballotLock) : scored ? reopenVoting(year, ballotLock) : openVoting(year, ballotLock));
    };

    return <div className="mt-6 border-t border-line pt-5">
        <h3 className="font-wide text-base font-extrabold uppercase">Voting</h3>
        {(vote.state === 'prepared' || open || scored) && <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm font-bold">
                {open || scored ? 'New ballot lock (your time)' : 'Ballot lock (your time)'}
                <input type="datetime-local" required value={lock} onChange={event => setLock(event.target.value)}
                    className="h-11 rounded-xl border border-line-strong bg-white px-3 font-normal" />
            </label>
            <button type="submit" className={ADMIN_BUTTON} disabled={pending}>{open ? 'Move ballot lock' : scored ? 'Reopen voting' : 'Open voting'}</button>
        </form>}
        {!open && vote.state === 'prepared' && <p className="mt-2 text-sm text-ink-soft">Opening freezes the ballot: it can no longer be prepared again or have its rookies changed.</p>}
        {scored && <p className="mt-2 text-sm text-ink-soft">Reopening lets every owner change their ballot until the new ballot lock. Score again afterwards to replace the tallies.</p>}
        <AdminActionStatus pending={pending} pendingText={open ? 'Moving…' : scored ? 'Reopening…' : 'Opening…'} result={result} />
        {open && <ScoreBallots year={year} />}
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

/** scoring the submitted ballots, once every franchise has submitted or the ballot lock has passed */
function ScoreBallots({ year }: { year: number }) {
    const { pending, result, run } = useAdminAction();
    return <div className="mt-4">
        <button type="button" className={ADMIN_BUTTON} disabled={pending} onClick={() => run(() => scoreBallots(year))}>Score ballots</button>
        <p className="mt-2 text-sm text-ink-soft">Available once every franchise has submitted, or once the ballot lock has passed. Franchises with no submitted ballot add nothing.</p>
        <AdminActionStatus pending={pending} pendingText="Scoring…" result={result} />
    </div>;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

/** each award's tally with its winner or winners; a tally is never edited, only replaced by scoring again */
function TallyReview({ tallies }: { tallies: Tallies }) {
    return <div className="mt-6 border-t border-line pt-5">
        <h3 className="font-wide text-base font-extrabold uppercase">Tallies</h3>
        <p className="mt-1 text-sm text-ink-soft">From {tallies.counted} {tallies.counted === 1 ? 'ballot' : 'ballots'}.</p>
        {tallies.tallies.map(tally => <AwardTallyTable key={tally.award} tally={tally} />)}
    </div>;
}

function AwardTallyTable({ tally }: { tally: AwardTally }) {
    const winners = tally.lines.filter(line => line.place === 1);
    const depth = tally.lines[0]?.votes.length ?? 0;
    return <div className="mt-4">
        <h4 className="text-sm font-bold">{tally.label}</h4>
        <p className="text-sm">{winners.length > 1 ? 'Winners' : 'Winner'}: <span className="font-bold">{winners.map(line => line.name).join(', ')}</span></p>
        <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-line text-left text-ink-soft">
                        <th className="py-1 pr-3 font-bold">Place</th>
                        <th className="py-1 pr-3 font-bold">Player</th>
                        <th className="py-1 pr-3 text-right font-bold">Pts</th>
                        {ORDINALS.slice(0, depth).map(ordinal => <th key={ordinal} className="py-1 pr-3 text-right font-bold">{ordinal}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {tally.lines.map(line => <tr key={line.playerId} className="border-b border-line/60">
                        <td className="py-1 pr-3 tabular-nums">{line.place}</td>
                        <td className={`py-1 pr-3 ${line.place === 1 ? 'font-bold' : ''}`}>{line.name}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{line.points}</td>
                        {line.votes.map((count, rank) => <td key={rank} className="py-1 pr-3 text-right tabular-nums">{count}</td>)}
                    </tr>)}
                </tbody>
            </table>
        </div>
    </div>;
}

/** publishing a scored award vote's winners into the archive, after a confirmation, since it can't be undone */
function Publish({ year }: { year: number }) {
    const { pending, result, run } = useAdminAction();
    const publish = () => {
        if (!window.confirm('Publish the winners? They replace any winners entered by hand, voting can no longer be reopened, and this can’t be undone.')) return;
        run(() => publishAwardVote(year));
    };
    return <div className="mt-6 border-t border-line pt-5">
        <button type="button" className={ADMIN_BUTTON} disabled={pending} onClick={publish}>Publish winners</button>
        <p className="mt-2 text-sm text-ink-soft">Writes each award’s first-place finishers, co-winners included, onto every page that shows award winners. Final.</p>
        <AdminActionStatus pending={pending} pendingText="Publishing…" result={result} />
    </div>;
}

/** re-running publishing's view refresh and page expiry, for when it failed after the winners were written */
function RefreshArchive({ year }: { year: number }) {
    const { pending, result, run } = useAdminAction();
    return <div className="mt-6 border-t border-line pt-5">
        <button type="button" className={ADMIN_BUTTON} disabled={pending} onClick={() => run(() => refreshAwardVoteArchive(year))}>Refresh archive</button>
        <p className="mt-2 text-sm text-ink-soft">If publishing showed an error, this finishes updating the pages that show award winners. Safe to repeat.</p>
        <AdminActionStatus pending={pending} pendingText="Refreshing…" result={result} />
    </div>;
}
