import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { LEAGUE_TAG } from '@/lib/data/db';
import { FANTRAX_TAG, refreshLiveSeason } from '@/lib/fantrax/live-season';

// POST /api/revalidate with "Authorization: Bearer <REVALIDATE_SECRET>" clears every cached league
// query and page, Pick'em's cached reads among them (every cached() read carries LEAGUE_TAG). The importer calls
// this after loading a season.
export async function POST(request: Request) {
    const secret = process.env.REVALIDATE_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // external=1 also captures the live season from Fantrax, frozen season or not, and reports whether it changed.
    // Only a changed capture publishes (and expires the live season's tag), but every Fantrax cache is expired
    // either way: archived final scores, the player directory and the scoring-season selector carry only
    // FANTRAX_TAG, and a historical correction never changes the live capture.
    let fantraxReport: { fantrax: 'published' | 'unchanged' } | null = null;
    if (new URL(request.url).searchParams.get('external') === '1') {
        try {
            const { changed } = await refreshLiveSeason();
            fantraxReport = { fantrax: changed ? 'published' : 'unchanged' };
            revalidateTag(FANTRAX_TAG);
        } catch (error) {
            console.error('Fantrax revalidation failed:', error);
            return NextResponse.json({ error: 'Fantrax refresh failed' }, { status: 503 });
        }
    }
    revalidateTag(LEAGUE_TAG);
    return NextResponse.json({ revalidated: true, ...fantraxReport });
}
