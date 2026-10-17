import { redirect } from 'next/navigation';
import BrandStudio from '@/components/team-branding/brand-studio';
import { ownerSession } from '@/lib/owner/auth';
import { rows } from '@/lib/data/db';
import { ownedTeamQuery } from '@/lib/owner/queries';
import type { ManagedTeam } from '@/lib/owner/model';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Brand studio | YOFHL', robots: { index: false, follow: false } };

export default async function OwnerBrandingPage() {
    const user = await ownerSession();
    if (!user) redirect('/owner');
    const team = (await rows<ManagedTeam>(ownedTeamQuery(user.uid)))[0];
    if (!team) redirect('/owner');
    return <BrandStudio team={team} />;
}
