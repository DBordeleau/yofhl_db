'use client';

import { useState, type ComponentProps } from 'react';
import StatTable from '@/components/stat-table';

const PREVIEW = 8;

// A champion carries twenty-odd players, so the season opens on its top scorers.
export default function ChampionRoster({ players, animationKey }: { players: ComponentProps<typeof StatTable>['topPlayers']; animationKey: string }) {
    const [expanded, setExpanded] = useState(false);
    const extra = players.length - PREVIEW;
    return <StatTable mode="champions" topPlayers={expanded ? players : players.slice(0, PREVIEW)} animationKey={animationKey}
        footer={extra > 0 ? <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}
            className="min-h-11 rounded px-4 text-sm font-bold text-rink-blue hover:bg-rink-wash">
            {expanded ? `Show top ${PREVIEW} only` : `Show all ${players.length} players`}
        </button> : undefined} />;
}
