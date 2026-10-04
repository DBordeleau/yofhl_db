import AdminHeader from '@/components/admin/admin-header';
import LoginForm from '@/components/admin/login-form';
import RookieReview from '@/components/keepers/rookie-review';
import CopyDropList from '@/components/keepers/copy-drop-list';
import TeamBadge from '@/components/team-badge';
import { adminConfigured, isAdmin } from '@/lib/admin/auth';
import { rows } from '@/lib/data/db';
import { managedTeamsQuery } from '@/lib/owner/queries';
import type { ManagedTeam } from '@/lib/owner/model';
import { keeperSubmissionsQuery } from '@/lib/keepers/queries';
import { getLeagueSnapshot } from '@/lib/fantrax/data';
import { KEEPER_SEASON_LABEL, KEEPER_DEADLINE_LABEL, KEEPER_SEASON, KEEPER_TOTAL_LIMIT, currentRookieReview, isMinor, keeperPosition, keepersOpen, submissionStatus, validateKeepers, type KeeperSubmission, type KeeperPlayer } from '@/lib/keepers/model';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Keeper submissions | Admin' };

function PlayerList({ players, rookieId }: { players: KeeperPlayer[]; rookieId?: string | null }) {
    return players.length ? <ul className="divide-y divide-line-soft">{players.map(player => <li key={player.id} className="flex items-baseline justify-between gap-3 py-2 text-sm"><span className="font-semibold">{player.name}<small className="ml-2 font-normal text-ink-muted">{keeperPosition(player)} · {player.nhlTeam === '(N/A)' ? 'FA' : player.nhlTeam}</small></span>{isMinor(player) ? <span className="shrink-0 text-[10px] font-bold text-green-800">MINORS · FREE</span> : player.id === rookieId ? <span className="shrink-0 text-[10px] font-bold text-gold-deep">FREE ROOKIE</span> : null}</li>)}</ul> : <p className="py-3 text-sm text-ink-muted">None</p>;
}

export default async function KeeperAdminPage() {
    if (!(await isAdmin())) return <LoginForm next="/admin/keepers" configured={adminConfigured()} />;
    const open = keepersOpen();
    const [allTeams, submissions, snapshot] = await Promise.all([
        rows<ManagedTeam>(managedTeamsQuery), rows<KeeperSubmission>(keeperSubmissionsQuery()),
        open ? getLeagueSnapshot().catch(() => null) : Promise.resolve(null),
    ]);
    const teams = allTeams.filter(team => !team.defunct).map(team => {
        const submission = submissions.find(item => item.franchiseId === team.id) ?? null;
        const current = snapshot?.seasonYear === KEEPER_SEASON - 1 && submission && Date.parse(snapshot.fetchedAt) > Date.parse(submission.submittedAt)
            ? snapshot.teams.find(item => item.franchiseId === team.id)?.players : undefined;
        const status = submissionStatus(submission, current);
        const review = submission?.rookieId ? currentRookieReview(submission.rookieReviews[submission.rookieId])?.status ?? 'pending' : null;
        return { team, submission, status, review };
    });
    const pending = teams.filter(item => item.review === 'pending').length;
    const ready = teams.filter(item => item.status === 'submitted' && item.review !== 'pending').length;
    return <>
        <AdminHeader title="Keeper submissions" back />
        <div className="mb-6 rounded-2xl bg-ink p-6 text-white"><p className="text-xs font-bold uppercase tracking-widest text-slate-300">{KEEPER_SEASON_LABEL}</p><h2 className="mt-2 text-xl font-extrabold">{open ? 'Submissions open' : 'Submissions closed'}</h2><p className="mt-2 text-sm text-slate-300">Deadline: {KEEPER_DEADLINE_LABEL}</p><div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm"><span><strong className="text-2xl">{ready}</strong> / {teams.length} ready</span><span><strong className="text-2xl">{pending}</strong> rookie reviews</span><span><strong className="text-2xl">{teams.filter(item => item.status !== 'submitted').length}</strong> missing or need correction</span></div></div>
        <p className="mb-6 text-sm text-ink-soft">Lists show each team’s roster when submitted. Review rookie declarations before dropping players in Fantrax.{open && ' Owners can still revise their lists until the deadline.'}</p>
        {open && !snapshot && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Fantrax is unavailable. Saved lists are shown, but recent roster changes could not be checked.</p>}
        <div className="space-y-4">{teams.map(({ team, submission, status, review }) => {
            const validation = submission ? validateKeepers(submission.roster, submission, submission.rookieReviews) : null;
            const kept = new Set(validation?.keptIds ?? []);
            const dropPlayers = submission?.roster.filter(player => !kept.has(player.id)) ?? [];
            const canDrop = status === 'submitted' && review !== 'pending';
            const label = status === 'missing' ? 'Not submitted' : status === 'invalid' ? 'Correction needed' : status === 'roster_changed' ? 'Roster changed' : review === 'pending' ? 'Rookie review needed' : 'Ready';
            return <details key={team.id} className="group rounded-2xl border border-line bg-white p-4 md:p-6">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3"><TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={44} ring="none" /><div className="min-w-0 flex-1"><h3 className="text-base font-extrabold md:text-lg">{team.name}</h3><p className="mt-1 text-xs text-ink-muted">{submission ? `${kept.size} kept · ${dropPlayers.length} not kept` : team.ownerUid ? 'Owner account linked' : 'Owner account not linked'}</p></div><span className={`rounded-md px-2.5 py-1.5 text-xs font-bold ${canDrop ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>{label}</span><span className="ml-1 text-xl transition-transform group-open:rotate-90" aria-hidden="true">›</span></summary>
                {submission ? <div className="mt-5 border-t border-line pt-5">
                    <p className="text-xs text-ink-muted">Submitted {new Date(submission.submittedAt).toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' })} Eastern · {validation!.regularCount}/{KEEPER_TOTAL_LIMIT} regular keepers · {validation!.counts.F}/5 forwards · {validation!.counts.D}/3 defence · {validation!.counts.G}/2 goalies</p>
                    {status === 'roster_changed' && <p className="mt-3 text-sm font-semibold text-amber-900">The Fantrax roster changed after this submission. The owner needs to review and resubmit.</p>}
                    {!validation!.valid && <p className="mt-3 text-sm font-semibold text-red-800">{validation!.errors.join(' ')} Do not use this list for roster drops until corrected.</p>}
                    <div className="mt-5 grid gap-6 lg:grid-cols-2"><section><h4 className="border-b-2 border-green-800 pb-2 text-sm font-extrabold">Keep · {kept.size}</h4><PlayerList players={submission.roster.filter(player => kept.has(player.id))} rookieId={submission.rookieId} /></section><section><h4 className="border-b-2 border-rink-red pb-2 text-sm font-extrabold">{canDrop ? 'Players to drop' : 'Not kept · review required'} · {dropPlayers.length}</h4><PlayerList players={dropPlayers} />{canDrop && <CopyDropList names={dropPlayers.map(player => player.name)} />}</section></div>
                    <RookieReview key={`${team.id}-${submission.version}`} submission={submission} />
                </div> : <p className="mt-5 border-t border-line pt-4 text-sm text-ink-soft">{open ? 'No submitted list yet.' : 'No list was submitted before the deadline.'} No players are marked for dropping.</p>}
            </details>;
        })}</div>
    </>;
}
