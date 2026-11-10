'use client';

import { useEffect, useState } from 'react';
import { readYourPickem } from '@/app/pickem/actions';
import TeamBadge from '@/components/team-badge';
import type { PickemEntry, PickemFranchise, PickemMatchupBreakdown, PickOutcome } from '@/lib/pickem/create-pickem';
import { hasSessionHint } from '@/lib/owner/navigation';

// A locked week's breakdown: each matchup's two franchises, how many entries took each side, and their owners.
// Once the week is scored it marks the side that won, or the tie, and a signed-in owner's picks show whether they
// were correct. Those load only when the session hint says an owner may be signed in (ADR 0003). Nothing here can
// be picked.

const pairKey = (a: number, b: number) => a < b ? `${a}-${b}` : `${b}-${a}`;
const outcomeLabel: Record<PickOutcome, string> = { correct: 'Your pick: correct', wrong: 'Your pick: wrong', neither: 'Your pick: tied' };

function Side({ franchise, entries, end, won }: { franchise: PickemFranchise; entries: PickemEntry[]; end: boolean; won: boolean }) {
    return <div className={`flex min-w-0 flex-col gap-2 ${end ? 'items-end text-right' : ''}`}>
        <div className={`flex min-w-0 items-center gap-2 ${end ? 'flex-row-reverse' : ''}`}>
            <TeamBadge logo={franchise.logo} abbreviation={franchise.abbreviation} teamName={franchise.name} size={36} />
            <span className="min-w-0 truncate text-sm font-bold md:text-base">{franchise.name}</span>
            {won && <span className="shrink-0 rounded bg-rink-red px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-white">Won</span>}
        </div>
        <p className="font-wide text-2xl font-extrabold tabular-nums">{entries.length}</p>
        {entries.length > 0 && <ul className="text-xs text-ink-soft">
            {entries.map(entry => <li key={entry.franchise.id}>{entry.owner ?? entry.franchise.name}</li>)}
        </ul>}
    </div>;
}

export default function PickemBreakdown({ seasonYear, week, breakdown }: { seasonYear: number; week: number; breakdown: PickemMatchupBreakdown[] }) {
    const scored = breakdown.some(item => item.result !== null);
    const [outcomes, setOutcomes] = useState<Map<string, PickOutcome>>(new Map());

    useEffect(() => {
        if (!scored || !hasSessionHint()) return;
        let cancelled = false;
        readYourPickem(seasonYear, week).then(answer => {
            if (cancelled || answer?.status !== 'entry') return;
            setOutcomes(new Map(answer.picks.flatMap(pick => pick.outcome ? [[pairKey(...pick.matchup), pick.outcome] as const] : [])));
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [seasonYear, week, scored]);

    return <ul className="mt-6 flex flex-col gap-3">
        {breakdown.map(({ matchup, away, home, result }) => {
            const outcome = outcomes.get(pairKey(matchup.away.id, matchup.home.id));
            return <li key={`${matchup.away.id}-${matchup.home.id}`} className="rounded-xl bg-white p-3 shadow-sm md:p-4">
                <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 md:gap-4">
                    <Side franchise={matchup.away} entries={away} end={false} won={result === 'away'} />
                    <span className="self-center text-xs font-extrabold uppercase text-ink-faint">{result === 'tie' ? 'Tie' : 'vs'}</span>
                    <Side franchise={matchup.home} entries={home} end won={result === 'home'} />
                </div>
                {outcome && <p className={`mt-2 text-center text-xs font-extrabold uppercase ${outcome === 'correct' ? 'text-rink-red' : 'text-ink-soft'}`}>
                    {outcomeLabel[outcome]}
                </p>}
            </li>;
        })}
    </ul>;
}
