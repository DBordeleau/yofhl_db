import Link from 'next/link';
import type { ManagedTeam } from '@/lib/owner/model';
import TeamColourEditor from './colour-editor';
import Arrow from '@/components/arrow';

export default function BrandStudio({ team, admin = false }: { team: ManagedTeam; admin?: boolean }) {
    const Container = admin ? 'div' : 'main';
    return <Container className="mx-auto max-w-[1060px] px-4 py-8 md:px-8 md:py-12">
        <Link href={admin ? '/admin/teams' : '/owner'} className="mb-7 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ink-muted hover:text-rink-blue"><Arrow direction="left" /> {admin ? 'Team administration' : 'Manage my team'}</Link>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-rink-red">{team.name}</p>
        <h1 className="mt-3 font-wide text-3xl font-extrabold uppercase tracking-tight sm:text-4xl">Brand studio</h1>
        <p className="mb-8 mt-4 max-w-2xl text-sm leading-6 text-ink-soft">Choose your club’s colours and banner style. Preview your changes, then save to bring them to your roster, team page and player profiles.</p>
        <TeamColourEditor team={{ id: team.id, name: team.name, logo: team.logo, abbreviation: team.abbreviation, version: team.version, branding: team.branding }} />
        <nav aria-label="View team branding" className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-rink-blue">
            <Link href={`/teams/${team.id}`} className="hover:underline">Team profile <Arrow /></Link>
            <Link href={`/?roster=${team.id}#rosters`} className="hover:underline">Home roster <Arrow /></Link>
            <Link href="/teams/stats" className="hover:underline">League teams <Arrow /></Link>
        </nav>
    </Container>;
}
