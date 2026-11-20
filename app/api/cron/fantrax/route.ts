import { NextResponse } from 'next/server';
import { scheduledRefresh, type ScheduledRefresh } from '@/lib/fantrax/live-season';
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
    let refresh: ScheduledRefresh;
    try {
        refresh = await scheduledRefresh({ now: Date.now() });
    } catch (error) {
        console.error('Scheduled Fantrax refresh failed:', error);
        return NextResponse.json({ error: 'Fantrax refresh failed' }, { status: 503 });
    }
    // A frozen season has nothing to refresh; Pick'em settle is skipped with it.
    if (refresh.outcome === 'frozen') return NextResponse.json({ scheduled, refresh: refresh.outcome });
    const report = { scheduled, refresh: refresh.outcome, fetchedAt: refresh.fetchedAt };
    // A published capture stays published; a Pick'em settle failure is reported without undoing it, and the next
    // evening's run catches up.
    try {
        await pickem.settle({ now: Date.now() });
    } catch (error) {
        console.error("Pick'em settle failed:", error);
        return NextResponse.json({ ...report, error: "Pick'em settle failed" }, { status: 500 });
    }
    return NextResponse.json(report);
}
