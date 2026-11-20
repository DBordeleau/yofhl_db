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
    const report = refresh.outcome === 'frozen'
        ? { scheduled, refresh: refresh.outcome }
        : { scheduled, refresh: refresh.outcome, fetchedAt: refresh.fetchedAt };
    // Pick'em settles after every refresh outcome, frozen season included: locks and correction windows pass on the
    // clock, and settle stops on its own once the season's Pick'em is complete. A published capture stays
    // published; a settle failure is reported without undoing it, and the next evening's run catches up.
    try {
        await pickem.settle({ now: Date.now() });
    } catch (error) {
        console.error("Pick'em settle failed:", error);
        return NextResponse.json({ ...report, error: "Pick'em settle failed" }, { status: 500 });
    }
    return NextResponse.json(report);
}
