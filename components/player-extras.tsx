'use client';

import { FC, useState } from 'react';
import FPtsGraph from '@/components/fpts-graph';
import TrophyCase, { TrophyItem } from '@/components/trophy-case';
import type { PlayerSeason } from '@/lib/data/league';

// the trophy case and points chart under the season table: side by side on desktop,
// one at a time behind tabs on phones and tablets
const PlayerExtras: FC<{ trophies: TrophyItem[]; seasons: PlayerSeason[] }> = ({ trophies, seasons }) => {
    const [panel, setPanel] = useState<'trophies' | 'chart'>(trophies.length ? 'trophies' : 'chart');
    const tabs = [
        { key: 'trophies' as const, label: 'Trophy Case', count: trophies.length },
        { key: 'chart' as const, label: 'FPts Chart', count: null },
    ];

    return (
        <>
            <nav className="mt-5 flex gap-1 rounded-2xl bg-line-soft p-1 lg:hidden" aria-label="Player extras">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setPanel(tab.key)}
                        className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-[15px] font-bold transition-colors ${panel === tab.key ? 'bg-white text-ink shadow-[0_1px_2px_rgba(18,24,46,.12),0_0_0_1px_#DCE5EE]' : 'text-ink-muted hover:text-ink'}`}
                        aria-pressed={panel === tab.key}
                    >
                        {tab.label}
                        {tab.count ? <span className="metal-gold inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-xs font-extrabold text-[#2B1D00]">{tab.count}</span> : null}
                    </button>
                ))}
            </nav>

            {/* desktop: equal height so neither leaves an empty corner */}
            <div className="mt-3 grid gap-5 lg:mt-5 lg:grid-cols-2 lg:items-stretch">
                <div className={`min-w-0 ${panel === 'trophies' ? 'block' : 'hidden'} lg:block`}>
                    <TrophyCase items={trophies} className="h-full" />
                </div>
                <div className={`min-w-0 ${panel === 'chart' ? 'block' : 'hidden'} lg:block`}>
                    <FPtsGraph playerStats={seasons} className="h-full" />
                </div>
            </div>
        </>
    );
};

export default PlayerExtras;
