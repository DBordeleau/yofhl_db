import { FC, useEffect, useState } from 'react';
import { HiTrophy } from 'react-icons/hi2';
import Link from 'next/link';

// move to /lib/utils/types ?
interface CareerStats {
    Year: number;
    Position: string;
    YOFHLTeam: string;
    FPts: number;
    FPG: string;
    Champion?: boolean;
    TeamID: number | null;
}

interface CareerTableProps {
    playerID: string;
}

// contains a given player's career stats. Rendered at /player/[ID]
const CareerTable: FC<CareerTableProps> = ({ playerID }) => {
    const [careerStats, setCareerStats] = useState<CareerStats[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [sortKey, setSortKey] = useState<keyof CareerStats>('Year');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    useEffect(() => {
        const fetchCareerStats = async () => {
            try {
                const response = await fetch(`/api/player/${playerID}`);
                if (!response.ok) {
                    throw new Error('Failed to fetch career stats');
                }
                const data = await response.json();
                setCareerStats(data.playerStats || []);
            } catch (error) {
                if (error instanceof Error) {
                    setError(error.message);
                } else {
                    setError('An unknown error occurred');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchCareerStats();
    }, [playerID]);

    if (loading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>{error}</div>;
    }

    const handleSort = (key: keyof CareerStats) => {
        const newSortOrder = sortKey === key && sortOrder === 'asc' ? 'desc' : 'asc';
        setSortKey(key);
        setSortOrder(newSortOrder);

        const sortedStats = [...careerStats].sort((a, b) => {
            if (key === 'FPG') {
                const aValue = parseFloat(a[key] ?? '0');
                const bValue = parseFloat(b[key] ?? '0');
                return newSortOrder === 'asc' ? aValue - bValue : bValue - aValue;
            } else {
                const aValue = a[key] ?? 0;
                const bValue = b[key] ?? 0;
                if (aValue < bValue) return newSortOrder === 'asc' ? -1 : 1;
                if (aValue > bValue) return newSortOrder === 'asc' ? 1 : -1;
                return 0;
            }
        });

        setCareerStats(sortedStats);
    };

    if (error) {
        return <div>{error}</div>;
    }

    const totalFPts = careerStats?.reduce((acc, stat) => acc + stat.FPts, 0) || 0;
    const averageFPG =
        (careerStats?.reduce((acc, stat) => acc + parseFloat(stat.FPG), 0) || 0) /
        (careerStats?.length || 1);

    return (
        <div className="flex flex-col items-center w-full max-w-7xl h-fit mb-8 overflow-y-scroll overflow-x-auto rounded-b-lg mx-auto">
            <table className="shadow-md mb-4 border border-collapse border-solid border-slate-400 items-center text-center table-auto text-slate-800 w-full">
                <thead>
                    <tr className="text-black text-nowrap text-[.9rem] md:text-[1.25rem] border border-solid border-slate-400 bg-sky-300">
                        <th
                            className="px-2 py-2 w-1/12 cursor-pointer"
                            onClick={() => handleSort('Year')}
                        >
                            Year {sortKey === 'Year' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th className="px-2 py-2 w-1/4 sm:w-1/4">Team</th>
                        <th
                            className="px-2 py-2 w-1/5 sm:w-1/5 cursor-pointer"
                            onClick={() => handleSort('FPts')}
                        >
                            Total Fpts {sortKey === 'FPts' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                        <th
                            className="px-2 py-2 w-1/5 sm:w-1/5 cursor-pointer"
                            onClick={() => handleSort('FPG')}
                        >
                            FP/G {sortKey === 'FPG' && (sortOrder === 'asc' ? '↑' : '↓')}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {careerStats.length > 0 ? (
                        careerStats
                            .filter((stat) => stat.FPts > 0 || stat.YOFHLTeam !== 'FA')
                            .map((stat, index) => (
                                <tr
                                    key={index}
                                    className="text-[.9rem] bg-white md:text-[1.25rem] border-t group border border-solid border-slate-300"
                                >
                                    <td className="px-2 py-2 flex justify-center items-center">
                                        <span>{stat.Year}</span>
                                        {stat.Champion && (
                                            <HiTrophy className="ml-2 text-yellow-500" title="Champion" />
                                        )}
                                    </td>
                                    <td className="px-2 py-2">
                                        {stat.TeamID ? (
                                            <Link href={`/teams/${stat.TeamID}`} className="hover:underline">{stat.YOFHLTeam}</Link>
                                        ) : (
                                            stat.YOFHLTeam
                                        )}
                                    </td>
                                    <td className="px-2 py-2">{stat.FPts}</td>
                                    <td className="px-2 py-2">{stat.FPG}</td>
                                </tr>
                            ))
                    ) : (
                        <tr>
                            <td colSpan={5} className="px-2 py-2 text-center text-slate-500">
                                No career stats available
                            </td>
                        </tr>
                    )}
                </tbody>
                <tfoot>
                    <tr className="bg-white text-black text-[.9rem] md:text-[1.25rem] border border-solid border-slate-400">
                        <td colSpan={2} className="px-2 py-2 font-semibold text-right">
                            Total Career Stats
                        </td>
                        <td className="px-2 py-2 font-semibold">{totalFPts}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
};

export default CareerTable;
