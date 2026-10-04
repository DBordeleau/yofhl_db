import { NextRequest, NextResponse } from 'next/server';
import { getAllTimeLeaderboard, getSingleSeasonLeaderboard } from '@/lib/data/league';
import { LEADERBOARD_POSITIONS } from '@/lib/league';

// GET /api/leaderboard?mode=all-time|single-season&position=all|c|lw|rw|d|g&page=1&q=
export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const mode = params.get('mode') ?? 'all-time';
    const position = (params.get('position') ?? 'all').toLowerCase();
    const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
    const q = (params.get('q') ?? '').slice(0, 60);

    if (mode !== 'all-time' && mode !== 'single-season') {
        return NextResponse.json({ error: 'mode must be all-time or single-season' }, { status: 400 });
    }
    if (!LEADERBOARD_POSITIONS.some((p) => p.toLowerCase() === position)) {
        return NextResponse.json({ error: `position must be one of ${LEADERBOARD_POSITIONS.join(', ').toLowerCase()}` }, { status: 400 });
    }
    const data = mode === 'all-time' ? await getAllTimeLeaderboard(position, page, q) : await getSingleSeasonLeaderboard(position, page, q);
    return NextResponse.json(data);
}
