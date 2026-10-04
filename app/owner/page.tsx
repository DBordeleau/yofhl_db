import AccessForm from '@/components/owner/access-form';
import TeamEditor from '@/components/owner/team-editor';
import { ownerSession } from '@/lib/owner/auth';
import { rows } from '@/lib/data/db';
import { managedTeamsQuery } from '@/lib/owner/queries';
import type { ManagedTeam } from '@/lib/owner/model';
import SignOutButton from '@/components/owner/sign-out-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Owner account | YOFHL DB', robots: { index: false, follow: false } };

export default async function OwnerPage() {
    const user = await ownerSession();
    const team = user ? (await rows<ManagedTeam>(managedTeamsQuery)).find((team) => team.ownerUid === user.uid && !team.defunct) : null;
    return <main className="mx-auto max-w-page px-4 py-10 md:px-8">
        {user && <div className="mx-auto mb-6 flex max-w-xl flex-wrap items-center justify-between gap-3"><p className="break-all text-sm text-ink-soft">{user.email}</p><SignOutButton /></div>}
        {team ? <div className="mx-auto max-w-xl"><h1 className="mb-2 font-wide text-3xl font-extrabold">Manage my team</h1><p className="mb-6 text-sm text-ink-soft">Update your current team identity. Past seasons keep their names and logos.</p><TeamEditor team={{ id: team.id, name: team.name, logo: team.logo, abbreviation: team.abbreviation, version: team.version, defunct: team.defunct }} /></div>
            : <><AccessForm initialEmail={user?.email} />{user && <p className="mx-auto mt-4 max-w-lg text-sm text-ink-soft">This account has no active team. Choose Claim a team and enter your invitation code with this account’s email and password.</p>}</>}
    </main>;
}
