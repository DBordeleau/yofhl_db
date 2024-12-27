'use client'

import { FC, useState } from 'react';
import { HiTrophy } from "react-icons/hi2";
import Link from 'next/link';

// all player data used across both modes
interface PlayerStats {
    Player: string;
    Position: string;
    FPts: number;
    FPG: string;
    Age?: number;
    Year?: number;
    hasAward?: boolean; // for gold highlighting in single-season
    hasMultipleAwards?: boolean; // for red highlighting in single-season
    Champion?: boolean; // trophy rendering for single-season
    ChampionshipsWon?: number; // trophy rendering for all-time
    ID: string;
}

interface StatTableProps {
    mode: string;
    topPlayers: PlayerStats[];
    currentPage?: number;
    searchQuery?: string;
}

// used to render all-time/single-season stats at /stats/[mode]/[position]
// used to render championship rosters at /champions/[year]
const StatTable: FC<StatTableProps> = ({
    mode,
    topPlayers,
    currentPage = 1,
    searchQuery = "",
}) => {
    const rankOffset = (currentPage - 1) * 25; // for pagination currently hardcoded to 25 results per page

    const [sortField, setSortField] = useState<keyof PlayerStats | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const filteredPlayers = topPlayers.filter(player =>
        player.Player?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // header sorting for fpts, fpg and year
    const sortedPlayers = [...filteredPlayers].sort((a, b) => {
        if (!sortField) return 0;
        const fieldA = a[sortField];
        const fieldB = b[sortField];

        if (typeof fieldA === 'number' && typeof fieldB === 'number') {
            return sortDirection === 'asc' ? fieldA - fieldB : fieldB - fieldA;
        }

        if (typeof fieldA === 'string' && typeof fieldB === 'string') {
            return sortDirection === 'asc'
                ? fieldA.localeCompare(fieldB)
                : fieldB.localeCompare(fieldA);
        }

        return 0;
    });

    const handleSort = (field: keyof PlayerStats) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    return (
        <div className="flex flex-col items-center md:w-full max-w-7xl h-[75vh] overflow-y-auto overflow-x-auto rounded-b-lg">
            <table className="shadow-md mb-4 border border-collapse border-solid border-slate-400 items-center text-center table-auto text-slate-800 w-full">
                <thead>
                    <tr className="text-black text-nowrap text-[.75rem] md:text-[1.25rem] border border-solid border-slate-400 bg-sky-300">
                        <th className="px-2 py-2 w-1/12">Rank</th>
                        <th className="px-2 py-2 w-1/4 sm:w-1/4">Player</th>
                        <th className="px-2 py-2 w-1/12 sm:w-1/6">Position</th>
                        <th
                            className="px-2 py-2 w-1/5 sm:w-1/5 cursor-pointer hover:underline"
                            onClick={() => handleSort('FPts')}
                        >
                            Fpts {sortField === 'FPts' && (sortDirection === 'asc' ? '↑' : '↓')}
                        </th>
                        {mode === 'single-season' && (
                            <th
                                className="px-2 py-2 w-1/5 sm:w-1/5 cursor-pointer hover:underline"
                                onClick={() => handleSort('FPG')}
                            >
                                FP/G {sortField === 'FPG' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                        )}
                        {mode === 'single-season' && (
                            <th className="px-2 py-2 w-1/5 sm:w-1/6">Year</th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {sortedPlayers.length > 0 ? (
                        sortedPlayers.map((player, index) => {
                            // set row style based on number of awards
                            let rowClass = "text-nowrap text-[.75rem] md:text-[1.25rem] border-t group border border-solid ";
                            if (player.hasMultipleAwards) {
                                rowClass += 'bg-red-300';
                            } else if (player.hasAward) {
                                rowClass += 'bg-yellow-400';
                            } else {
                                rowClass += 'bg-white';
                            }

                            return (
                                <tr
                                    key={index}
                                    className={`${rowClass} border-slate-300 border-black/10`}>
                                    <td className="px-2 py-2">{rankOffset + index + 1}</td>
                                    <td className="px-2 py-2 group-hover:font-semibold flex items-center justify-center gap-2">
                                        <Link href={`/player/${player.ID}`} className="hover:underline">
                                            {player.Player ?? 'N/A'}
                                        </Link>
                                        {mode === 'single-season' && player.Champion && (
                                            // render a single trophy next to name if player is a champion in single-season mode
                                            <HiTrophy className="text-black" title="Jagr Cup Champion" />
                                        )}
                                        {mode === 'all-time' && (player.ChampionshipsWon ?? 0) > 0 && (
                                            Array.from({ length: player.ChampionshipsWon ?? 0 }).map((_, i) => (
                                                // render a trophy for each championship a player has won in all-time mode
                                                <HiTrophy key={i} className="text-yellow-500 text-[.7rem] lg:text-[1rem]" title="Jagr Cup Champion" />
                                            ))
                                        )}
                                    </td>
                                    <td className="px-2 py-2">{player.Position}</td>
                                    <td className="px-2 py-2 group-hover:font-semibold">{player.FPts}</td>
                                    {mode === 'single-season' && ( // FP/G not displayed in all-time mode
                                        <td className="px-2 py-2 group-hover:font-semibold">{player.FPG}</td>
                                    )}
                                    {mode === 'single-season' && ( // year not displayed in all-time mode
                                        <td className="px-2 py-2">{player.Year}</td>
                                    )}
                                </tr>
                            );
                        })
                    ) : (
                        <tr>
                            <td colSpan={mode === 'single-season' ? 6 : 5} className="px-2 py-2 text-center text-slate-500">
                                No results found
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};

export default StatTable;