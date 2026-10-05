import { redirect } from 'next/navigation';
import BrandStudio from '@/components/team-branding/brand-studio';
import { ownerSession } from '@/lib/owner/auth';
import { rows } from '@/lib/data/db';
import { managedTeamsQuery } from '@/lib/owner/queries';
import type { ManagedTeam } from '@/lib/owner/model';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Brand studio | YOFHL', robots: { index: false, follow: false } };

export default async function OwnerBrandingPage() {
    const user = await ownerSession();
    if (!user) redirect('/owner');
    const team = (await rows<ManagedTeam>(managedTeamsQuery)).find(team => team.ownerUid === user.uid && !team.defunct);
    if (!team) redirect('/owner');
    return <BrandStudio team={team} />;
}
