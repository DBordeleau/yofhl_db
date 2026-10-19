import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { LEAGUE_TAG } from '@/lib/data/db';
import { FANTRAX_TAG } from '@/lib/fantrax/cache-policy';
import { refreshCurrentSeason } from '@/lib/fantrax/refresh';

// POST /api/revalidate with "Authorization: Bearer <REVALIDATE_SECRET>" clears every cached league
// query and page. The importer calls this after loading a season.
export async function POST(request: Request) {
    const secret = process.env.REVALIDATE_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (new URL(request.url).searchParams.get('external') === '1') {
        try {
            await refreshCurrentSeason();
            revalidateTag(FANTRAX_TAG);
        } catch (error) {
            console.error('Fantrax revalidation failed:', error);
            return NextResponse.json({ error: 'Fantrax refresh failed' }, { status: 503 });
        }
    }
    revalidateTag(LEAGUE_TAG);
    return NextResponse.json({ revalidated: true });
}
