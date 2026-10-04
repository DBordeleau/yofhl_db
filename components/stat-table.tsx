'use client'

import React, { FC, ReactNode, useState } from 'react';
import Link from 'next/link';
import { CupRow } from '@/components/trophy-icons';
import { formatFpts, seasonLabel, splitPositions } from '@/lib/league';

// all player data used across both modes
interface PlayerStats {
    Player: string;
    Position: string;
    FPts: number;
    FPG: string | number;
    Age?: number;
    Year?: number;
    hasAward?: boolean; // for gold highlighting in single-season
    hasMultipleAwards?: boolean; // for red highlighting in single-season
    Champion?: boolean; // trophy rendering for single-season
    ChampionshipsWon?: number; // trophy rendering for all-time
    ID: string;
}

interface StatTableProps {
    mode: string; // 'all-time' | 'single-season' | 'champions'
    topPlayers: PlayerStats[];
    currentPage?: number;
    searchQuery?: string;
    loading?: boolean;
    animationKey?: string; // changing this replays the row entrance animation
    footer?: ReactNode;
}

// written out in full so Tailwind keeps the metallic rank styles
const RANK_CLASSES: Record<number, string> = { 1: 'rank-1', 2: 'rank-2', 3: 'rank-3' };

const GRID = 'grid grid-cols-[28px_minmax(0,1fr)_78px_40px] items-center gap-2 px-3 md:grid-cols-[60px_minmax(0,1fr)_120px_72px] md:gap-4 md:px-6';
// championship rosters drop the rank column and let the names lead
const ROSTER_GRID = 'grid grid-cols-[minmax(0,1fr)_78px_44px] items-center gap-2 px-4 md:grid-cols-[minmax(0,1fr)_120px_72px] md:gap-4 md:px-6';

type SortField = 'FPts' | 'FPG' | 'Player';

// used to render all-time/single-season stats at /stats/[mode]/[position]
// used to render championship rosters at /champions/[year] and franchise leaders at /teams/[ID]
const StatTable: FC<StatTableProps> = ({
    mode,
    topPlayers,
    currentPage = 1,
    searchQuery = "",
    loading = false,
    animationKey = '',
    footer,
}) => {
    const rankOffset = (currentPage - 1) * 25; // for pagination currently hardcoded to 25 results per page
    const isRoster = mode === 'champions';
    const grid = isRoster ? ROSTER_GRID : GRID;

    // rosters open sorted by FPts so the header shows which column is active
    const [sortField, setSortField] = useState<SortField | null>(isRoster ? 'FPts' : null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const filteredPlayers = topPlayers.filter(player =>
        player.Player?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // header sorting for fpts, fpg and (on rosters) player name
    const sortedPlayers = [...filteredPlayers].sort((a, b) => {
        if (!sortField) return 0;
        if (sortField === 'Player') {
            return sortDirection === 'asc' ? a.Player.localeCompare(b.Player) : b.Player.localeCompare(a.Player);
        }
        const fieldA = parseFloat(String(a[sortField]));
        const fieldB = parseFloat(String(b[sortField]));
        return sortDirection === 'asc' ? fieldA - fieldB : fieldB - fieldA;
    });

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            // names read A to Z first, numbers high to low
            setSortDirection(field === 'Player' ? 'asc' : 'desc');
        }
    };

    const arrow = (field: SortField) => (sortField === field ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : '');
    const ariaSort = (field: SortField) =>
        sortField === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none';

    return (
        <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card" role="table" aria-label="Fantasy points">
            <div className={`${grid} min-h-12 border-b-2 border-ink text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted md:text-xs`} role="row">
                {!isRoster && <span role="columnheader"><span className="md:hidden">#</span><span className="hidden md:inline">Rank</span></span>}
                {isRoster ? (
                    <span role="columnheader" aria-sort={ariaSort('Player')}>
                        <button type="button" onClick={() => handleSort('Player')} className="min-h-11 uppercase tracking-[inherit] hover:text-rink-blue">Player{arrow('Player')}</button>
                    </span>
                ) : (
                    <span role="columnheader">Player</span>
                )}
                <span role="columnheader" aria-sort={ariaSort('FPts')} className="text-right">
                    <button type="button" onClick={() => handleSort('FPts')} className="min-h-11 uppercase tracking-[inherit] hover:text-rink-blue">FPts{arrow('FPts')}</button>
                </span>
                <span role="columnheader" aria-sort={ariaSort('FPG')} className="text-right">
                    <button type="button" onClick={() => handleSort('FPG')} className="min-h-11 uppercase tracking-[inherit] hover:text-rink-blue">FP/G{arrow('FPG')}</button>
                </span>
            </div>

            {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className={`${grid} min-h-[66px] border-b border-line-soft last:border-b-0`} aria-hidden="true">
                        {!isRoster && <span className="skeleton h-6 w-7 rounded" />}
                        <span className="flex flex-col gap-1.5"><span className="skeleton h-4 w-40 max-w-full rounded" /><span className="skeleton h-3 w-16 rounded" /></span>
                        <span className="skeleton ml-auto h-4 w-16 rounded" />
                        <span className="skeleton ml-auto h-4 w-9 rounded" />
                    </div>
                ))
            ) : sortedPlayers.length > 0 ? (
                <div key={animationKey} role="rowgroup">
                    {sortedPlayers.map((player, index) => {
                        const rank = rankOffset + index + 1;
                        const highlight = player.hasMultipleAwards ? 'bg-award-multi' : player.hasAward ? 'bg-award-single' : '';
                        const cups = mode === 'all-time'
                            ? player.ChampionshipsWon ?? 0
                            : mode === 'single-season' && player.Champion ? 1 : 0;
                        const positions = splitPositions(player.Position ?? '').join(' · ');
                        const sub = mode === 'single-season' && player.Year ? `${seasonLabel(player.Year)} · ${positions}` : positions;
                        const fpg = typeof player.FPG === 'number' ? player.FPG.toFixed(2) : player.FPG;

                        return (
                            <div
                                key={`${player.ID}-${player.Year ?? ''}-${index}`}
                                role="row"
                                className={`${grid} row-hover animate-rise min-h-[66px] border-b border-line-soft transition-colors last:border-b-0 ${highlight}`}
                                style={{ animationDelay: `${Math.min(index, 14) * 35}ms` }}
                            >
                                {!isRoster && (
                                    <span role="cell" className={`font-narrow tabular font-extrabold leading-none ${rank <= 3 ? `${RANK_CLASSES[rank]} text-[28px] md:text-[36px]` : 'text-[22px] text-[#97A2B4] md:text-[28px]'}`}>
                                        {rank}
                                    </span>
                                )}
                                <span role="cell" className="flex min-w-0 flex-col gap-0.5 py-2.5">
                                    <span className="flex flex-wrap items-center gap-2">
                                        <Link href={`/player/${player.ID}`} className="text-[15px] font-bold text-ink underline-offset-[3px] hover:text-rink-blue hover:underline md:text-[17px]">
                                            {player.Player ?? 'N/A'}
                                        </Link>
                                        <CupRow count={cups} />
                                    </span>
                                    <span className="text-[11px] font-bold uppercase tracking-[.1em] text-ink-faint md:text-xs">{sub}</span>
                                </span>
                                <span role="cell" className="tabular text-right text-[15px] font-extrabold md:text-[19px]">{formatFpts(player.FPts)}</span>
                                <span role="cell" className="tabular text-right text-sm text-ink-muted md:text-base">{fpg}</span>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="p-7 text-center text-ink-muted">No players found</div>
            )}

            {footer && <div className="flex justify-center border-t border-line-soft px-5 py-3">{footer}</div>}
        </div>
    );
};

export default StatTable;
