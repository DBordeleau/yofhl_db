import { notFound } from 'next/navigation';
import AdminHeader from '@/components/admin/admin-header';
import LoginForm from '@/components/admin/login-form';
import ScriptEditor from '@/components/admin/coachs-corner-editor';
import { adminConfigured, isAdmin } from '@/lib/admin/auth';
import { getEpisodeById, getStudioBanners, getStudioTeams, pilotEpisode } from '@/lib/data/coachs-corner';

export const dynamic = 'force-dynamic';

export default async function EditEpisode({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
    const { id } = await params;
    if (!(await isAdmin())) return <LoginForm next={`/admin/coachs-corner/${id}`} configured={adminConfigured()} />;
    const [teams, banners] = await Promise.all([getStudioTeams(), getStudioBanners()]);

    if (id === 'new') {
        const { from } = await searchParams;
        const pilot = pilotEpisode();
        const blank = '---\ntitle: \nweek: \n---\n\n[don: rest, ron: rest]\n\nRON: \n\nDON: \n';
        return (
            <>
                <AdminHeader title="New episode" back />
                <ScriptEditor episode={{ id: null, slug: from === 'pilot' ? `${pilot.slug}-copy` : '', script: from === 'pilot' ? pilot.script : blank, publishedAt: null }} teams={teams} banners={banners} />
            </>
        );
    }

    const episode = /^\d+$/.test(id) ? await getEpisodeById(Number(id)) : null;
    if (!episode) notFound();
    return (
        <>
            <AdminHeader title="Edit episode" back />
            <ScriptEditor episode={episode} teams={teams} banners={banners} />
        </>
    );
}
