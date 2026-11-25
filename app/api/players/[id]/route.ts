import { publicJson } from '@/lib/public-json';
import { NextResponse } from 'next/server';
import { safeDecodeParam } from '@/lib/data/bounds';
import { getPlayer } from '@/lib/data/league';
import { playerHonors } from '@/lib/data/award-archive';

// GET /api/players/:id — career summary, season-by-season stats, awards and championships
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const id = safeDecodeParam((await params).id);
    const player = id ? await getPlayer(id) : null;
    if (!player || !id) return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    // the player's awards and Jagr Cup rings are the award archive's
    return publicJson({ ...player, ...await playerHonors(id) });
}
