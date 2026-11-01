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
        <div className="rounded-md border border-line bg-white px-3.5 py-3 shadow-[0_16px_32px_-16px_rgba(31,39,69,.45)]">
            <p className="tabular font-extrabold">{point.season}{point.champion && <span className="ml-2 text-xs font-bold uppercase tracking-[.1em] text-gold-deep">Jagr Cup</span>}</p>
            <p className="tabular mt-1 font-bold text-rink-blue">{showFPG ? `${point.fpg.toFixed(2)} FP/G` : `${formatFpts(point.fpts)} FPts`}</p>
            <p className="tabular text-sm text-ink-muted">{showFPG ? `${formatFpts(point.fpts)} FPts` : `${point.fpg.toFixed(2)} FP/G`}</p>
            <p className="text-sm text-ink-muted">{point.team}</p>
        </div>
    );
};

// the career line on /player/[ID], full width with its FPts / FP/G switch and a summary row
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

    const heading = <h2 className="text-2xl font-[850] leading-tight tracking-[-.04em] md:text-[27px] 3xl:text-[32px]">Fantasy points</h2>;

    if (chartData.length === 0) {
        return (
            <>
                <div className="mb-3.5">{heading}</div>
                <p className={`rounded-md border border-line bg-white p-6 text-center text-ink-muted ${className}`}>No data available to display</p>
            </>
        );
    }

    // Calculate stats based on current view
    const key = showFPG ? 'fpg' : 'fpts';
    const values = chartData.map(d => d[key]);
    const careerHigh = Math.max(...values);
    const careerAverage = values.reduce((sum, val) => sum + val, 0) / values.length;
    const peakIndex = values.indexOf(careerHigh);
    const fmt = (v: number) => (showFPG ? v.toFixed(2) : formatFpts(v));

    // champion seasons get a gold dot, the career high gets its value printed above it
    const renderDot = ({ cx, cy, index, payload }: DotProps) => {
        if (cx == null || cy == null || !payload) return <g key={index} />;
        return (
            <g key={index}>
                {payload.champion
                    ? <circle cx={cx} cy={cy} r={7} fill="#F0C75E" stroke="#8A6410" strokeWidth={2} />
                    : <circle cx={cx} cy={cy} r={5} fill="#FFFFFF" stroke="#1F6FC2" strokeWidth={3} />}
                {index === peakIndex && (
                    <text x={cx} y={cy - 14} textAnchor="middle" fontSize={13} fontWeight={800} fill="#12182E">{fmt(careerHigh)}</text>
                )}
            </g>
        );
    };

    const toggle = (active: boolean) =>
        `inline-flex min-h-10 items-center px-4 text-[13px] font-extrabold transition-colors focus-visible:outline focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-rink-line ${active ? 'bg-[#101D32] text-white' : 'text-ink-soft hover:bg-rink-wash hover:text-ink'}`;
    const summary = [
        { label: 'Career high', value: fmt(careerHigh) },
        { label: 'Average', value: fmt(careerAverage) },
        { label: 'Seasons', value: String(chartData.length) },
    ];

    return (
        <>
            <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
                {heading}
                <div className="inline-flex overflow-hidden rounded border border-line bg-white" role="group" aria-label="Chart measure">
                    <button type="button" onClick={() => setShowFPG(false)} className={toggle(!showFPG)} aria-pressed={!showFPG}>FPts</button>
                    <button type="button" onClick={() => setShowFPG(true)} className={`${toggle(showFPG)} border-l border-line`} aria-pressed={showFPG}>FP/G</button>
                </div>
            </div>

            <div className={`overflow-hidden rounded-md border border-line bg-white ${className}`}>
                <div className="px-3 pb-2 pt-4 md:px-5 md:pt-5">
                    <AwardLegend cupDot={chartData.some((d) => d.champion)} className="mb-1 px-1" />
                    <div className="h-[240px] md:h-[300px] 3xl:h-[380px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ top: 26, right: 24, left: -8, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="fpts-area" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0" stopColor="#3D8BDA" stopOpacity={0.18} />
                                        <stop offset="1" stopColor="#3D8BDA" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid vertical={false} stroke="#E6EDF4" />
                                <XAxis dataKey="season" tickLine={false} axisLine={{ stroke: '#DCE5EE' }} tick={{ fill: '#56627A', fontSize: 12 }} interval="equidistantPreserveStart" />
                                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#6B778E', fontSize: 12 }} width={44} />
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

                <dl className="grid grid-cols-3 border-t border-line-soft">
                    {summary.map((item, i) => (
                        <div key={item.label} className={`flex flex-col justify-between px-4 py-3.5 md:px-6 ${i ? 'border-l border-line-soft' : ''}`}>
                            <dt className="text-[11px] font-extrabold uppercase tracking-[.12em] text-ink-muted 3xl:text-xs">{item.label}</dt>
                            <dd className="tabular mt-1 text-lg font-black italic [font-stretch:85%] md:text-[22px] 3xl:text-[26px]">{item.value}</dd>
                        </div>
                    ))}
                </dl>
            </div>
        </>
    );
};

export default FPtsGraph;
