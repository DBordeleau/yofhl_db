'use client';

import React, { FC, useEffect, useState } from 'react';

interface Award {
    Award: string;
    Year: number;
}

interface TrophyCaseProps {
    playerID: string;
}

// currently used to display player award data on their career page at /player/[ID]
const TrophyCase: FC<TrophyCaseProps> = ({ playerID }) => {
    const [awards, setAwards] = useState<Award[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchAwards = async () => {
            try {
                const response = await fetch(`/api/player/${playerID}`);
                if (!response.ok) {
                    throw new Error('Failed to fetch awards');
                }
                const data = await response.json();
                setAwards(data.awards || []);
            } catch (error: unknown) {
                if (error instanceof Error) {
                    setError(error.message);
                } else {
                    setError('An unknown error occurred');
                }
            }
        };

        fetchAwards();
    }, [playerID]);

    if (error) return <div>{error}</div>;

    return (
        <div className="items-center w-full max-w-7xl mb-4">
            <h2 className="text-2xl font-semibold mb-4">Trophy Case</h2>
            {awards.length > 0 ? (
                <table className="shadow-md mb-4 border border-collapse border-solid border-slate-400 text-center table-auto text-slate-800 w-full">
                    <thead>
                        <tr className="text-black text-[.9rem] md:text-[1.25rem] border border-solid border-slate-400 bg-yellow-400">
                            <th className="px-2 py-2 w-1/4">Year</th>
                            <th className="px-2 py-2 w-3/4">Award</th>
                        </tr>
                    </thead>
                    <tbody>
                        {awards.map((award, index) => (
                            <tr
                                key={index}
                                className="text-[.9rem] bg-white md:text-[1.25rem] border-t group border border-solid border-slate-300"
                            >
                                <td className="px-2 py-2">{award.Year}</td>
                                <td className="px-2 py-2">{award.Award}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <div className="text-slate-500">Player has never won an individual award.</div>
            )}
        </div>
    );
};

export default TrophyCase;
