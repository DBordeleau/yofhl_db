import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PickemPageView from '@/components/pickem/pickem-page';
import { pickem } from '@/lib/pickem/pickem';
import { PICKEM_LAUNCH } from '@/lib/pickem/settings';
import { pickemWeekMetadata } from '@/app/pickem/metadata';

export async function generateMetadata({ params }: { params: Promise<{ week: string }> }): Promise<Metadata> {
    const { week: asked } = await params;
    if (!PICKEM_LAUNCH || !/^\d{1,3}$/.test(asked)) return {};
    const read = await pickem.readWeek({ now: Date.now(), week: Number(asked), asker: 'nobody' });
    const week = read.status === 'week' ? read.week : null;
    return pickemWeekMetadata(`/pickem/week/${asked}`, week, week?.seasonYear ?? null);
}

// Any Pick'em week, read for nobody like /pickem: pick controls until the lock, the breakdown from then on, beside
// the season's Pick'em leaderboard. Each week is rendered on its first visit and cached (ISR). A render decides
// locked or open from its own clock, so a copy cached before the lock never shows a breakdown; it is rebuilt every
// minute, so the breakdown appears within about a minute of the lock without waiting for settle, which expires it on
// recording or freezing the week.
export const revalidate = 60;
export function generateStaticParams() { return []; }

export default async function PickemWeekPage({ params }: { params: Promise<{ week: string }> }) {
    if (!PICKEM_LAUNCH) notFound();
    const { week: asked } = await params;
    if (!/^\d{1,3}$/.test(asked)) notFound();
    const now = Date.now();
    const [read, standings] = await Promise.all([
        pickem.readWeek({ now, week: Number(asked), asker: 'nobody' }),
        pickem.readPickemLeaderboard({ now }),
    ]);
    if (read.status === 'no-week') notFound();
    const week = read.status === 'week' ? read.week : null;
    const leaderboard = standings.status === 'leaderboard' ? standings.leaderboard : null;
    return <PickemPageView
        seasonYear={week?.seasonYear ?? leaderboard?.seasonYear ?? null}
        seasons={leaderboard && standings.status === 'leaderboard' ? { list: standings.seasons, beingPlayed: leaderboard.seasonYear } : undefined}
        week={week}
        weeks={read.status === 'week' ? read.weeks : null}
        standings={leaderboard ?? (standings.status === 'unavailable' ? 'unavailable' : null)}
        message="Matchups are unavailable right now. Try again soon." />;
}
