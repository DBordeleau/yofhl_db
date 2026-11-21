import { publicJson } from '@/lib/public-json';
import { NextResponse } from 'next/server';
import { listed, winners } from '@/lib/data/award-archive';
import { awardFromSlug, findAward } from '@/lib/awards';

// GET /api/awards/:slug — every winner of one listed award, team awards included, e.g. /api/awards/Wayne_Gretzky_Award or /api/awards/Jagr_Cup
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
    const award = findAward(awardFromSlug((await params).slug));
    if (!award || !(await listed()).some(listedAward => listedAward.id === award.id)) {
        return NextResponse.json({ error: 'Award not found' }, { status: 404 });
    }
    return publicJson({ award: { name: award.name, label: award.label, honor: award.honor }, winners: await winners(award) });
}
