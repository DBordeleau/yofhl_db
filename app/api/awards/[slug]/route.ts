import { NextResponse } from 'next/server';
import { getAwardWinners } from '@/lib/data/league';
import { awardFromSlug } from '@/lib/league';

// GET /api/awards/:slug — every winner of one award, e.g. /api/awards/Wayne_Gretzky_Award
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
    const data = await getAwardWinners(awardFromSlug((await params).slug));
    if (!data) return NextResponse.json({ error: 'Award not found' }, { status: 404 });
    return NextResponse.json(data);
}
