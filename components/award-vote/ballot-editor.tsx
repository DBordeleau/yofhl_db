'use client';

// The owner's ballot: one tab per voted award, its ranks, and its candidate list (the same list, sorting and search as
// the admin's preview) with a rank picker on each row. Each change shows at once and saves the franchise's draft,
// and is undone if the save is refused. Submitting names what is still missing. After the ballot lock it is read-only.
import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import CandidateList from '@/components/award-vote/candidate-list';
import TeamCandidateList from '@/components/award-vote/team-candidate-list';
import type { BallotActionResult } from '@/app/owner/ballot/actions';
import { ballotProblems, rankedAwards, withCandidates, type BallotProblem, type RankedAward } from '@/lib/award-vote/ballot';
import type { BallotRankings, OwnerBallotView } from '@/lib/award-vote/create-award-vote';
import { teamCandidateId, type VotedAwardId } from '@/lib/award-vote/model';
import { refreshOwnerNavigation } from '@/lib/owner/navigation';

type View = Extract<OwnerBallotView, { status: 'ballot' }>;
type Action = (seasonYear: number, rankings: BallotRankings) => Promise<BallotActionResult>;

const easternFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});
const eastern = (iso: string) => `${easternFormat.format(new Date(iso))} ET`;

const list = (items: (string | number)[]) => items.length < 2 ? String(items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** every award's ranks filled out to its depth */
const filledOut = (rankings: BallotRankings, awards: RankedAward[]): BallotRankings =>
    Object.fromEntries(awards.map(({ award, depth }) => [award, Array.from({ length: depth }, (_, index) => rankings[award]?.[index] ?? null)]));

export default function BallotEditor({ view, saveAction, submitAction }: { view: View; saveAction: Action; submitAction: Action }) {
    const awards = useMemo(() => view.awards.map(award => withCandidates(award, view.lists)), [view]);
    const gm = view.gmOfTheYear;
    // GM of the Year ranks last, by team season
    const tabs: { award: VotedAwardId; label: string; honor: string; depth: number }[] = useMemo(() => [...awards, ...gm ? [gm] : []], [awards, gm]);
    const ranked: RankedAward[] = useMemo(() => rankedAwards(awards, gm), [awards, gm]);
    const names = useMemo(() => new Map([
        ...view.lists.flat().map(candidate => [candidate.playerId, candidate.name] as const),
        ...(gm?.candidates ?? []).map(candidate => [teamCandidateId(candidate.teamSeasonId), candidate.name] as const),
    ]), [view, gm]);

    const [draft, setDraft] = useState(() => filledOut(view.ballot?.draft ?? {}, ranked));
    const [submitted, setSubmitted] = useState(view.ballot?.submitted ? filledOut(view.ballot.submitted, ranked) : null);
    const [submittedAt, setSubmittedAt] = useState(view.ballot?.submittedAt ?? null);
    const [selected, setSelected] = useState<VotedAwardId | undefined>(tabs[0]?.award);
    const [error, setError] = useState<{ message: string; fix?: string } | null>(null);
    const [problems, setProblems] = useState<BallotProblem[] | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const saved = useRef(draft);
    const saves = useRef(0);

    const editable = !view.locked && view.ballot !== null;
    const tab = tabs.find(item => item.award === selected) ?? tabs[0];
    const award = awards.find(item => item.award === tab?.award);
    const changed = submitted !== null && JSON.stringify(submitted) !== JSON.stringify(draft);

    const refused = (result: Exclude<BallotActionResult, { ok: true }>) => setError({ message: result.error, fix: result.fix });

    /** put `candidate` (a player ID, or a team season's for GM of the Year) at `rank` (from 1) of `awardId`, or take them off it with null */
    async function rank(awardId: VotedAwardId, candidate: string, rankTo: number | null) {
        if (!editable) return;
        const ranks = (draft[awardId] ?? []).map(id => id === candidate ? null : id);
        if (rankTo !== null) ranks[rankTo - 1] = candidate;
        const next = { ...draft, [awardId]: ranks };
        setDraft(next);
        setError(null);
        setProblems(null);
        const save = ++saves.current;
        const result: BallotActionResult = await saveAction(view.seasonYear, next).catch(() => ({ error: 'Could not save your ballot. Try again.' }));
        if ('error' in result) {
            // only the latest change rolls back, to what the site last kept
            if (save === saves.current) setDraft(saved.current);
            refused(result);
            return;
        }
        saved.current = next;
    }

    async function submit() {
        if (!editable || submitting) return;
        const missing = ballotProblems(draft, ranked);
        setError(null);
        setProblems(missing.length ? missing : null);
        if (missing.length) return;
        setSubmitting(true);
        const result: BallotActionResult = await submitAction(view.seasonYear, draft).catch(() => ({ error: 'Could not submit your ballot. Try again.' }));
        setSubmitting(false);
        if ('error' in result) {
            if (result.problems) setProblems(result.problems);
            else refused(result);
            return;
        }
        saved.current = draft;
        setSubmitted(draft);
        setSubmittedAt(new Date().toISOString());
        refreshOwnerNavigation();
    }

    /** the rank picker on a candidate's row */
    const rankPicker = (awardId: VotedAwardId, depth: number, candidate: string, name: string) => {
        const at = (draft[awardId] ?? []).indexOf(candidate);
        return <select aria-label={`Rank ${name}`} value={at === -1 ? '' : at + 1}
            onChange={event => void rank(awardId, candidate, event.target.value ? Number(event.target.value) : null)}
            className="h-11 rounded-lg border border-line-strong bg-white px-2 text-sm">
            <option value="">–</option>
            {Array.from({ length: depth }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
        </select>;
    };

    const describe = (problem: BallotProblem) => {
        const label = tabs.find(item => item.award === problem.award)?.label ?? problem.award;
        const parts = [
            problem.emptyRanks.length ? `${problem.emptyRanks.length > 1 ? 'ranks' : 'rank'} ${list(problem.emptyRanks)} empty` : '',
            problem.repeated.length ? `${list(problem.repeated.map(id => names.get(id) ?? id))} ranked more than once` : '',
        ].filter(Boolean);
        return `${label}: ${parts.join('; ')}`;
    };

    return <div>
        <h1 className="text-2xl font-extrabold">{view.team.name} ballot</h1>
        <p className="mt-2 text-sm">
            <span className="font-bold">{view.locked ? 'Ballot lock passed ' : 'Ballot lock: '}</span>{eastern(view.ballotLock)}
        </p>
        <p className="mt-1 text-sm text-ink-soft" aria-live="polite">
            {submittedAt ? `Submitted ${eastern(submittedAt)}.${changed ? ' You have changes that are not submitted.' : ''}` : 'Not submitted yet.'}
            {editable && ' You can change it until the ballot lock.'}
        </p>
        {!view.ballot && <p className="mt-3 text-sm text-ink-soft">{view.team.name} did not take part in this season&apos;s award vote, so this ballot is read-only.</p>}

        <div role="tablist" aria-label="Voted awards" className="mt-5 flex flex-wrap gap-2">
            {tabs.map(item => {
                const filled = (draft[item.award] ?? []).filter(Boolean).length;
                return <button key={item.award} type="button" role="tab" aria-selected={item.award === tab?.award} onClick={() => setSelected(item.award)}
                    className={`min-h-11 rounded-xl border px-3 text-sm font-bold ${item.award === tab?.award ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white hover:border-ink'}`}>
                    {item.label} <span className="font-normal">{filled}/{item.depth}</span>
                </button>;
            })}
        </div>

        {tab && <div role="tabpanel" className="mt-4">
            <p className="text-sm text-ink-soft">{tab.honor}</p>
            <ol className="mt-3 grid gap-1 text-sm sm:max-w-md">
                {(draft[tab.award] ?? []).map((candidate, index) => <li key={index} className="flex min-h-11 items-center gap-3 border-b border-line/60">
                    <span className="w-6 font-bold">{index + 1}</span>
                    <span className={`flex-1 ${candidate ? 'font-semibold' : 'text-ink-soft'}`}>{candidate ? names.get(candidate) ?? candidate : 'Empty'}</span>
                    {candidate && editable && <button type="button" className="min-h-11 px-2 text-sm font-bold text-rink-blue hover:underline"
                        onClick={() => void rank(tab.award, candidate, null)}>Clear<span className="sr-only"> rank {index + 1}</span></button>}
                </li>)}
            </ol>
            <div className="mt-5">
                {award
                    ? <CandidateList key={award.award} award={award} action={editable ? candidate => rankPicker(award.award, award.depth, candidate.playerId, candidate.name) : undefined} />
                    : gm && <TeamCandidateList candidates={gm.candidates}
                        action={editable ? candidate => rankPicker(gm.award, gm.depth, teamCandidateId(candidate.teamSeasonId), candidate.name) : undefined} />}
            </div>
        </div>}

        {editable && <div className="mt-6">
            <button type="button" disabled={submitting} onClick={() => void submit()}
                className="min-h-11 rounded-xl bg-ink px-5 text-sm font-bold text-white hover:bg-jagr-dark-blue disabled:cursor-wait disabled:opacity-50">
                {submitting ? 'Submitting…' : submittedAt ? 'Submit changes' : 'Submit ballot'}
            </button>
        </div>}
        <div className="mt-3 text-sm" aria-live="polite">
            {error && <p role="alert" className="text-rink-red">{error.message}{error.fix && <> <Link href={error.fix} className="font-bold underline">Fix it</Link></>}</p>}
            {problems && <div role="alert" className="text-rink-red">
                <p className="font-bold">Your ballot is not complete yet.</p>
                <ul className="mt-1 list-disc pl-5">{problems.map(problem => <li key={problem.award}>{describe(problem)}</li>)}</ul>
            </div>}
        </div>

        <section className="mt-8">
            <h2 className="text-lg font-extrabold">Who has submitted</h2>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {view.ballotStatus.map(item => <li key={item.franchise.id} className="flex min-h-11 items-center justify-between gap-3 border-b border-line/60">
                    <span>{item.franchise.name}{item.owner ? <span className="text-ink-soft"> · {item.owner}</span> : null}</span>
                    <span className={item.submitted ? 'font-bold' : 'text-ink-soft'}>{item.submitted ? 'Submitted' : 'Not yet'}</span>
                </li>)}
            </ul>
        </section>
    </div>;
}
