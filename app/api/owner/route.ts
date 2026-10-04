import { NextResponse } from 'next/server';
import { ownerSession } from '@/lib/owner/auth';
import { rows } from '@/lib/data/db';
import { managedTeamsQuery } from '@/lib/owner/queries';
import type { ManagedTeam } from '@/lib/owner/model';
import { getKeeperRoster, getKeeperSubmission } from '@/lib/keepers/data';
import { keepersOpen, submissionStatus } from '@/lib/keepers/model';

export const dynamic = 'force-dynamic';

export async function GET() {
    const user = await ownerSession();
    const team = user ? (await rows<ManagedTeam>(managedTeamsQuery)).find((team) => team.ownerUid === user.uid && !team.defunct) : null;
    let keepers = null;
    if (team && keepersOpen()) {
        const submission = await getKeeperSubmission(team.id);
        // An API outage must not make an existing submission look missing.
        const current = submission ? await getKeeperRoster(team.id).catch(() => null) : null;
        const newerRoster = current && submission && Date.parse(current.fetchedAt) > Date.parse(submission.submittedAt) ? current.roster : undefined;
        keepers = { status: submissionStatus(submission, newerRoster), serverNow: new Date().toISOString() };
    }
    return NextResponse.json({
        signedIn: Boolean(user),
        team: team ? { name: team.name, logo: team.logo, abbreviation: team.abbreviation } : null,
        keepers,
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
