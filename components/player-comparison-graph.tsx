'use client';

import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';

interface PlayerStats {
    Year: number;
    FPts: number;
    FPG: number;
    YOFHLTeam: string;
    Player: string;
}

interface PlayerComparisonGraphProps {
    playersData: Record<string, PlayerStats[]>;
    playerNames: Record<string, string>;
}

interface ChartDataPoint {
    year: string;
    [key: string]: string | number | null;
}

interface TooltipPayload {
    color: string;
    value: number;
    dataKey: string;
    payload: ChartDataPoint;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipPayload[];
}

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ec4899'];

const PlayerComparisonGraph: React.FC<PlayerComparisonGraphProps> = ({ playersData, playerNames }) => {
    const [showFPG, setShowFPG] = useState(false);

    // Find common years (years where all players have data)
    const getCommonYears = () => {
        const playerYears = Object.values(playersData).map(stats =>
            new Set(stats.map(s => s.Year))
        );

        if (playerYears.length === 0) return [];

        // Find intersection of all year sets
        const commonYears = Array.from(playerYears[0]).filter(year =>
            playerYears.every(yearSet => yearSet.has(year))
        );

        return commonYears.sort((a, b) => a - b);
    };

    const commonYears = getCommonYears();

    // Find the first non-zero year for each player
    const getFirstNonZeroYear = (playerID: string): number | null => {
        const stats = playersData[playerID];
        const sortedStats = [...stats].sort((a, b) => a.Year - b.Year);

        const firstNonZero = sortedStats.find(s => s.FPts !== 0 || s.FPG !== 0);
        return firstNonZero ? firstNonZero.Year : null;
    };

    const firstNonZeroYears: Record<string, number | null> = {};
    Object.keys(playersData).forEach(playerID => {
        firstNonZeroYears[playerID] = getFirstNonZeroYear(playerID);
    });

    // Prepare chart data
    const chartData: ChartDataPoint[] = commonYears.map(year => {
        const dataPoint: ChartDataPoint = { year: year.toString() };

        Object.entries(playersData).forEach(([playerID, stats]) => {
            const yearStats = stats.find(s => s.Year === year);
            const firstYear = firstNonZeroYears[playerID];

            if (yearStats) {
                // Only include data if we've reached the first non-zero year
                if (firstYear === null || year < firstYear) {
                    // Before first non-zero year, set to null (won't render)
                    dataPoint[`${playerID}_fpts`] = null;
                    dataPoint[`${playerID}_fpg`] = null;
                } else {
                    // After first non-zero year, include all data (even zeros)
                    dataPoint[`${playerID}_fpts`] = yearStats.FPts;
                    dataPoint[`${playerID}_fpg`] = yearStats.FPG;
                    dataPoint[`${playerID}_team`] = yearStats.YOFHLTeam;
                }
            }
        });

        return dataPoint;
    });

    // Custom tooltip
    const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
        if (active && payload && payload.length) {
            // Filter out null entries and sort by value (descending)
            const sortedPayload = payload
                .filter(entry => entry.value !== null)
                .sort((a, b) => (b.value || 0) - (a.value || 0));

            if (sortedPayload.length === 0) return null;

            return (
                <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-lg">
                    <p className="font-semibold mb-2">{`Season: ${sortedPayload[0].payload.year}`}</p>
                    {sortedPayload.map((entry, index) => {
                        return (
                            <div key={index} className="mb-1">
                                <p style={{ color: entry.color }} className="font-medium">
                                    {playerNames[entry.dataKey.split('_')[0]]}
                                </p>
                                <p className="text-sm text-gray-600">
                                    {showFPG ? `FPG: ${entry.value}` : `FPts: ${entry.value.toFixed(2)}`}
                                </p>
                            </div>
                        );
                    })}
                </div>
            );
        }
        return null;
    };

    if (commonYears.length === 0) {
        return (
            <div className="w-full max-w-4xl p-4 text-center text-gray-500 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="font-semibold">No overlapping seasons found</p>
                <p className="text-sm mt-2">The selected players don&apos;t have any seasons where they all played.</p>
            </div>
        );
    }

    return (
        <motion.div
            className="w-full max-w-4xl mb-6 p-4 bg-white rounded-lg shadow-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                    Player Comparison - {showFPG ? 'Fantasy Points per Game' : 'Fantasy Points'}
                </h2>

                {/* Toggle Button */}
                <div className="flex gap-2 bg-gray-100 rounded-lg p-1">
                    <button
                        onClick={() => setShowFPG(false)}
                        className={`px-4 py-2 rounded-md transition-all ${!showFPG
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-transparent text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        FPts
                    </button>
                    <button
                        onClick={() => setShowFPG(true)}
                        className={`px-4 py-2 rounded-md transition-all ${showFPG
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-transparent text-gray-600 hover:bg-gray-200'
                            }`}
                    >
                        FPG
                    </button>
                </div>
            </div>

            <ResponsiveContainer width="100%" height={450}>
                <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                    <XAxis
                        dataKey="year"
                        label={{ value: 'Season', position: 'insideBottom', offset: -5 }}
                        tick={{ fill: '#666' }}
                    />
                    <YAxis
                        label={{
                            value: showFPG ? 'Fantasy Points per Game' : 'Fantasy Points',
                            angle: -90,
                            position: 'insideLeft'
                        }}
                        tick={{ fill: '#666' }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                        verticalAlign="top"
                        height={50}
                        formatter={(value) => {
                            const playerID = value.split('_')[0];
                            return playerNames[playerID];
                        }}
                    />
                    {Object.keys(playersData).map((playerID, index) => (
                        <Line
                            key={playerID}
                            type="monotone"
                            dataKey={showFPG ? `${playerID}_fpg` : `${playerID}_fpts`}
                            stroke={COLORS[index % COLORS.length]}
                            strokeWidth={3}
                            dot={{ fill: COLORS[index % COLORS.length], r: 5 }}
                            activeDot={{ r: 8 }}
                            name={`${playerID}_${showFPG ? 'fpg' : 'fpts'}`}
                            connectNulls={false}
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>

            {/* Comparison period info */}
            <div className="mt-4 text-center text-sm text-gray-600 border-t pt-3">
                <p>
                    Comparing {Object.keys(playersData).length} players over {commonYears.length} season{commonYears.length !== 1 ? 's' : ''} ({commonYears[0]} - {commonYears[commonYears.length - 1]})
                </p>
            </div>
        </motion.div>
    );
};

export default PlayerComparisonGraph;