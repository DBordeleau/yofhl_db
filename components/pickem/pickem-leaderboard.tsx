import TeamBadge from '@/components/team-badge';
import type { PickemLeaderboardEntry } from '@/lib/pickem/create-pickem';

// The Pick'em leaderboard: rank, owner and franchise, correct, wrong and percentage. Nothing else.

const percent = (value: number | null) => value === null ? '' : `${Math.round(value * 100)}%`;

export default function PickemLeaderboard({ entries }: { entries: PickemLeaderboardEntry[] }) {
    if (!entries.length) return null;
    return <section aria-labelledby="pickem-leaderboard" className="mt-8">
        <h2 id="pickem-leaderboard" className="font-wide text-xl font-extrabold uppercase">Pick&apos;em leaderboard</h2>
        <div className="mt-3 overflow-hidden rounded-md border border-line bg-white">
            <table className="w-full text-sm">
                <thead className="bg-[#EAF0F6] text-[11px] font-extrabold uppercase tracking-[.12em] text-ink-muted">
                    <tr>
                        <th scope="col" className="w-10 px-2 py-2 text-right md:px-3"><abbr title="Rank" className="no-underline">#</abbr></th>
                        <th scope="col" className="px-2 py-2 text-left md:px-3">Owner</th>
                        <th scope="col" className="w-16 px-2 py-2 text-right md:px-3">Correct</th>
                        <th scope="col" className="w-16 px-2 py-2 text-right md:px-3">Wrong</th>
                        <th scope="col" className="w-14 px-2 py-2 text-right md:px-3"><abbr title="Percentage" className="no-underline">Pct</abbr></th>
                    </tr>
                </thead>
                <tbody>
                    {entries.map(({ rank, franchise, owner, correct, wrong, percentage }) => <tr key={franchise.id} className="border-t border-line">
                        <td className="px-2 py-2 text-right font-extrabold tabular-nums md:px-3">{rank}</td>
                        <td className="px-2 py-2 md:px-3">
                            <span className="flex min-w-0 items-center gap-2">
                                <TeamBadge logo={franchise.logo} abbreviation={franchise.abbreviation} teamName={franchise.name} size={24} />
                                <span className="min-w-0 leading-tight">
                                    <span className="font-bold">{owner ?? franchise.name}</span>
                                    {owner && <span className="block truncate text-xs text-ink-soft">{franchise.name}</span>}
                                </span>
                            </span>
                        </td>
                        <td className="px-2 py-2 text-right font-bold tabular-nums md:px-3">{correct}</td>
                        <td className="px-2 py-2 text-right tabular-nums md:px-3">{wrong}</td>
                        <td className="px-2 py-2 text-right tabular-nums md:px-3">{percent(percentage)}</td>
                    </tr>)}
                </tbody>
            </table>
        </div>
    </section>;
}
