import { publicJson } from '@/lib/public-json';
import { NextResponse } from 'next/server';
import { getListedAwardWinners } from '@/lib/data/league';
import { winners } from '@/lib/data/award-archive';
import { awardFromSlug, findAward } from '@/lib/awards';

// GET /api/awards/:slug — every winner of one award, team awards included, e.g. /api/awards/Wayne_Gretzky_Award or /api/awards/Jagr_Cup
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
    const name = awardFromSlug((await params).slug);
    const award = findAward(name);
    // a team award an award vote decides is here only once listed, which getListedAwardWinners decides
    const data = award && award.decidedBy !== 'teamVote'
        ? { award: { name: award.name, label: award.label, honor: award.honor }, winners: await winners(award) }
        : await getListedAwardWinners(name);
    if (!data) return NextResponse.json({ error: 'Award not found' }, { status: 404 });
    return publicJson(data);
}
