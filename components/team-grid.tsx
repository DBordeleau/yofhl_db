'use client';

import { FC, useState } from 'react';
import PageTitle from '@/components/page-title';
import RinkDivider from '@/components/rink-divider';
import TeamCard from '@/components/team-cards';
import type { FranchiseCard } from '@/lib/data/league';

type SortKey = 'wins' | 'fpf' | 'cups' | 'finals';

const SORTS: { key: SortKey; label: string; value: (t: FranchiseCard) => number }[] = [
    { key: 'wins', label: 'Wins', value: (t) => t.Wins },
    { key: 'fpf', label: 'Points For', value: (t) => t.FPF },
    { key: 'cups', label: 'Jagr Cups', value: (t) => t.championships.length },
    { key: 'finals', label: 'Finals', value: (t) => t.finals.length },
];

// title, sort control and franchise cards for /teams/stats
const TeamGrid: FC<{ teams: FranchiseCard[] }> = ({ teams }) => {
    const [sortKey, setSortKey] = useState<SortKey>('wins');
    const sort = SORTS.find((s) => s.key === sortKey)!;
    // ties fall back to wins so the order stays stable
    const sorted = [...teams].sort((a, b) => sort.value(b) - sort.value(a) || b.Wins - a.Wins);

    return (
        <>
            <PageTitle eyebrow="All-Time" title="Team Stats">
                <nav className="mt-2.5 flex flex-wrap justify-center gap-1 rounded-2xl bg-line-soft p-1" aria-label="Sort teams">
                    {SORTS.map((s) => (
                        <button
                            key={s.key}
                            type="button"
                            onClick={() => setSortKey(s.key)}
                            className={`inline-flex min-h-11 items-center rounded-xl px-4 text-[15px] font-bold transition-colors ${sortKey === s.key ? 'bg-white text-ink shadow-[0_1px_2px_rgba(18,24,46,.12),0_0_0_1px_#DCE5EE]' : 'text-ink-muted hover:text-ink'}`}
                            aria-pressed={sortKey === s.key}
                        >
                            {s.label}
                        </button>
                    ))}
                </nav>
            </PageTitle>
            <RinkDivider />
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 4xl:grid-cols-5">
                {sorted.map((team, i) => <TeamCard key={`${sortKey}-${team.ID}`} team={team} rank={i + 1} index={i} />)}
            </div>
        </>
    );
};

export default TeamGrid;
