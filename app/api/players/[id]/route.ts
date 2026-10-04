import { NextResponse } from 'next/server';
import { getPlayer } from '@/lib/data/league';

// GET /api/players/:id — career summary, season-by-season stats, awards and championships
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const player = await getPlayer(decodeURIComponent((await params).id));
    if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    return NextResponse.json(player);
}
