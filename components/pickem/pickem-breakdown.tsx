import TeamBadge from '@/components/team-badge';
import type { PickemEntry, PickemFranchise, PickemMatchupBreakdown } from '@/lib/pickem/create-pickem';

// A locked week's breakdown: each matchup's two franchises, how many entries took each side, and their owners.
// Nothing here can be picked.

function Side({ franchise, entries, end }: { franchise: PickemFranchise; entries: PickemEntry[]; end: boolean }) {
    return <div className={`flex min-w-0 flex-col gap-2 ${end ? 'items-end text-right' : ''}`}>
        <div className={`flex min-w-0 items-center gap-2 ${end ? 'flex-row-reverse' : ''}`}>
            <TeamBadge logo={franchise.logo} abbreviation={franchise.abbreviation} teamName={franchise.name} size={36} />
            <span className="min-w-0 truncate text-sm font-bold md:text-base">{franchise.name}</span>
        </div>
        <p className="font-wide text-2xl font-extrabold tabular-nums">{entries.length}</p>
        {entries.length > 0 && <ul className="text-xs text-ink-soft">
            {entries.map(entry => <li key={entry.franchise.id}>{entry.owner ?? entry.franchise.name}</li>)}
        </ul>}
    </div>;
}

export default function PickemBreakdown({ breakdown }: { breakdown: PickemMatchupBreakdown[] }) {
    return <ul className="mt-6 flex flex-col gap-3">
        {breakdown.map(({ matchup, away, home }) => <li key={`${matchup.away.id}-${matchup.home.id}`}
            className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 rounded-xl bg-white p-3 shadow-sm md:gap-4 md:p-4">
            <Side franchise={matchup.away} entries={away} end={false} />
            <span className="self-center text-xs font-extrabold uppercase text-ink-faint">vs</span>
            <Side franchise={matchup.home} entries={home} end />
        </li>)}
    </ul>;
}
