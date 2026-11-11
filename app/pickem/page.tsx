import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PickemPageView from '@/components/pickem/pickem-page';
import { pickem } from '@/lib/pickem/pickem';
import { PICKEM_LAUNCH } from '@/lib/pickem/settings';

export const metadata: Metadata = {
    title: "Pick'em · YOFHL",
    description: 'Owners call the winner of every regular-season matchup.',
};

// The public page reads for nobody: the next week to lock beside the Pick'em leaderboard. Results arrive with the
// evening refresh's settle, which expires the page's cached reads; the next week to lock turns over at noon, so the
// page is rebuilt every minute and never shows a week as locked before its lock. Other weeks live at
// /pickem/week/[week] and past seasons at /pickem/[season], so this page reads no search params and stays cached.
// Owners' own picks load in the browser, only with the session hint (ADR 0003).
export const revalidate = 60;

export default async function PickemPage() {
    if (!PICKEM_LAUNCH) notFound();
    const now = Date.now();
    const [read, lastLocked, standings] = await Promise.all([
        pickem.readWeek({ now, asker: 'nobody' }),
        pickem.readWeek({ now, week: 'last-locked', asker: 'nobody' }),
        pickem.readPickemLeaderboard({ now }),
    ]);
    const week = read.status === 'week' ? read.week : null;
    const previous = lastLocked.status === 'week' ? lastLocked.week : null;
    const leaderboard = standings.status === 'leaderboard' ? standings.leaderboard : null;
    return <PickemPageView
        seasonYear={week?.seasonYear ?? previous?.seasonYear ?? leaderboard?.seasonYear ?? null}
        seasons={leaderboard ? { list: standings.status === 'leaderboard' ? standings.seasons : [], beingPlayed: leaderboard.seasonYear } : undefined}
        week={week}
        weeks={read.status === 'week' ? read.weeks : lastLocked.status === 'week' ? lastLocked.weeks : null}
        standings={leaderboard ?? (standings.status === 'unavailable' ? 'unavailable' : null)}
        message={read.status === 'unavailable' ? 'Matchups are unavailable right now. Try again soon.' : "No Pick'em week is open."} />;
}
