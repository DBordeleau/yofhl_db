import { publicJson } from '@/lib/public-json';
import { NextResponse } from 'next/server';
import { getPlayer } from '@/lib/data/league';
import { playerHonors } from '@/lib/data/award-archive';

// GET /api/players/:id — career summary, season-by-season stats, awards and championships
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const id = decodeURIComponent((await params).id);
    const player = await getPlayer(id);
    if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    // the player's awards and Jagr Cup rings are the award archive's
    return publicJson({ ...player, ...await playerHonors(id) });
}
