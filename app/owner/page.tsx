import AccessForm from '@/components/owner/access-form';
import TeamEditor from '@/components/owner/team-editor';
import { ownerSession } from '@/lib/owner/owner-session';
import { getOwnedTeam } from '@/lib/owner/teams';
import SignOutButton from '@/components/owner/sign-out-button';
import Link from 'next/link';
import { KEEPERS_ENABLED, KEEPER_SEASON_LABEL, keepersOpen } from '@/lib/keepers/model';
import Arrow from '@/components/arrow';
import PickemCard, { type PickemCardWeek } from '@/components/owner/pickem-card';
import { pickem } from '@/lib/pickem/pickem';
import { PICKEM_LAUNCH } from '@/lib/pickem/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Owner account · YOFHL', robots: { index: false, follow: false } };

export default async function OwnerPage() {
    const user = await ownerSession.currentOwner();
    const team = user ? await getOwnedTeam(user.uid) : null;
    const pickemWeek = team && PICKEM_LAUNCH ? await readPickemWeek() : null;
    return <main className="mx-auto max-w-page px-4 py-10 md:px-8">
        {user && <div className="mx-auto mb-6 flex max-w-xl flex-wrap items-center justify-between gap-3"><p className="break-all text-sm text-ink-soft">{user.email}</p><SignOutButton /></div>}
        {team ? <div className="mx-auto max-w-xl"><h1 className="mb-2 font-wide text-3xl font-extrabold">Manage my team</h1>{KEEPERS_ENABLED && <Link href="/owner/keepers" className="my-6 flex items-center justify-between gap-4 rounded-2xl border-l-4 border-rink-red bg-ink p-5 text-white hover:bg-[#232C4A]"><div><h2 className="text-lg font-extrabold">{KEEPER_SEASON_LABEL} keepers</h2><p className="mt-1 text-sm text-slate-300">{keepersOpen() ? 'Choose your keepers by Oct 9 at 7 p.m. Eastern.' : 'Submissions closed. View your submitted list.'}</p></div><Arrow className="text-xl" /></Link>}{PICKEM_LAUNCH && <PickemCard week={pickemWeek} />}<p className="mb-6 text-sm text-ink-soft">Update your current team identity. Past seasons keep their names and logos.</p><TeamEditor team={{ id: team.id, name: team.name, logo: team.logo, abbreviation: team.abbreviation, version: team.version, defunct: team.defunct }} /></div>
            : <><AccessForm initialEmail={user?.email ?? undefined} />{user && <p className="mx-auto mt-4 max-w-lg text-sm text-ink-soft">This account has no active team. Choose Claim a team and enter your invitation code with this account’s email and password.</p>}</>}
    </main>;
}

// The next Pick'em week to lock, with how many of its matchups the signed-in owner has picked; null when none is open
// or Pick'em can't be read, and the card then just links to Pick'em.
async function readPickemWeek(): Promise<PickemCardWeek | null> {
    try {
        const read = await pickem.readWeek({ now: Date.now(), asker: 'session' });
        if (read.status !== 'week' || read.week.phase !== 'open') return null;
        const { name, lock, matchups, yours } = read.week;
        return { name, lock, matchups: matchups.length, picked: yours?.status === 'entry' ? yours.picks.length : 0 };
    } catch {
        return null;
    }
}
