import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageTitle from '@/components/page-title';
import PickemLeaderboard from '@/components/pickem/pickem-leaderboard';
import PickemWeekSection from '@/components/pickem/pickem-week-section';
import WeekSwitcher from '@/components/pickem/week-switcher';
import { seasonLabel } from '@/lib/league';
import { pickem } from '@/lib/pickem/pickem';
import { PICKEM_LAUNCH } from '@/lib/pickem/settings';

export const metadata: Metadata = {
    title: "Pick'em · YOFHL",
    description: 'Owners call the winner of every regular-season matchup.',
};

// The public page reads for nobody: the Pick'em leaderboard above the next week to lock. Results arrive with the
// evening refresh's settle, which expires the page's cached reads; the next week to lock turns over at noon, so the
// page is rebuilt every minute and never shows a week as locked before its lock. Other weeks live at
// /pickem/week/[week], so this page reads no search params and stays cached. Owners' own picks load in the
// browser, only with the session hint (ADR 0003).
export const revalidate = 60;

export default async function PickemPage() {
    if (!PICKEM_LAUNCH) notFound();
    const now = Date.now();
    const [read, lastLocked, standings] = await Promise.all([
        pickem.readWeek({ now, asker: 'nobody' }),
        pickem.readWeek({ now, week: 'last-locked', asker: 'nobody' }),
        pickem.readLeaderboard({ now }),
    ]);
    const week = read.status === 'week' ? read.week : null;
    const previous = lastLocked.status === 'week' ? lastLocked.week : null;
    const link = previous ? { href: `/pickem/week/${previous.week}`, label: `${previous.name} picks` } : undefined;
    const weeks = read.status === 'week' ? read.weeks : lastLocked.status === 'week' ? lastLocked.weeks : null;
    return <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <PageTitle eyebrow={week ? seasonLabel(week.seasonYear) : undefined} title="Pick'em" />
        {standings.status === 'leaderboard' && <PickemLeaderboard entries={standings.leaderboard.entries} />}
        {weeks && <WeekSwitcher weeks={weeks} selected={week?.week ?? 0} />}
        {week ? <PickemWeekSection week={week} link={link} /> : <p className="mt-8 text-center text-ink-soft">
            {read.status === 'unavailable' ? 'Matchups are unavailable right now. Try again soon.' : 'No week is open for picks.'}
            {link && <> <Link href={link.href} className="font-bold text-rink-red underline">{link.label}</Link></>}
        </p>}
    </main>;
}
