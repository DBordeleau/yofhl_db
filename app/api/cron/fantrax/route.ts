import { NextResponse } from 'next/server';
import { refreshLiveSeason } from '@/lib/fantrax/live-season';
import { scheduledRefreshTime } from '@/lib/fantrax/schedule';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
    const secret = process.env.CRON_SECRET;
    if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const scheduled = scheduledRefreshTime(new URL(request.url).searchParams.get('slot'), Date.now());
    if (!scheduled) return NextResponse.json({ skipped: true });
    try {
        const { fetchedAt } = await refreshLiveSeason();
        return NextResponse.json({ refreshed: true, scheduled, fetchedAt });
    } catch (error) {
        console.error('Scheduled Fantrax refresh failed:', error);
        return NextResponse.json({ error: 'Fantrax refresh failed' }, { status: 503 });
    }
}
