import { publicJson } from '@/lib/public-json';
import { getListedAwardTypes } from '@/lib/data/league';

// GET /api/awards — the individual awards, in display order, then GM of the Year once listed
export async function GET() {
    return publicJson(await getListedAwardTypes());
}
