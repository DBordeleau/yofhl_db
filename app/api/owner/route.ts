import { NextResponse } from 'next/server';
import { ownerSession } from '@/lib/owner/auth';
import { rows } from '@/lib/data/db';
import { managedTeamsQuery } from '@/lib/owner/queries';
import type { ManagedTeam } from '@/lib/owner/model';

export const dynamic = 'force-dynamic';

export async function GET() {
    const user = await ownerSession();
    const team = user ? (await rows<ManagedTeam>(managedTeamsQuery)).find((team) => team.ownerUid === user.uid && !team.defunct) : null;
    return NextResponse.json({
        signedIn: Boolean(user),
        team: team ? { name: team.name, logo: team.logo, abbreviation: team.abbreviation } : null,
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
