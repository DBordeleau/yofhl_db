'use client';

// The season's award vote in admin: preparing its ballot (batch after batch until done) and previewing the
// ballot as owners will see it. A rehearsal is marked as one throughout.
import { useState } from 'react';
import { prepareAwardVote } from '@/app/admin/award-vote-actions';
import CandidateList from '@/components/award-vote/candidate-list';
import type { AwardVotePreview } from '@/lib/award-vote/create-award-vote';
import { ADMIN_BUTTON, AdminActionStatus, easternTime, useAdminAction } from './admin-action';

export default function AwardVotePanel({ year, preview }: { year: number; preview: AwardVotePreview }) {
    const { pending, result, run } = useAdminAction({ refreshAfterError: true });
    const [progress, setProgress] = useState<string | null>(null);
    const { vote, ballot } = preview;
    const rehearsal = preview.kind === 'rehearsal' || !!vote?.rehearsal;
    const unfinished = vote !== null && vote.preparedAt === null;

    const prepare = () => run(async () => {
        setProgress(null);
        for (;;) {
            const step = await prepareAwardVote(year);
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
        </dl>}
        {(!vote || vote.state === 'prepared') && <button type="button" className={`${ADMIN_BUTTON} mt-4`} disabled={pending} onClick={prepare}>
            {`${unfinished ? 'Continue preparing' : vote ? 'Prepare again' : 'Prepare ballot'}${rehearsal ? ' (rehearsal)' : ''}`}
        </button>}
        <AdminActionStatus pending={pending} pendingText={progress ?? 'Preparing…'} result={result} />
        {ballot && <BallotPreview ballot={ballot} rehearsal={rehearsal} />}
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
