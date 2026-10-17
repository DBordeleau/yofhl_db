import { publicJson } from '@/lib/public-json';
import { getFranchiseCards } from '@/lib/data/league';

// GET /api/franchises — all-time record, titles and finals for every franchise
export async function GET() {
    return publicJson(await getFranchiseCards());
}
