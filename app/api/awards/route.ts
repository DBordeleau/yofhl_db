import { publicJson } from '@/lib/public-json';
import { getAwardTypes } from '@/lib/data/league';

// GET /api/awards — the individual awards, in display order
export async function GET() {
    return publicJson(await getAwardTypes());
}
