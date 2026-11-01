'use client';

import React, { FC, useState } from 'react';
import Link from 'next/link';
import AwardLegend from '@/components/award-legend';
import TeamBadge from '@/components/team-badge';
import { TrophyArt } from '@/components/trophy-icons';
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
    careerFpg: number;
}

type SortKey = 'Year' | 'FPts' | 'FPG';

// Desktop rows share tracks so the widest season/award group sizes every row's first column.
const GRID = 'grid grid-cols-[minmax(0,1fr)_84px_50px] items-center gap-2.5 px-4 lg:col-span-4 lg:grid-cols-subgrid lg:gap-6 lg:px-6';

const ChampionChip: FC = () => (
    <span className="metal-gold inline-flex h-[22px] items-center px-2.5 text-[11px] font-black uppercase italic tracking-[.06em] text-[#1C1404] [clip-path:polygon(5px_0,100%_0,calc(100%_-_5px)_100%,0_100%)]">
        Champion
    </span>
);

// season-by-season stats, the first section of /player/[ID]
const CareerTable: FC<CareerTableProps> = ({ careerStats, awardsByYear, careerFpg }) => {
    const [sortKey, setSortKey] = useState<SortKey>('Year');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    // newest season and biggest numbers first; a second click flips the order
    const handleSort = (key: SortKey) => {
        setSortOrder(sortKey === key && sortOrder === 'desc' ? 'asc' : 'desc');
        setSortKey(key);
    };

    const rows = careerStats
        .filter((stat) => stat.FPts > 0 || stat.YOFHLTeam !== 'FA')
        .sort((a, b) => (sortOrder === 'asc' ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));

    const totalFPts = careerStats.reduce((acc, stat) => acc + stat.FPts, 0);
    const awardCounts = rows.map((stat) => awardsByYear[stat.Year]?.length ?? 0);

    const header = (key: SortKey, label: string, numeric = false) => (
        <span className={numeric ? 'text-right' : ''} aria-sort={sortKey === key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'} role="columnheader">
            <button type="button" onClick={() => handleSort(key)} className={`min-h-11 uppercase tracking-[inherit] hover:text-rink-blue focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-rink-line ${sortKey === key ? 'text-ink' : ''}`}>
                {label}{sortKey === key ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''}
            </button>
        </span>
    );

    return (
        <>
            <div className="mb-3.5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <h2 className="text-2xl font-[850] leading-tight tracking-[-.04em] md:text-[27px] 3xl:text-[32px]">Season by season</h2>
                <AwardLegend award={awardCounts.some((c) => c === 1)} multipleAwards={awardCounts.some((c) => c > 1)} />
            </div>
            <div className="overflow-hidden rounded-md border border-line bg-white lg:grid lg:grid-cols-[minmax(max-content,1fr)_minmax(0,1.3fr)_140px_110px]" role="table" aria-label="Season by season">
                <div className={`${GRID} bg-[#EAF0F6] text-[11px] font-extrabold uppercase tracking-[.12em] text-ink-muted 3xl:text-xs`} role="row">
                    {header('Year', 'Season')}
                    <span role="columnheader" className="hidden lg:block">Team</span>
                    {header('FPts', 'FPts', true)}
                    {header('FPG', 'FP/G', true)}
                </div>
                {rows.length > 0 ? (
                    rows.map((stat, index) => {
                        const awardCount = awardsByYear[stat.Year]?.length ?? 0;
                        const highlight = awardCount > 1 ? 'bg-award-multi' : awardCount === 1 ? 'bg-award-single' : '';
                        const teamName = stat.teamName ?? stat.YOFHLTeam;
                        const team = stat.TeamID ? (
                            <Link href={`/teams/${stat.TeamID}`} className="hover:text-rink-blue hover:underline">{teamName}</Link>
                        ) : (
                            teamName
                        );
                        return (
                            <div
                                key={stat.Year}
                                role="row"
                                className={`${GRID} row-hover animate-rise min-h-[56px] border-t border-line-soft ${highlight}`}
                                style={{ animationDelay: `${index * 40}ms` }}
                            >
                                <span role="cell" className="flex min-w-0 flex-col gap-1 py-2.5 lg:flex-row lg:items-center lg:gap-2.5">
                                    <span className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap">
                                        <Link href={`/season/${stat.Year}`} className="tabular whitespace-nowrap text-base font-extrabold underline-offset-[3px] hover:text-rink-blue hover:underline 3xl:text-lg">{seasonLabel(stat.Year)}</Link>
                                        {!!awardCount && awardsByYear[stat.Year].map((award) => <Link key={award} href={awardHref(award)} className="rounded hover:bg-gold-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-rink-blue" aria-label={`${getAwardDefinition(award)?.label ?? award}, ${seasonLabel(stat.Year)}`}>
                                            <TrophyArt award={award} title={getAwardDefinition(award)?.label ?? award} className="h-8 w-8" sizes="32px" />
                                        </Link>)}
                                        {stat.Champion && <ChampionChip />}
                                    </span>
                                    {/* phones and tablets: team tucks under the season */}
                                    <span className="text-sm font-semibold leading-snug text-ink-soft lg:hidden">{team}</span>
                                </span>
                                <span role="cell" className="hidden min-w-0 items-center gap-2.5 text-[15px] font-bold text-ink-soft lg:flex">
                                    {stat.teamName && <TeamBadge logo={stat.teamLogo} abbreviation={stat.YOFHLTeam} teamName={stat.teamName} size={28} ring="none" />}
                                    <span>{team}</span>
                                </span>
                                <span role="cell" className="tabular text-right text-[17px] font-extrabold lg:text-lg 3xl:text-xl">{formatFpts(stat.FPts)}</span>
                                <span role="cell" className="tabular text-right text-[15px] font-semibold text-ink-soft lg:text-base 3xl:text-lg">{stat.FPG.toFixed(2)}</span>
                            </div>
                        );
                    })
                ) : (
                    <div className="p-7 text-center text-ink-muted lg:col-span-4">No career stats available</div>
                )}
                <div className={`${GRID} min-h-[52px] bg-[#101D32] text-white`} role="row">
                    <span role="cell" className="font-extrabold">Career</span>
                    <span role="cell" className="hidden lg:block" />
                    <span role="cell" className="tabular text-right text-[17px] font-extrabold lg:text-lg 3xl:text-xl">{formatFpts(totalFPts)}</span>
                    <span role="cell" className="tabular text-right text-[15px] font-semibold text-[#C3CFE4] lg:text-base 3xl:text-lg">{careerFpg.toFixed(2)}</span>
                </div>
            </div>
        </>
    );
};

export default CareerTable;
