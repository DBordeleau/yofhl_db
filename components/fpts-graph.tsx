'use client';

import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';

interface CareerStats {
    Year: number;
    FPts: number;
    FPG: number;
    YOFHLTeam: string;
}

interface FPtsGraphProps {
    playerStats: CareerStats[];
    playerName: string;
}

const FPtsGraph: React.FC<FPtsGraphProps> = ({ playerStats, playerName }) => {
    const [showFPG, setShowFPG] = useState(false); // Toggle state

    // Sort data by year to ensure proper line progression
    const sortedData = [...playerStats].sort((a, b) => a.Year - b.Year);

    // Format data for recharts
    const chartData = sortedData.map(stat => ({
        year: stat.Year.toString(),
        fpts: stat.FPts,
        fpg: stat.FPG,
        team: stat.YOFHLTeam
    }));

    // Custom tooltip to show more details
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-lg">
                    <p className="font-semibold">{`Season: ${payload[0].payload.year}`}</p>
                    <p className="text-blue-600">
                        {showFPG
                            ? `FPG: ${payload[0].value}`
                            : `Fantasy Points: ${payload[0].value.toFixed(2)}`
                        }
                    </p>
                    <p className="text-gray-600">
                        {showFPG
                            ? `Total FPts: ${payload[0].payload.fpts.toFixed(2)}`
                            : `FPG: ${payload[0].payload.fpg}`
                        }
                    </p>
                    <p className="text-sm text-gray-500">{`Team: ${payload[0].payload.team}`}</p>
                </div>
            );
        }
        return null;
    };

    if (!playerStats || playerStats.length === 0) {
        return (
            <div className="w-full max-w-4xl p-4 text-center text-gray-500">
                No data available to display
            </div>
        );
    }

    // Calculate stats based on current view
    const currentData = chartData.map(d => showFPG ? d.fpg : d.fpts);
    const careerHigh = Math.max(...currentData);
    const careerAverage = currentData.reduce((sum, val) => sum + val, 0) / currentData.length;

    return (
        <motion.div
            className="w-full max-w-4xl mb-6 p-4 bg-white rounded-lg shadow-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                    {playerName}&apos;s {showFPG ? 'Fantasy Points per Game' : 'Fantasy Points'} by Season
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

            <ResponsiveContainer width="100%" height={400}>
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
                        height={36}
                        formatter={() => showFPG ? 'FPG' : 'Fantasy Points'}
                    />
                    <Line
                        type="monotone"
                        dataKey={showFPG ? "fpg" : "fpts"}
                        stroke="#2563eb"
                        strokeWidth={3}
                        dot={{ fill: '#2563eb', r: 5 }}
                        activeDot={{ r: 8 }}
                        name={showFPG ? "FPG" : "Fantasy Points"}
                    />
                </LineChart>
            </ResponsiveContainer>

            {/* Summary stats */}
            <div className="mt-4 flex justify-around text-sm text-gray-600 border-t pt-3">
                <div className="text-center">
                    <p className="font-semibold">Career High</p>
                    <p className="text-blue-600">
                        {showFPG ? careerHigh.toFixed(2) : careerHigh.toFixed(2)} {showFPG ? 'FPG' : 'pts'}
                    </p>
                </div>
                <div className="text-center">
                    <p className="font-semibold">Career Average</p>
                    <p className="text-blue-600">
                        {careerAverage.toFixed(2)} {showFPG ? 'FPG' : 'pts'}
                    </p>
                </div>
                <div className="text-center">
                    <p className="font-semibold">Seasons Played</p>
                    <p className="text-blue-600">{chartData.length}</p>
                </div>
            </div>
        </motion.div>
    );
};

export default FPtsGraph;