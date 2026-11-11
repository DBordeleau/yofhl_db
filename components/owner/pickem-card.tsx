import Link from 'next/link';
import Arrow from '@/components/arrow';

const lockDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric' });

export interface PickemCardWeek {
    /** "Week 6" */
    name: string;
    /** ISO timestamp; every lock is at noon ET */
    lock: string;
    /** how many of the week's matchups the owner has picked */
    picked: number;
    matchups: number;
}

/** Pick'em on the owner page: how far the owner is through the next week to lock, or just the way in when none is open */
export default function PickemCard({ week }: { week: PickemCardWeek | null }) {
    const status = !week ? 'Call every matchup and climb the Pick’em leaderboard.'
        : `${week.name}: ${week.picked === week.matchups ? `all ${week.matchups} picked` : `${week.picked} of ${week.matchups} picked`}. Locks ${lockDay.format(new Date(week.lock))} at noon ET.`;
    return <Link href="/pickem" className="my-6 flex items-center justify-between gap-4 rounded-2xl bg-ink p-5 text-white hover:bg-[#232C4A] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-rink-line">
        <div>
            <h2 className="text-lg font-extrabold">Pick&rsquo;em</h2>
            <p className="mt-1 text-sm text-slate-300">{status}</p>
        </div>
        <Arrow className="text-xl" />
    </Link>;
}
