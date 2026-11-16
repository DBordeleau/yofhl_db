import Link from 'next/link';
import type { PublishedTally } from '@/lib/award-vote/create-award-vote';
import { seasonLabel } from '@/lib/league';

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

// one season's published tally on an award's page: every ranked candidate's place, points and votes at each rank
export default function PublishedTallyTable({ tally }: { tally: PublishedTally }) {
    const depth = tally.lines[0]?.votes.length ?? 0;
    return (
        <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink px-3.5 py-3 md:px-6">
                <h3 className="font-bold">{seasonLabel(tally.seasonYear)}</h3>
                <span className="text-xs font-semibold text-ink-muted">
                    {tally.counted} {tally.counted === 1 ? 'ballot' : 'ballots'} · <Link href={`/season/${tally.seasonYear}/ballots`} className="underline-offset-[3px] hover:text-rink-blue hover:underline">See every ballot</Link>
                </span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-line text-left text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted">
                            <th className="py-2 pl-3.5 pr-3 md:pl-6">Place</th>
                            <th className="py-2 pr-3">Player</th>
                            <th className="py-2 pr-3 text-right">Pts</th>
                            {ORDINALS.slice(0, depth).map(ordinal => <th key={ordinal} className="py-2 pr-3 text-right last:pr-3.5 md:last:pr-6">{ordinal}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {tally.lines.map(line => (
                            <tr key={line.playerId} className="border-b border-line-soft last:border-b-0">
                                <td className="tabular py-2 pl-3.5 pr-3 md:pl-6">{line.place}</td>
                                <td className={`py-2 pr-3 ${line.place === 1 ? 'font-bold' : ''}`}>{line.name}</td>
                                <td className="tabular py-2 pr-3 text-right font-bold">{line.points}</td>
                                {line.votes.map((count, rank) => <td key={rank} className="tabular py-2 pr-3 text-right last:pr-3.5 md:last:pr-6">{count}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
