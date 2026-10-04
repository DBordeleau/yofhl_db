import { NextResponse } from 'next/server';
import { getBannerSeasons } from '@/lib/data/league';

// GET /api/seasons — every season with its champion (null while in progress or when cancelled)
export async function GET() {
    return NextResponse.json(await getBannerSeasons());
}
