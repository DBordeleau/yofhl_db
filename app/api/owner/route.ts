import { NextResponse } from 'next/server';
import { ownerSession } from '@/lib/owner/owner-session';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json(await ownerSession.headerAnswer(), { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
