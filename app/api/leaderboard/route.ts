import { NextRequest, NextResponse } from 'next/server';
import { getAllTimeLeaderboard, getSingleSeasonLeaderboard } from '@/lib/data/league';
import { LEADERBOARD_POSITIONS } from '@/lib/league';

// Optional season=<end year> scopes single-season results to one season.
export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const mode = params.get('mode') ?? 'all-time';
    const position = (params.get('position') ?? 'all').toLowerCase();
    const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
    const q = (params.get('q') ?? '').slice(0, 60);
    const season = params.has('season') ? Number(params.get('season')) : null;

    if (mode !== 'all-time' && mode !== 'single-season') {
        return NextResponse.json({ error: 'mode must be all-time or single-season' }, { status: 400 });
    }
    if (!LEADERBOARD_POSITIONS.some((p) => p.toLowerCase() === position)) {
        return NextResponse.json({ error: `position must be one of ${LEADERBOARD_POSITIONS.join(', ').toLowerCase()}` }, { status: 400 });
    }
    if (season !== null && (mode !== 'single-season' || !Number.isInteger(season) || season < 1900 || season > 2200)) {
        return NextResponse.json({ error: 'season must be an end year between 1900 and 2200 in single-season mode' }, { status: 400 });
    }
    const data = mode === 'all-time' ? await getAllTimeLeaderboard(position, page, q) : await getSingleSeasonLeaderboard(position, page, q, season);
    return NextResponse.json(data);
}
