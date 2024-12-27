'use client';

import { useEffect, useState } from 'react';
import StatTable from '@/components/stat-table';
import { motion } from 'framer-motion';

// renders championship rosters at /champions/[year]
export default function ChampionsPage({ params }: { params: Promise<{ year: string }> }) {
    const [champions, setChampions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [year, setYear] = useState<string | null>(null);

    useEffect(() => {
        const fetchYear = async () => {
            const resolvedParams = await params;
            if (resolvedParams.year) {
                setYear(resolvedParams.year);
            }
        };
        fetchYear();
    }, [params]);

    useEffect(() => {
        if (!year) return;

        const fetchChampions = async () => {
            setLoading(true);
            setError(null);

            try {
                if (year) {
                    const response = await fetch(`/api/champions/${year}`);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch champions: ${response.statusText}`);
                    }
                    const data = await response.json();
                    setChampions(data);
                }
            } catch (err: unknown) {
                if (err instanceof Error) {
                    setError(err.message);
                } else {
                    setError('Something went wrong');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchChampions();
    }, [year]);

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;
    if (champions.length === 0) return <div>No champions found for the year {year}.</div>;

    return (
        <div>
            <h1 className="xs:text-[1rem] md:text-xl font-bold mb-4 text-center">
                Jagr Cup Championship Roster - {parseInt(year!) - 1} - {year}
            </h1>
            <motion.div
                className="flex flex-col w-full items-center"
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <StatTable topPlayers={champions} mode="champions" />
            </motion.div>
        </div>
    );
}