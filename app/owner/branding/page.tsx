import { redirect } from 'next/navigation';
import BrandStudio from '@/components/team-branding/brand-studio';
import { ownerSession } from '@/lib/owner/owner-session';
import { getOwnedTeam } from '@/lib/owner/teams';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Brand studio · YOFHL', robots: { index: false, follow: false } };

export default async function OwnerBrandingPage() {
    const user = await ownerSession.currentOwner();
    if (!user) redirect('/owner');
    const team = await getOwnedTeam(user.uid);
    if (!team) redirect('/owner');
    return <BrandStudio team={team} />;
}
