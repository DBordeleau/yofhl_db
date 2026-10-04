import { NextResponse } from 'next/server';
import { getHistory } from '@/lib/data/history';
import type { HistoryKind } from '@/lib/history/model';

export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const playerId = params.get('player');
    const team = params.get('franchise');
    const kind = params.get('kind') ?? 'all';
    const page = Number(params.get('page') ?? '1');
    const season = params.has('season') ? Number(params.get('season')) : null;
    const franchiseId = team ? Number(team) : undefined;
    if ((playerId ? 1 : 0) + (team ? 1 : 0) !== 1 || (playerId && playerId.length > 100)
        || (team && (!Number.isInteger(franchiseId) || franchiseId! < 1))
        || !['all', 'trade', 'free_agent', 'draft'].includes(kind)
        || !Number.isInteger(page) || page < 1 || page > 10000
        || (season !== null && (!Number.isInteger(season) || season < 1900 || season > 2200))) {
        return NextResponse.json({ error: 'Invalid history filter' }, { status: 400 });
    }
    return NextResponse.json(await getHistory({ playerId: playerId ?? undefined, franchiseId }, kind as HistoryKind, season, page));
}
