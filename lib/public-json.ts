import { NextResponse } from 'next/server';

// Historical public data only. Private endpoints and error responses remain uncached.
export function publicJson(data: unknown) {
    return NextResponse.json(data, { headers: {
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'CDN-Cache-Control': 'public, s-maxage=60',
        'Vercel-CDN-Cache-Control': 'public, s-maxage=60',
    } });
}
