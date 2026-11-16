import Link from 'next/link';
import type { PublishedTally, PublishedTallyLine } from '@/lib/award-vote/create-award-vote';
import { seasonLabel } from '@/lib/league';

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

/** a line's candidate: the player, or GM of the Year's team season and its owner that season */
function Candidate({ line }: { line: PublishedTallyLine }) {
    if (!('team' in line)) return <>{line.name}</>;
    return <>{line.team.name}{line.owner && <span className="ml-2 text-xs font-normal text-ink-muted">{line.owner}</span>}</>;
}

// one season's published tally on an award's page: every ranked candidate's place, points and votes at each rank
export default function PublishedTallyTable({ tally }: { tally: PublishedTally }) {
    const depth = tally.lines[0]?.votes.length ?? 0;
    const teams = tally.lines.some(line => 'team' in line);
    return (
        <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-ink px-3.5 py-3 md:px-6">
                <h3 className="font-bold">{seasonLabel(tally.seasonYear)}</h3>
                <Link href={`/season/${tally.seasonYear}/ballots`} className="text-xs font-semibold text-ink-muted underline-offset-[3px] hover:text-rink-blue hover:underline">See every ballot</Link>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-line text-left text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted">
                            <th className="py-2 pl-3.5 pr-3 md:pl-6">Place</th>
                            <th className="py-2 pr-3">{teams ? 'Team' : 'Player'}</th>
                            <th className="py-2 pr-3 text-right">Pts</th>
                            {ORDINALS.slice(0, depth).map(ordinal => <th key={ordinal} className="py-2 pr-3 text-right last:pr-3.5 md:last:pr-6">{ordinal}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {tally.lines.map(line => (
                            <tr key={'team' in line ? line.team.teamSeasonId : line.playerId} className="border-b border-line-soft last:border-b-0">
                                <td className="tabular py-2 pl-3.5 pr-3 md:pl-6">{line.place}</td>
                                <td className={`py-2 pr-3 ${line.place === 1 ? 'font-bold' : ''}`}><Candidate line={line} /></td>
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
