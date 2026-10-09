'use client';

import { useState, type ComponentProps } from 'react';
import StatTable from '@/components/stat-table';

const PREVIEW = 25;

// A franchise can have a hundred-plus alumni, so the profile opens on its top scorers.
export default function FranchiseLeaders({ players }: { players: ComponentProps<typeof StatTable>['topPlayers'] }) {
    const [expanded, setExpanded] = useState(false);
    const extra = players.length - PREVIEW;
    return <StatTable mode="all-time" topPlayers={expanded ? players : players.slice(0, PREVIEW)} currentPage={1}
        footer={extra > 0 ? <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}
            className="min-h-11 rounded-xl px-4 text-sm font-bold text-rink-blue hover:bg-rink-wash">
            {expanded ? `Show top ${PREVIEW} only` : `Show all ${players.length} players`}
        </button> : undefined} />;
}
