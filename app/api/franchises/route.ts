import { NextResponse } from 'next/server';
import { getFranchiseCards } from '@/lib/data/league';

// GET /api/franchises — all-time record, titles and finals for every franchise
export async function GET() {
    return NextResponse.json(await getFranchiseCards());
}
