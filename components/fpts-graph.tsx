'use client';

import React, { useState } from 'react';
import { Area, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AwardLegend from '@/components/award-legend';
import { formatFpts, seasonLabel } from '@/lib/league';

interface CareerStats {
    Year: number;
    FPts: number;
    FPG: number;
    YOFHLTeam: string;
    Champion?: boolean;
}

interface FPtsGraphProps {
    playerStats: CareerStats[];
    className?: string;
}

interface ChartPoint {
    season: string;
    fpts: number;
    fpg: number;
    team: string;
    champion: boolean;
}

interface TooltipPayload {
    value: number;
    payload: ChartPoint;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipPayload[];
    showFPG: boolean;
}

interface DotProps {
    cx?: number;
    cy?: number;
    index?: number;
    payload?: ChartPoint;
}

// Custom tooltip to show more details
const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, showFPG }) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload;
    return (
        <div className="rounded-2xl border border-line bg-white px-3.5 py-3 shadow-[0_16px_32px_-16px_rgba(31,39,69,.45)]">
            <p className="tabular font-extrabold">{point.season}{point.champion && <span className="ml-2 text-xs font-bold uppercase tracking-[.1em] text-rink-red">Jagr Cup</span>}</p>
            <p className="tabular mt-1 font-bold text-rink-blue">{showFPG ? `${point.fpg.toFixed(2)} FP/G` : `${formatFpts(point.fpts)} FPts`}</p>
            <p className="tabular text-sm text-ink-muted">{showFPG ? `${formatFpts(point.fpts)} FPts` : `${point.fpg.toFixed(2)} FP/G`}</p>
            <p className="text-sm text-ink-muted">{point.team}</p>
        </div>
    );
};

const FPtsGraph: React.FC<FPtsGraphProps> = ({ playerStats, className = '' }) => {
    const [showFPG, setShowFPG] = useState(false);

    // Sort data by year to ensure proper line progression
    const sortedData = [...playerStats].sort((a, b) => a.Year - b.Year);

    // Find the first year with non-zero points
    const firstNonZeroIndex = sortedData.findIndex(stat => stat.FPts !== 0 || stat.FPG !== 0);

    // Filter out leading zeros - keep data from first non-zero point onwards
    const filteredData = firstNonZeroIndex >= 0
        ? sortedData.slice(firstNonZeroIndex)
        : sortedData;

    const chartData: ChartPoint[] = filteredData.map(stat => ({
        season: seasonLabel(stat.Year).replace(/^\d{2}/, ''),
        fpts: stat.FPts,
        fpg: stat.FPG,
        team: stat.YOFHLTeam,
        champion: !!stat.Champion,
    }));

    if (chartData.length === 0) {
        return (
            <section className={`rounded-3xl border border-line bg-white p-6 text-center text-ink-muted shadow-card ${className}`}>
                No data available to display
            </section>
        );
    }

    // Calculate stats based on current view
    const key = showFPG ? 'fpg' : 'fpts';
    const values = chartData.map(d => d[key]);
    const careerHigh = Math.max(...values);
    const careerAverage = values.reduce((sum, val) => sum + val, 0) / values.length;
    const peakIndex = values.indexOf(careerHigh);
    const fmt = (v: number) => (showFPG ? v.toFixed(2) : formatFpts(v));

    // champion seasons get a red dot, the career high gets its value printed above it
    const renderDot = ({ cx, cy, index, payload }: DotProps) => {
        if (cx == null || cy == null || !payload) return <g key={index} />;
        return (
            <g key={index}>
                <circle cx={cx} cy={cy} r={payload.champion ? 8 : 6} fill={payload.champion ? '#C8102E' : '#1F6FC2'} stroke="#FFFFFF" strokeWidth={2} />
                {index === peakIndex && (
                    <text x={cx} y={cy - 14} textAnchor="middle" fontSize={12} fontWeight={800} fill="#12182E">{fmt(careerHigh)}</text>
                )}
            </g>
        );
    };

    const toggle = (active: boolean) =>
        `inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-bold transition-colors ${active ? 'bg-white text-ink shadow-[0_1px_2px_rgba(18,24,46,.12),0_0_0_1px_#DCE5EE]' : 'text-ink-muted hover:text-ink'}`;

    return (
        <section className={`flex flex-col rounded-3xl border border-line bg-white p-4 shadow-card md:p-6 ${className}`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-wide m-0 text-lg font-extrabold uppercase max-lg:sr-only">{showFPG ? 'FP/G' : 'Fantasy Points'}</h2>
                <div className="flex gap-1 rounded-2xl bg-line-soft p-1" role="group" aria-label="Chart metric">
                    <button type="button" onClick={() => setShowFPG(false)} className={toggle(!showFPG)} aria-pressed={!showFPG}>FPts</button>
                    <button type="button" onClick={() => setShowFPG(true)} className={toggle(showFPG)} aria-pressed={showFPG}>FP/G</button>
                </div>
            </div>

            <AwardLegend cupDot={chartData.some((d) => d.champion)} className="mb-1" />

            {/* grows to match the trophy case beside it on desktop */}
            <div className="relative min-h-[260px] flex-1">
                <div className="absolute inset-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 26, right: 12, left: -8, bottom: 0 }}>
                            <defs>
                                <linearGradient id="fpts-area" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0" stopColor="#3D8BDA" stopOpacity={0.18} />
                                    <stop offset="1" stopColor="#3D8BDA" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke="#E6EDF4" />
                            <XAxis dataKey="season" tickLine={false} axisLine={{ stroke: '#DCE5EE' }} tick={{ fill: '#56627A', fontSize: 11 }} interval={0} />
                            <YAxis tickLine={false} axisLine={false} tick={{ fill: '#6B778E', fontSize: 11 }} width={44} />
                            <Tooltip content={<CustomTooltip showFPG={showFPG} />} cursor={{ stroke: '#C9D6E3', strokeDasharray: '4 4' }} />
                            <Area type="monotone" dataKey={key} stroke="none" fill="url(#fpts-area)" isAnimationActive={false} />
                            <Line
                                type="monotone"
                                dataKey={key}
                                stroke="#1F6FC2"
                                strokeWidth={3}
                                dot={renderDot}
                                activeDot={{ r: 8, fill: '#1F6FC2', stroke: '#FFFFFF', strokeWidth: 2 }}
                                animationDuration={900}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Summary stats */}
            <dl className="mt-3 grid grid-cols-3 border-t border-line-soft pt-3 text-center">
                <div><dt className="text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted">Career High</dt><dd className="tabular mt-1 font-extrabold">{fmt(careerHigh)}</dd></div>
                <div><dt className="text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted">Average</dt><dd className="tabular mt-1 font-extrabold">{fmt(careerAverage)}</dd></div>
                <div><dt className="text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted">Seasons</dt><dd className="tabular mt-1 font-extrabold">{chartData.length}</dd></div>
            </dl>
        </section>
    );
};

export default FPtsGraph;
