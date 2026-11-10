import { NextResponse } from 'next/server';
import { ownerSession } from '@/lib/owner/owner-session';
import { getOwnedTeam } from '@/lib/owner/teams';
import { getKeeperRoster, getKeeperSubmission } from '@/lib/keepers/data';
import { KEEPERS_ENABLED, keepersOpen, submissionStatus } from '@/lib/keepers/model';

export const dynamic = 'force-dynamic';

export async function GET() {
    const user = await ownerSession.currentOwner();
    const team = user ? await getOwnedTeam(user.uid) : null;
    let keepers = null;
    if (KEEPERS_ENABLED && team && keepersOpen()) {
        const submission = await getKeeperSubmission(team.id);
        // An API outage must not make an existing submission look missing. Only the submission status is reported,
        // so the cached live season is enough.
        const current = submission ? await getKeeperRoster(team.id, false).catch(() => null) : null;
        const newerRoster = current && submission && Date.parse(current.fetchedAt) > Date.parse(submission.submittedAt) ? current.roster : undefined;
        keepers = { status: submissionStatus(submission, newerRoster), serverNow: new Date().toISOString() };
    }
    return NextResponse.json({
        signedIn: Boolean(user),
        team: team ? { name: team.name, logo: team.logo, abbreviation: team.abbreviation } : null,
        keepers,
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
