'use client';

import { useEffect, useState } from 'react';
import React from 'react';
import AwardTable from '@/components/award-table';
import { motion } from 'framer-motion';

type Award = {
    Award: string;
    Year: number;
    Winner: string;
    Team: string;
    PlayerID: number | null;
};

// renders table of winners for a given award at /awards/[award]
export default function AwardPage({
    params,
}: {
    params: Promise<{ award: string }>;
}) {
    const [awardsData, setAwardsData] = useState<Award[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [award, setAward] = useState<string>('');

    useEffect(() => {
        const fetchParams = async () => {
            const resolvedParams = await params;
            setAward(resolvedParams.award);
        };

        fetchParams();
    }, [params]);

    const formattedAward = award.replace(/_/g, ' ');

    useEffect(() => {
        const fetchAwards = async () => {
            setLoading(true);
            setError(null);

            try {
                const res = await fetch(`/api/awards/${formattedAward}`);
                const data = await res.json();

                if (res.ok && Array.isArray(data)) {
                    setAwardsData(data);
                } else {
                    throw new Error(data.message || 'Unknown error');
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An unknown error occurred');
                setAwardsData([]);
            } finally {
                setLoading(false);
            }
        };

        if (award) {
            fetchAwards();
        }
    }, [formattedAward, award]);

    return (
        <div className="flex flex-col items-center p-4">
            <h1 className="text-[1rem] md:text-3xl mb-2 -mt-2 font-semibold">
                {formattedAward.toUpperCase()} RECIPIENTS
            </h1>
            <div className="flex justify-center">
                <motion.div
                    className="flex flex-col w-full items-center"
                    initial={{ opacity: 0, y: 100 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    {loading ? (
                        <p>Loading...</p>
                    ) : error ? (
                        <p>Error: {error}</p>
                    ) : (
                        <AwardTable awardsData={awardsData} />
                    )}
                </motion.div>
            </div>
        </div>
    );
}