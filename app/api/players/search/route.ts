import { publicJson } from '@/lib/public-json';
import { NextRequest } from 'next/server';
import { searchPlayers } from '@/lib/data/league';

// GET /api/players/search?q=mcd (at least 3 characters)
export async function GET(request: NextRequest) {
    const q = (request.nextUrl.searchParams.get('q') ?? '').slice(0, 60);
    return publicJson({ players: await searchPlayers(q) });
}
