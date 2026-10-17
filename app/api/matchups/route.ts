import { NextResponse } from 'next/server';
import { getMatchupScores } from '@/lib/fantrax/data';
import { publicJson } from '@/lib/public-json';

export async function GET(request: Request) {
    const raw = new URL(request.url).searchParams.get('period');
    if (!raw || !/^\d{1,3}$/.test(raw) || Number(raw) < 1) return NextResponse.json({ error: 'Invalid scoring period' }, { status: 400 });
    try {
        return publicJson({ scores: await getMatchupScores(Number(raw)) });
    } catch (error) {
        return NextResponse.json({ error: error instanceof RangeError ? 'Unknown scoring period' : 'Scores temporarily unavailable' }, { status: error instanceof RangeError ? 404 : 503 });
    }
}
