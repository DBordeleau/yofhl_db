import { publicJson } from '@/lib/public-json';
import { NextRequest, NextResponse } from 'next/server';
import { MAX_LEADERBOARD_PAGE } from '@/lib/data/bounds';
import { getAllTimeLeaderboard, getSingleSeasonLeaderboard } from '@/lib/data/league';
import { LEADERBOARD_POSITIONS } from '@/lib/league';

// Optional season=<end year> scopes single-season results to one season.
export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const mode = params.get('mode') ?? 'all-time';
    const position = (params.get('position') ?? 'all').toLowerCase();
    const rawPage = params.get('page');
    const page = rawPage === null ? 1 : Number(rawPage);
    const q = (params.get('q') ?? '').slice(0, 60);
    const season = params.has('season') ? Number(params.get('season')) : null;

    if (mode !== 'all-time' && mode !== 'single-season') {
        return NextResponse.json({ error: 'mode must be all-time or single-season' }, { status: 400 });
    }
    if (!LEADERBOARD_POSITIONS.some((p) => p.toLowerCase() === position)) {
        return NextResponse.json({ error: `position must be one of ${LEADERBOARD_POSITIONS.join(', ').toLowerCase()}` }, { status: 400 });
    }
    if (!Number.isInteger(page) || page < 1 || page > MAX_LEADERBOARD_PAGE) {
        return NextResponse.json({ error: `page must be an integer between 1 and ${MAX_LEADERBOARD_PAGE}` }, { status: 400 });
    }
    if (season !== null && (mode !== 'single-season' || !Number.isInteger(season) || season < 1900 || season > 2200)) {
        return NextResponse.json({ error: 'season must be an end year between 1900 and 2200 in single-season mode' }, { status: 400 });
    }
    const data = mode === 'all-time' ? await getAllTimeLeaderboard(position, page, q) : await getSingleSeasonLeaderboard(position, page, q, season);
    return publicJson(data);
}
