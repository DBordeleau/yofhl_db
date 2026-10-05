import { notFound } from 'next/navigation';
import BrandStudio from '@/components/team-branding/brand-studio';
import LoginForm from '@/components/admin/login-form';
import { adminConfigured, isAdmin } from '@/lib/admin/auth';
import { rows } from '@/lib/data/db';
import { managedTeamsQuery } from '@/lib/owner/queries';
import type { ManagedTeam } from '@/lib/owner/model';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Team brand studio | YOFHL', robots: { index: false, follow: false } };

export default async function AdminBrandingPage({ params }: { params: Promise<{ id: string }> }) {
    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id < 1) notFound();
    if (!(await isAdmin())) return <LoginForm next={`/admin/teams/${id}/branding`} configured={adminConfigured()} />;
    const team = (await rows<ManagedTeam>(managedTeamsQuery)).find(team => team.id === id);
    if (!team) notFound();
    return <BrandStudio team={team} admin />;
}
