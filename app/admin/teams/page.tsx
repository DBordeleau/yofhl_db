import AdminHeader from '@/components/admin/admin-header';
import LoginForm from '@/components/admin/login-form';
import TeamEditor from '@/components/owner/team-editor';
import { adminConfigured, isAdmin } from '@/lib/admin/auth';
import { rows } from '@/lib/data/db';
import { managedTeamsQuery } from '@/lib/owner/queries';
import type { ManagedTeam } from '@/lib/owner/model';

export const dynamic = 'force-dynamic';

export default async function AdminTeams() {
    if (!(await isAdmin())) return <LoginForm next="/admin/teams" configured={adminConfigured()} />;
    const teams = await rows<ManagedTeam>(managedTeamsQuery);
    return <><AdminHeader title="Teams" back /><p className="mb-6 max-w-2xl text-sm text-ink-soft">Manage team names and logos, and generate invitation codes for the active owners. Changes apply to current team profiles; historical seasons stay intact.</p><div className="grid items-start gap-6 lg:grid-cols-2">{teams.map((team) => <TeamEditor key={team.id} team={{ ...team, claimed: !!team.ownerUid }} admin />)}</div></>;
}
