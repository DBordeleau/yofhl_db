'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { seasonLabel, formatFpts } from '@/lib/league';
import type { Metric } from '@/lib/compare/state';
import type { ComparisonChart } from '@/lib/compare/model';
export { COMPARE_COLORS } from '@/lib/compare/model';

export default function PlayerComparisonGraph({ chart, onMetricChange }: { chart: ComparisonChart; onMetricChange: (metric: Metric) => void }) {
    const data = chart.years.map((year, index) => ({ year: seasonLabel(year), ...Object.fromEntries(chart.series.map((series, i) => [`p${i}`, series.values[index]])) }));
    return <section className="mt-7 rounded-3xl border border-line bg-white p-4 shadow-card md:p-6" aria-label="Player comparison chart">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-wide text-lg font-extrabold">{chart.metric === 'fpg' ? 'Fantasy points per game' : 'Fantasy points'}</h2>
            <div className="flex gap-1 rounded-xl bg-line-soft p-1" role="group" aria-label="Chart metric">
                {(['fpts', 'fpg'] as const).map(metric => <button key={metric} type="button" onClick={() => onMetricChange(metric)} aria-pressed={metric === chart.metric}
                    className={`min-h-11 rounded-lg px-4 text-sm font-bold ${metric === chart.metric ? 'bg-ink text-white' : 'text-ink-muted'}`}>{metric === 'fpts' ? 'FPts' : 'FP/G'}</button>)}
            </div>
        </div>
        {chart.years.length ? <>
            <p className="mb-5 text-sm text-ink-muted">{chart.series.length} players over {chart.years.length} overlapping seasons. Missing values are gaps, not zeroes.</p>
            <div className="h-[320px] min-w-0 md:h-[400px]" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} accessibilityLayer={false} margin={{ top: 8, right: 8, left: 0, bottom: 6 }}>
                        <CartesianGrid vertical={false} stroke="#e6edf4" /><XAxis dataKey="year" tick={{ fill: '#56627a', fontSize: 11 }} minTickGap={25} />
                        <YAxis width={48} tick={{ fill: '#56627a', fontSize: 11 }} />
                        <Tooltip formatter={(value: number) => formatFpts(value)} /><Legend wrapperStyle={{ fontSize: 12 }} />
                        {chart.series.map((series, index) => <Line key={series.id} dataKey={`p${index}`} name={series.name} stroke={series.colour}
                            strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={false} />)}
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <details className="mt-5 border-t border-line pt-3">
                <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-rink-blue">View comparison values</summary>
                <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Comparison values">
                    <table className="w-full text-left text-sm"><caption className="sr-only">{chart.metric === 'fpts' ? 'Fantasy points' : 'Fantasy points per game'} in overlapping seasons</caption>
                        <thead><tr><th scope="col" className="p-3">Season</th>{chart.series.map(series => <th key={series.id} scope="col" className="p-3">{series.name}</th>)}</tr></thead>
                        <tbody>{chart.years.map((year, i) => <tr key={year} className="border-t border-line-soft"><th scope="row" className="whitespace-nowrap p-3">{seasonLabel(year)}</th>
                            {chart.series.map(series => <td key={series.id} className="p-3 tabular">{series.values[i] === null ? '—' : formatFpts(series.values[i]!)}</td>)}</tr>)}</tbody>
                    </table>
                </div>
            </details>
        </> : <div className="rounded-2xl border border-dashed border-line-strong p-6 text-center"><p className="font-bold">No overlapping seasons found</p><p className="mt-2 text-sm text-ink-muted">Choose players who have archive statistics in at least one shared season.</p></div>}
    </section>;
}
