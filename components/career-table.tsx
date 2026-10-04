'use client';

import React, { FC, useState } from 'react';
import Link from 'next/link';
import AwardLegend from '@/components/award-legend';
import TeamBadge from '@/components/team-badge';
import { JagrCupIcon, TrophyArt } from '@/components/trophy-icons';
import { awardHref, getAwardDefinition } from '@/lib/awards';
import { formatFpts, seasonLabel } from '@/lib/league';

export interface CareerStats {
    Year: number;
    Position: string;
    YOFHLTeam: string;
    FPts: number;
    FPG: number;
    Champion?: boolean;
    TeamID: string | null;
    teamName: string | null; // the team's name that season
    teamLogo: string | null;
}

interface CareerTableProps {
    careerStats: CareerStats[];
    awardsByYear: Record<number, string[]>; // award names per season, used for the row highlights
}

type SortKey = 'Year' | 'FPts' | 'FPG';

// Desktop rows share tracks so the widest season/award group sizes every row's first column.
const GRID = 'grid grid-cols-[minmax(0,1fr)_84px_50px] items-center gap-2.5 px-4 lg:col-span-4 lg:grid-cols-subgrid lg:gap-4 lg:px-8';

const ChampionBadge: FC = () => (
    <span className="metal-gold inline-flex h-7 items-center gap-1.5 rounded-full pl-2 pr-3 text-xs font-extrabold uppercase tracking-[.08em] text-[#2B1D00] shadow-[0_4px_12px_-4px_rgba(184,134,11,.6)]">
        <JagrCupIcon className="h-7 w-7" />
        Champion
    </span>
);

// season-by-season stats, the main section of /player/[ID]
const CareerTable: FC<CareerTableProps> = ({ careerStats, awardsByYear }) => {
    const [sortKey, setSortKey] = useState<SortKey>('Year');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const handleSort = (key: SortKey) => {
        setSortOrder(sortKey === key && sortOrder === 'asc' ? 'desc' : 'asc');
        setSortKey(key);
    };

    const rows = careerStats
        .filter((stat) => stat.FPts > 0 || stat.YOFHLTeam !== 'FA')
        .sort((a, b) => (sortOrder === 'asc' ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));

    const totalFPts = careerStats.reduce((acc, stat) => acc + stat.FPts, 0);
    const awardCounts = rows.map((stat) => awardsByYear[stat.Year]?.length ?? 0);

    const header = (key: SortKey, label: string, numeric = false) => (
        <span className={numeric ? 'text-right lg:text-center' : ''} aria-sort={sortKey === key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} role="columnheader">
            <button type="button" onClick={() => handleSort(key)} className="min-h-11 uppercase tracking-[inherit] hover:text-rink-blue">
                {label}{sortKey === key ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
            </button>
        </span>
    );

    return (
        <section className="overflow-hidden rounded-3xl border border-line bg-white shadow-card lg:grid lg:grid-cols-[minmax(max-content,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]" role="table" aria-label="Season by season">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pb-3 pt-5 lg:col-span-4 lg:px-6">
                <h2 className="font-wide m-0 text-lg font-extrabold uppercase lg:text-xl">Season by Season</h2>
                <AwardLegend award={awardCounts.some((c) => c === 1)} multipleAwards={awardCounts.some((c) => c > 1)} />
            </div>
            <div className={`${GRID} border-b-2 border-ink text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted lg:text-xs`} role="row">
                {header('Year', 'Season')}
                <span role="columnheader" className="hidden lg:block">Team</span>
                {header('FPts', 'FPts', true)}
                {header('FPG', 'FP/G', true)}
            </div>
            {rows.length > 0 ? (
                rows.map((stat, index) => {
                    const awardCount = awardsByYear[stat.Year]?.length ?? 0;
                    const highlight = awardCount > 1 ? 'bg-award-multi' : awardCount === 1 ? 'bg-award-single' : '';
                    const team = stat.TeamID ? (
                        <Link href={`/teams/${stat.TeamID}`} className="hover:text-rink-blue hover:underline" title={stat.teamName ?? undefined}>{stat.YOFHLTeam}</Link>
                    ) : (
                        stat.YOFHLTeam
                    );
                    return (
                        <div
                            key={stat.Year}
                            role="row"
                            className={`${GRID} row-hover animate-rise min-h-[64px] border-b border-line-soft ${highlight}`}
                            style={{ animationDelay: `${index * 40}ms` }}
                        >
                            <span role="cell" className="flex min-w-0 flex-col gap-1 py-3 lg:flex-row lg:items-center lg:gap-2.5">
                                <span className="flex flex-wrap items-center gap-2.5 lg:shrink-0 lg:flex-nowrap">
                                    <span className="tabular whitespace-nowrap text-[17px] font-extrabold">{seasonLabel(stat.Year)}</span>
                                    {stat.Champion && <ChampionBadge />}
                                </span>
                                {!!awardCount && <span className="flex flex-wrap items-center gap-1 lg:shrink-0 lg:flex-nowrap">
                                    {awardsByYear[stat.Year].map((award) => <Link key={award} href={awardHref(award)} className="rounded-md hover:bg-gold-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-rink-blue" aria-label={`${getAwardDefinition(award)?.label ?? award}, ${seasonLabel(stat.Year)}`}>
                                        <TrophyArt award={award} title={getAwardDefinition(award)?.label ?? award} className="h-9 w-9" sizes="36px" />
                                    </Link>)}
                                </span>}
                                {/* phones and tablets: team tucks under the season */}
                                <span className="text-sm font-semibold text-ink-muted lg:hidden">{team}</span>
                            </span>
                            <span role="cell" className="hidden min-w-0 items-center gap-2.5 font-semibold text-ink-muted lg:flex">
                                {stat.teamName && <TeamBadge logo={stat.teamLogo} abbreviation={stat.YOFHLTeam} teamName={stat.teamName} size={32} ring="none" />}
                                {team}
                            </span>
                            <span role="cell" className="tabular text-right text-[17px] font-extrabold lg:text-center lg:text-[22px]">{formatFpts(stat.FPts)}</span>
                            <span role="cell" className="tabular text-right text-[15px] font-bold text-ink-soft lg:text-center lg:text-[19px]">{stat.FPG.toFixed(2)}</span>
                        </div>
                    );
                })
            ) : (
                <div className="p-7 text-center text-ink-muted lg:col-span-4">No career stats available</div>
            )}
            <div className={`${GRID} min-h-[58px] bg-ink text-white`} role="row">
                <span role="cell" className="font-extrabold">Career</span>
                <span role="cell" className="hidden lg:block" />
                <span role="cell" className="tabular text-right text-[17px] font-extrabold lg:text-center lg:text-[22px]">{formatFpts(totalFPts)}</span>
                <span role="cell" />
            </div>
        </section>
    );
};

export default CareerTable;
