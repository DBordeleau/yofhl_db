import Link from 'next/link';
import { redirect } from 'next/navigation';
import KeeperEditor from '@/components/keepers/keeper-editor';
import { ownerSession } from '@/lib/owner/auth';
import { getKeeperSubmission, ownedKeeperTeam, getKeeperRoster } from '@/lib/keepers/data';
import { keepersOpen } from '@/lib/keepers/model';
import { refreshKeeperRoster, saveKeeperSelection } from './actions';
import { enrichKeeperRoster } from '@/lib/keepers/nhl';
import { FANTRAX_LEAGUE_URL } from '@/lib/fantrax/data';
import Arrow from '@/components/arrow';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My keepers | YOFHL DB', robots: { index: false, follow: false } };

export default async function KeeperPage() {
    const user = await ownerSession();
    if (!user) redirect('/owner');
    const team = await ownedKeeperTeam(user.uid);
    if (!team) redirect('/owner');
    const submission = await getKeeperSubmission(team.id);
    const closed = !keepersOpen();
    const current = !closed ? await getKeeperRoster(team.id, true).catch(() => null) : null;
    const roster = closed ? submission?.roster : current ? await enrichKeeperRoster(current.roster) : undefined;
    return <main className="mx-auto max-w-[1080px] px-4 py-8 md:px-8">
        <Link href="/owner" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-rink-blue hover:underline"><Arrow direction="left" /> Manage my team</Link>
        {roster ? <KeeperEditor team={team} roster={roster} initialSubmission={submission} serverNow={new Date().toISOString()} fetchedAt={current?.fetchedAt ?? submission!.submittedAt} fantraxUrl={FANTRAX_LEAGUE_URL} saveAction={saveKeeperSelection} refreshAction={refreshKeeperRoster} />
            : <section className="rounded-2xl border border-line bg-white p-8"><h1 className="text-2xl font-extrabold">{closed ? 'Keeper submissions closed' : 'Roster unavailable'}</h1><p className="mt-3 text-sm text-ink-soft">{closed ? 'The deadline was October 9, 2026 at 7 p.m. Eastern. No keeper list was submitted for your team.' : 'We could not load your current Fantrax roster. Reload to try again. Any previously submitted list is still saved.'}</p>{!closed && <a href="/owner/keepers" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-ink px-5 text-sm font-bold text-white">Reload roster</a>}</section>}
    </main>;
}
