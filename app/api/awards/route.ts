import { publicJson } from '@/lib/public-json';
import { listed } from '@/lib/data/award-archive';
import { awardSummary } from '@/lib/awards';

// GET /api/awards — the listed awards, in catalogue order: team awards and individual awards alike
export async function GET() {
    return publicJson((await listed()).map(award => ({ ...awardSummary(award), scope: award.scope, image: award.image })));
}
