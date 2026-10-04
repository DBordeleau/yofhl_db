import { NextRequest, NextResponse } from 'next/server';
import { getPublicLottery } from '@/lib/lottery/data';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const id = request.nextUrl.searchParams.get('id') ?? undefined;
    const headers = { 'Cache-Control': 'no-store, max-age=0' };
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
        return NextResponse.json({ error: 'Invalid lottery.' }, { status: 400, headers });
    try {
        const data = await getPublicLottery(id);
        if (request.nextUrl.searchParams.has('summary')) {
            const event = data.lottery;
            return NextResponse.json({ serverNow: data.serverNow, lottery: event ? {
                id: event.id, startsAt: event.startsAt, endsAt: event.endsAt, phase: event.phase,
            } : null }, { headers });
        }
        return NextResponse.json(data, { headers });
    } catch (error) {
        console.error('Lottery read failed', error);
        return NextResponse.json({ error: 'The lottery is temporarily unavailable. Reconnecting…' }, { status: 503, headers });
    }
}
