import { NextResponse } from 'next/server';
import { seasonSync } from '@/lib/season-sync/season-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The season sync's morning run (vercel.json, 11:00 UTC). A failed run returns an error status so it shows in
// Vercel's cron logs; the next morning's run catches up.
export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
        const result = await seasonSync.run({ now: Date.now() });
        if (result.outcome === 'failed') return NextResponse.json(result, { status: 503 });
        return NextResponse.json(result);
    } catch (error) {
        console.error('Scheduled season sync failed:', error);
        return NextResponse.json({ error: 'Season sync failed' }, { status: 500 });
    }
}
