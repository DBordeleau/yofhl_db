import { notFound } from 'next/navigation';
import Leaderboard from '@/components/leaderboard';
import { clampPage, MAX_LEADERBOARD_PAGE } from '@/lib/data/bounds';
import { getAllTimeLeaderboard, getSeasonArchive, getSingleSeasonLeaderboard } from '@/lib/data/league';
import { LEADERBOARD_MODES as MODES, LEADERBOARD_POSITIONS as POSITIONS, seasonLabel } from '@/lib/league';
import { leaderboardMetadata } from '@/lib/page-metadata';

export async function generateMetadata({ params }: { params: Promise<{ mode: string; position: string }> }) {
    const { mode, position } = await params;
    return leaderboardMetadata(mode === 'single-season' ? 'single-season' : 'all-time', position);
}

// fantasy point leaderboard at /stats/[mode]/[position]?page=&q=
// mode is all-time (career totals per player) or single-season (one row per player season)
export default async function StatsPage({
    params,
    searchParams,
}: {
    params: Promise<{ mode: string; position: string }>;
    searchParams: Promise<{ page?: string; q?: string }>;
}) {
    const { mode, position } = await params;
    if (!MODES.some((m) => m.slug === mode) || !POSITIONS.some((p) => p.toLowerCase() === position)) notFound();

    const search = await searchParams;
    const q = (search.q ?? '').slice(0, 60);
    const page = clampPage(parseInt(search.page ?? '1', 10), MAX_LEADERBOARD_PAGE);

    const [data, { published }] = await Promise.all([
        mode === 'all-time' ? getAllTimeLeaderboard(position, page, q) : getSingleSeasonLeaderboard(position, page, q),
        getSeasonArchive(),
    ]);
    const seasonRange = published.length ? `${seasonLabel(published.at(-1)!.year)} — ${seasonLabel(published[0].year)}` : '';

    return <div className="pt-8 md:pt-12"><Leaderboard mode={mode} position={position} q={q} data={data} seasonRange={seasonRange} /></div>;
}
