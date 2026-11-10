import { NextResponse } from 'next/server';
import { refreshLiveSeason } from '@/lib/fantrax/live-season';
import { scheduledRefreshTime } from '@/lib/fantrax/schedule';
import { pickem } from '@/lib/pickem/pickem';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const scheduled = scheduledRefreshTime(new URL(request.url).searchParams.get('slot'), Date.now());
    if (!scheduled) return NextResponse.json({ skipped: true });
    let fetchedAt: string;
    try {
        ({ fetchedAt } = await refreshLiveSeason());
    } catch (error) {
        console.error('Scheduled Fantrax refresh failed:', error);
        return NextResponse.json({ error: 'Fantrax refresh failed' }, { status: 503 });
    }
    // The capture has already published; a Pick'em settle failure is reported without undoing it, and the next
    // evening's run catches up.
    try {
        await pickem.settle({ now: Date.now() });
    } catch (error) {
        console.error("Pick'em settle failed:", error);
        return NextResponse.json({ refreshed: true, scheduled, fetchedAt, error: "Pick'em settle failed" }, { status: 500 });
    }
    return NextResponse.json({ refreshed: true, scheduled, fetchedAt });
}
