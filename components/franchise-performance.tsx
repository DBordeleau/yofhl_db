'use client';

import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FranchiseSeason } from '@/lib/data/league';
import { formatFpts, seasonLabel, winPercentage } from '@/lib/league';
import styles from './franchise.module.css';

export default function FranchisePerformance({ seasons, championships, beside = true }: { seasons: FranchiseSeason[]; championships: number[]; beside?: boolean }) {
    const [metric, setMetric] = useState<'record' | 'points'>('record');
    const data = [...seasons].reverse().map((season) => ({
        ...season,
        label: seasonLabel(season.year).slice(2),
        winPct: winPercentage(season),
        champion: championships.includes(season.year),
    }));

    return (
        <div className={`flex min-w-0 flex-col border-b border-line-soft px-3 pb-3 pt-4 md:px-5 ${beside ? 'xl:border-b-0 xl:border-r' : ''}`}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                <div className={`${styles.tabs} ${styles.tabsSmall}`} role="group" aria-label="Team chart metric">
                    {(['record', 'points'] as const).map((value) => (
                        <button key={value} type="button" onClick={() => setMetric(value)} aria-pressed={metric === value}>
                            <span>{value === 'record' ? 'Win %' : 'Points'}</span>
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-ink-muted">
                    {metric === 'record' ? <span>Regular season</span> : <>
                        <span className="flex items-center gap-2"><span className="h-0.5 w-4 bg-rink-blue" />Points for</span>
                        <span className="flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-rink-red" />Points against</span>
                    </>}
                </div>
            </div>
            <div className={beside ? 'h-[210px] xl:h-auto xl:min-h-[240px] xl:flex-1' : 'h-[210px] 3xl:h-[260px]'} role="group" aria-label={`Season-by-season ${metric === 'record' ? 'win percentage' : 'points for and against'}. Exact values are in the table below.`}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -12 }} accessibilityLayer>
                        <CartesianGrid vertical={false} stroke="#E6EDF4" />
                        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#DCE5EE' }} tick={{ fill: '#56627A', fontSize: 11 }} minTickGap={20} />
                        <YAxis domain={metric === 'record' ? [0, 100] : [0, 'auto']} tickLine={false} axisLine={false} tick={{ fill: '#56627A', fontSize: 11 }} tickFormatter={(v: number) => metric === 'record' ? `${v}%` : v.toLocaleString('en-US')} width={60} />
                        {metric === 'record' && <ReferenceLine y={50} stroke="#9FB0C8" strokeDasharray="4 4" />}
                        <Tooltip cursor={{ stroke: '#C9D6E3', strokeDasharray: '4 4' }} content={({ active, payload }) => {
                            const point = payload?.[0]?.payload as typeof data[number] | undefined;
                            if (!active || !point) return null;
                            return (
                                <div className="rounded-md bg-[#101D32] px-3 py-2.5 text-sm text-white shadow-card">
                                    <p className="font-extrabold">{seasonLabel(point.year)}{point.champion && <span className="ml-2 text-gold-light">Jagr Cup</span>}</p>
                                    <p className="tabular mt-1 text-[#B9C6DA]">{point.wins}–{point.losses}–{point.ties} · {point.winPct.toFixed(1)}%</p>
                                    <p className="tabular mt-1 font-bold text-[#C3E3F7]">{formatFpts(point.fptsFor)} PF</p>
                                    <p className="tabular font-bold text-[#FF8FA0]">{formatFpts(point.fptsAgainst)} PA</p>
                                </div>
                            );
                        }} />
                        <Line key={metric} type="linear" dataKey={metric === 'record' ? 'winPct' : 'fptsFor'} stroke="#1F6FC2" strokeWidth={3}
                            dot={(props: { cx?: number; cy?: number; index?: number; payload?: typeof data[number] }) => {
                                const { cx = 0, cy = 0, index, payload } = props;
                                return payload?.champion
                                    ? <circle key={index} cx={cx} cy={cy} r={6} fill="#F0C75E" stroke="#8A6410" strokeWidth={2} />
                                    : <circle key={index} cx={cx} cy={cy} r={4} fill="#1F6FC2" stroke="#FFF" strokeWidth={2} />;
                            }}
                            activeDot={{ r: 6 }} isAnimationActive={false} />
                        {metric === 'points' && <Line type="linear" dataKey="fptsAgainst" stroke="#C8102E" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: '#C8102E' }} isAnimationActive={false} />}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
