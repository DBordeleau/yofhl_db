import { notFound } from 'next/navigation';
import Leaderboard from '@/components/leaderboard';
import { getAllTimeLeaderboard, getBannerSeasons, getSingleSeasonLeaderboard } from '@/lib/data/league';
import { LEADERBOARD_MODES as MODES, LEADERBOARD_POSITIONS as POSITIONS } from '@/lib/league';

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
    const page = Math.max(1, parseInt(search.page ?? '1', 10) || 1);

    const [data, seasons] = await Promise.all([
        mode === 'all-time' ? getAllTimeLeaderboard(position, page, q) : getSingleSeasonLeaderboard(position, page, q),
        getBannerSeasons(),
    ]);
    const seasonRange = seasons.length ? `${seasons[0].label} — ${seasons[seasons.length - 1].label}` : '';

    return <Leaderboard mode={mode} position={position} q={q} data={data} seasonRange={seasonRange} />;
}
