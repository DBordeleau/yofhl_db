'use client';

import { useEffect, useState } from 'react';
import { readYourPickem } from '@/app/pickem/actions';
import Slab from '@/components/pickem/slab';
import TeamBadge from '@/components/team-badge';
import type { PickemEntry, PickemFranchise, PickemMatchupBreakdown, PickemPickOutcome } from '@/lib/pickem/create-pickem';
import { pairOf, pairOfMatchup } from '@/lib/pickem/model';
import { hasSessionHint } from '@/lib/owner/navigation';

// A locked week's breakdown: each matchup's two franchises, how many entries took each side, and their owners.
// Once the week is scored it marks the side that won, or the tie, and a signed-in owner's picks show whether they
// were correct. Those load only when the session hint says an owner may be signed in (ADR 0003). Nothing here can
// be picked.

const keyOf = (pair: [number, number]) => pairOf(...pair).join('-');
const outcomeLabel: Record<PickemPickOutcome, string> = { correct: "Your Pick'em pick: correct", wrong: "Your Pick'em pick: wrong", neither: "Your Pick'em pick: tied" };

function Side({ franchise, entries, end, won }: { franchise: PickemFranchise; entries: PickemEntry[]; end: boolean; won: boolean }) {
    return <div className={`flex min-w-0 flex-col gap-2 ${end ? 'items-end text-right' : ''}`}>
        <div className={`flex min-w-0 items-center gap-2 ${end ? 'flex-row-reverse' : ''}`}>
            <TeamBadge logo={franchise.logo} abbreviation={franchise.abbreviation} teamName={franchise.name} size={36} />
            <span className="min-w-0 truncate text-sm font-bold md:text-base">{franchise.name}</span>
            {won && <Slab>Won</Slab>}
        </div>
        <p className="font-wide text-2xl font-extrabold tabular-nums">{entries.length}</p>
        {entries.length > 0 && <ul className="text-xs text-ink-soft">
            {entries.map(entry => <li key={entry.franchise.id}>{entry.owner ?? entry.franchise.name}</li>)}
        </ul>}
    </div>;
}

export default function PickemBreakdown({ seasonYear, week, breakdown }: { seasonYear: number; week: number; breakdown: PickemMatchupBreakdown[] }) {
    const scored = breakdown.some(item => item.result !== null);
    const [outcomes, setOutcomes] = useState<Map<string, PickemPickOutcome>>(new Map());

    useEffect(() => {
        if (!scored || !hasSessionHint()) return;
        let cancelled = false;
        readYourPickem(seasonYear, week).then(answer => {
            if (cancelled || answer?.status !== 'entry') return;
            setOutcomes(new Map(answer.picks.flatMap(pick => pick.outcome ? [[keyOf(pick.matchup), pick.outcome] as const] : [])));
        }).catch(() => {});
        return () => { cancelled = true; };
    }, [seasonYear, week, scored]);

    return <ul className="mt-6 flex flex-col gap-3">
        {breakdown.map(({ matchup, away, home, result }) => {
            const outcome = outcomes.get(keyOf(pairOfMatchup(matchup)));
            return <li key={`${matchup.away.id}-${matchup.home.id}`} className="rounded-md border border-line bg-white p-3 md:p-4">
                <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 md:gap-4">
                    <Side franchise={matchup.away} entries={away} end={false} won={result === 'away'} />
                    <span className="self-center">{result === 'tie' ? <Slab tone="navy">Tie</Slab> : <Slab>vs</Slab>}</span>
                    <Side franchise={matchup.home} entries={home} end won={result === 'home'} />
                </div>
                {outcome && <p className={`mt-2 text-center text-xs font-extrabold uppercase ${outcome === 'correct' ? 'text-rink-red' : 'text-ink-soft'}`}>
                    {outcomeLabel[outcome]}
                </p>}
            </li>;
        })}
    </ul>;
}
