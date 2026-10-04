'use client';

import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FranchiseSeason } from '@/lib/data/league';
import { formatFpts, seasonLabel, winPercentage } from '@/lib/league';

export default function FranchisePerformance({ seasons, championships }: { seasons: FranchiseSeason[]; championships: number[] }) {
    const [metric, setMetric] = useState<'record' | 'points'>('record');
    const data = [...seasons].reverse().map((season) => ({
        ...season,
        label: seasonLabel(season.year).slice(2),
        winPct: winPercentage(season),
        champion: championships.includes(season.year),
    }));

    return (
        <section className="min-w-0 rounded-3xl border border-line bg-white p-4 shadow-card md:p-6" aria-labelledby="performance-title">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 id="performance-title" className="font-wide text-lg font-extrabold uppercase">Season performance</h2>
                <div className="flex gap-1 rounded-xl bg-line-soft p-1" role="group" aria-label="Team chart metric">
                    {(['record', 'points'] as const).map((value) => (
                        <button key={value} type="button" onClick={() => setMetric(value)} aria-pressed={metric === value} className={`min-h-11 rounded-lg px-3 text-sm font-bold transition-colors ${metric === value ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}>
                            {value === 'record' ? 'Win %' : 'Points'}
                        </button>
                    ))}
                </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-ink-muted">
                {metric === 'record' ? <span>Regular season · ties count as half a win</span> : <>
                    <span className="flex items-center gap-2"><span className="h-0.5 w-4 bg-rink-blue" />Points for</span>
                    <span className="flex items-center gap-2"><span className="w-4 border-t-2 border-dashed border-rink-red" />Points against</span>
                </>}
            </div>
            <div className="h-[260px]" role="group" aria-label={`Season-by-season ${metric === 'record' ? 'win percentage' : 'points for and against'}. Exact values are in the season history below.`}>
                <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -12 }} accessibilityLayer>
                        <CartesianGrid vertical={false} stroke="#E6EDF4" />
                        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#DCE5EE' }} tick={{ fill: '#56627A', fontSize: 11 }} minTickGap={20} />
                        <YAxis domain={metric === 'record' ? [0, 100] : [0, 'auto']} tickLine={false} axisLine={false} tick={{ fill: '#56627A', fontSize: 11 }} tickFormatter={(v: number) => metric === 'record' ? `${v}%` : v.toLocaleString('en-US')} width={60} />
                        {metric === 'record' && <ReferenceLine y={50} stroke="#9FB0C8" strokeDasharray="4 4" />}
                        <Tooltip cursor={{ stroke: '#C9D6E3', strokeDasharray: '4 4' }} content={({ active, payload }) => {
                            const point = payload?.[0]?.payload as typeof data[number] | undefined;
                            if (!active || !point) return null;
                            return (
                                <div className="rounded-2xl border border-line bg-white p-3 text-sm shadow-card">
                                    <p className="font-extrabold">{seasonLabel(point.year)}{point.champion && <span className="ml-2 text-gold-deep">Jagr Cup</span>}</p>
                                    <p className="mt-1 text-ink-muted">{point.wins}–{point.losses}–{point.ties} · {point.winPct.toFixed(1)}%</p>
                                    <p className="mt-1 font-bold text-rink-blue">{formatFpts(point.fptsFor)} PF</p>
                                    <p className="font-bold text-rink-red">{formatFpts(point.fptsAgainst)} PA</p>
                                </div>
                            );
                        }} />
                        <Line key={metric} type="linear" dataKey={metric === 'record' ? 'winPct' : 'fptsFor'} stroke="#1F6FC2" strokeWidth={3} dot={{ r: 4, fill: '#1F6FC2', stroke: '#FFF', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
                        {metric === 'points' && <Line type="linear" dataKey="fptsAgainst" stroke="#C8102E" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: '#C8102E' }} isAnimationActive={false} />}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </section>
    );
}
