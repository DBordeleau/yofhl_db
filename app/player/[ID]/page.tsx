'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CareerTable from '@/components/career-table';
import TrophyCase from '@/components/trophy-case';
import FPtsGraph from '@/components/fpts-graph';
import { motion } from 'framer-motion';
import { FaChartLine } from 'react-icons/fa';

interface PlayerStats {
    Player: string;
    FPts: number;
    FPG: number;
    Year: number;
    YOFHLTeam: string;
}

// displays career stats in a table for a given player ID at /player/[ID]
export default function PlayerPage({
    params,
}: {
    params: Promise<{ ID: string }>;
}) {
    const [playerStats, setPlayerStats] = useState<PlayerStats[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [playerID, setPlayerID] = useState<string | null>(null);
    const router = useRouter();

    // fetch player's career stats from /api/player/[ID]
    useEffect(() => {
        const fetchPlayerData = async () => {
            const resolvedParams = await params;
            if (!resolvedParams.ID) return;

            setPlayerID(resolvedParams.ID);
            setLoading(true);
            try {
                const res = await fetch(`/api/player/${resolvedParams.ID}`);
                if (!res.ok) throw new Error('Failed to fetch player data');
                const data = await res.json();
                setPlayerStats(data.playerStats || []);
            } catch (error) {
                console.error('Error fetching player stats:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchPlayerData();
    }, [params]);

    const playerName = playerStats?.[0]?.Player || 'Unknown Player';

    const handleCompare = () => {
        if (playerID && playerName) {
            // Store player data in sessionStorage
            sessionStorage.setItem('comparePlayer', JSON.stringify({
                ID: playerID,
                Player: playerName
            }));
            router.push('/compare');
        }
    };

    return (
        <main className="relative overflow-hidden z-10 flex flex-col gap-y-4 items-center pt-2 text-center">
            <motion.div
                className="flex flex-col w-full items-center"
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="flex items-center gap-4 mb-2">
                    <h1 className="text-3xl font-semibold">{playerName}&apos;s Career Stats</h1>
                    {playerID && !loading && (
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleCompare}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-md transition-colors"
                            title="Compare this player with others"
                        >
                            <FaChartLine />
                            <span>Compare</span>
                        </motion.button>
                    )}
                </div>
                {loading ? (
                    <div>Loading...</div>
                ) : (
                    <>
                        {playerID && <CareerTable playerID={playerID} />}
                        {playerStats && playerStats.length > 0 && (
                            <FPtsGraph playerStats={playerStats} playerName={playerName} />
                        )}
                        {playerID && <TrophyCase playerID={playerID} />}
                    </>
                )}
            </motion.div>
        </main>
    );
}