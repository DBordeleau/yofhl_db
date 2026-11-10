'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { readYourPickem, savePickemPick } from '@/app/pickem/actions';
import TeamBadge from '@/components/team-badge';
import type { PickemFranchise, PickemMatchup, YourPickem } from '@/lib/pickem/create-pickem';
import { hasSessionHint } from '@/lib/owner/navigation';

interface Props {
    seasonYear: number;
    week: number;
    matchups: PickemMatchup[];
}

const pairKey = (a: number, b: number) => a < b ? `${a}-${b}` : `${b}-${a}`;

// The public page renders the matchups; the owner's own Pick'em picks load only when the session hint says an
// owner may be signed in (ADR 0003), so an anonymous visit makes no extra request.
export default function PickemWeek({ seasonYear, week, matchups }: Props) {
    const [yours, setYours] = useState<YourPickem | null>(null);
    const [picks, setPicks] = useState<Map<string, number>>(new Map());
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!hasSessionHint()) { setYours({ status: 'signed-out' }); return; }
        let cancelled = false;
        readYourPickem(seasonYear, week).then(answer => {
            if (cancelled) return;
            setYours(answer ?? { status: 'signed-out' });
            if (answer?.status === 'entry') setPicks(new Map(answer.picks.map(pick => [pairKey(...pick.matchup), pick.picked])));
        }).catch(() => { if (!cancelled) setYours({ status: 'signed-out' }); });
        return () => { cancelled = true; };
    }, [seasonYear, week]);

    async function choose(matchup: PickemMatchup, franchise: PickemFranchise) {
        const key = pairKey(matchup.away.id, matchup.home.id);
        // Choosing the current pick again clears it.
        const picked = picks.get(key) === franchise.id ? null : franchise.id;
        setSaving(key);
        setError(null);
        const result = await savePickemPick({ seasonYear, week, matchup: [matchup.away.id, matchup.home.id], picked })
            .catch(() => ({ error: 'Could not save your pick. Try again.' }));
        setSaving(null);
        if ('error' in result) { setError(result.error); return; }
        setPicks(current => {
            const next = new Map(current);
            if (picked === null) next.delete(key); else next.set(key, picked);
            return next;
        });
    }

    const canPick = yours?.status === 'entry';
    return <div className="mt-6">
        {yours?.status === 'signed-out' && <p className="mb-4 text-center text-sm text-ink-soft"><Link href="/owner" className="font-bold text-rink-red underline">Sign in</Link> to make your picks.</p>}
        {yours?.status === 'no-team' && <p className="mb-4 text-center text-sm text-ink-soft"><Link href="/owner" className="font-bold text-rink-red underline">Claim your team</Link> to make picks.</p>}
        {error && <p role="alert" className="mb-4 rounded-lg bg-rink-red/10 px-4 py-2 text-center text-sm font-bold text-rink-red">{error}</p>}
        <ul className="flex flex-col gap-3">
            {matchups.map(matchup => {
                const key = pairKey(matchup.away.id, matchup.home.id);
                const current = picks.get(key);
                return <li key={key} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-white p-2 shadow-sm md:gap-4 md:p-3">
                    {[matchup.away, matchup.home].map((franchise, side) => {
                        const content = <>
                            <TeamBadge logo={franchise.logo} abbreviation={franchise.abbreviation} teamName={franchise.name} size={36} />
                            <span className="min-w-0 truncate text-sm font-bold md:text-base">{franchise.name}</span>
                        </>;
                        const layout = `flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 ${side ? 'order-3 flex-row-reverse text-right' : ''}`;
                        if (!canPick) return <div key={franchise.id} className={layout}>{content}</div>;
                        const chosen = current === franchise.id;
                        return <button key={franchise.id} type="button" aria-pressed={chosen} disabled={saving === key}
                            onClick={() => choose(matchup, franchise)}
                            className={`${layout} border-2 transition-colors disabled:opacity-60 ${chosen ? 'border-rink-red bg-rink-red/10' : 'border-transparent hover:bg-ice'}`}>
                            {content}
                        </button>;
                    })}
                    <span className="order-2 text-xs font-extrabold uppercase text-ink-faint">vs</span>
                </li>;
            })}
        </ul>
    </div>;
}
