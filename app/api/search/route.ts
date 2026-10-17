import { NextRequest, NextResponse } from 'next/server';
import { searchPublicDirectory } from '@/lib/data/search';
import { parseSearch } from '@/lib/search/model';
import { publicJson } from '@/lib/public-json';

export async function GET(request: NextRequest) {
    try {
        return publicJson(await searchPublicDirectory(parseSearch(request.nextUrl.searchParams)));
    } catch {
        return NextResponse.json({ error: 'Search is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
}
