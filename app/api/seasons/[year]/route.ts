import { publicJson } from '@/lib/public-json';
import { NextResponse } from 'next/server';
import { getBannerSeasons, getChampionRoster } from '@/lib/data/league';
import { seasonLabel } from '@/lib/seasons';

// GET /api/seasons/:year — season result and championship roster (year = season end, e.g. 2026)
export async function GET(_request: Request, { params }: { params: Promise<{ year: string }> }) {
    const year = parseInt((await params).year, 10);
    const season = (await getBannerSeasons()).find((s) => s.year === year);
    if (!season) return NextResponse.json({ error: 'Season not found' }, { status: 404 });
    const roster = season.team ? await getChampionRoster(year) : null;
    return publicJson({ ...season, label: seasonLabel(year), championshipRoster: roster?.rows ?? [] });
}
