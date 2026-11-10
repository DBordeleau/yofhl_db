import type { PickemLeaderboardEntry } from '@/lib/pickem/create-pickem';

// Each season's prize, by season year
const PRIZES: Record<number, string> = {
    2027: "Prize: the winner's 2027–28 Fantrax fees waived, split between joint winners.",
};

const named = ({ owner, franchise }: PickemLeaderboardEntry) => owner ? `${owner} (${franchise.name})` : franchise.name;

/** The season's winner or joint winners once it is complete, then the rules and the prize in a line */
export default function PickemSeasonSummary({ seasonYear, winners }: { seasonYear: number; winners: PickemLeaderboardEntry[] }) {
    return <div className="mt-6 text-center text-sm">
        {winners.length > 0 && <p className="text-base font-extrabold">
            {winners.length > 1 ? 'Joint winners' : 'Winner'}: {winners.map(named).join(', ')}
        </p>}
        <p className="mt-1 text-ink-soft">
            Pick the winner of each regular-season matchup before noon ET on the week&apos;s first day. Ranked by correct
            picks, then fewer wrong. Playoffs don&apos;t count. {PRIZES[seasonYear]}
        </p>
    </div>;
}
