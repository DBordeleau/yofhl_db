import TeamBadge from '@/components/team-badge';
import type { PickemWhoIsIn } from '@/lib/pickem/create-pickem';

// Who's in for the next week to lock: the count, then the owners in and those not yet in. No picks are shown.
export default function PickemWhosIn({ whosIn }: { whosIn: PickemWhoIsIn[] }) {
    const ins = whosIn.filter(entry => entry.in);
    const groups = [
        { label: 'In', entries: ins },
        { label: 'Not yet', entries: whosIn.filter(entry => !entry.in) },
    ].filter(group => group.entries.length > 0);
    return <section aria-labelledby="pickem-whos-in" className="mt-6 rounded-xl bg-white p-3 shadow-sm md:p-4">
        <h3 id="pickem-whos-in" className="text-sm font-extrabold uppercase text-ink-soft">
            {ins.length} of {whosIn.length} owners in
        </h3>
        {groups.map(group => <div key={group.label} className="mt-3">
            <p className="text-xs font-extrabold uppercase text-ink-faint">{group.label}</p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                {group.entries.map(({ franchise, owner }) => <li key={franchise.id} className="flex min-w-0 items-center gap-2">
                    <TeamBadge logo={franchise.logo} abbreviation={franchise.abbreviation} teamName={franchise.name} size={24} />
                    <span className="min-w-0 text-sm leading-tight">
                        <span className="font-bold">{owner ?? franchise.name}</span>
                        {owner && <span className="text-ink-soft"> · {franchise.name}</span>}
                    </span>
                </li>)}
            </ul>
        </div>)}
    </section>;
}
