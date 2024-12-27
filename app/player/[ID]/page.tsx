'use client';

import { useEffect, useState } from 'react';
import CareerTable from '@/components/career-table';
import TrophyCase from '@/components/trophy-case';
import { motion } from 'framer-motion';

interface PlayerStats {
    Player: string;
    FPts: number;
    FPG: number;
    Year: number;
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

    return (
        <main className="relative overflow-hidden z-10 flex flex-col gap-y-4 items-center pt-2 text-center">
            <motion.div
                className="flex flex-col w-full items-center"
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <h1 className="text-3xl font-semibold mb-0">{playerName}&apos;s Career Stats</h1>
                {loading ? (
                    <div>Loading...</div>
                ) : (
                    <>
                        {playerID && <CareerTable playerID={playerID} />}
                        {playerID && <TrophyCase playerID={playerID} />}
                    </>
                )}
            </motion.div>
        </main>
    );
}