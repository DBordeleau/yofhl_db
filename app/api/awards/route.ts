import { NextResponse } from 'next/server';
import { getAwardTypes } from '@/lib/data/league';

// GET /api/awards — the individual awards, in display order
export async function GET() {
    return NextResponse.json(await getAwardTypes());
}
