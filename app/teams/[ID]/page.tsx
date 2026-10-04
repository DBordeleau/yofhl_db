import { notFound } from 'next/navigation';
import FadeIn from '@/components/fade-in';
import RinkDivider from '@/components/rink-divider';
import StatTable from '@/components/stat-table';
import TeamBadge from '@/components/team-badge';
import { getFranchise, getFranchiseCards } from '@/lib/data/league';

export async function generateStaticParams() {
    return (await getFranchiseCards()).map((t) => ({ ID: String(t.ID) }));
}

// a franchise's all-time fantasy point leaders at /teams/[ID]
export default async function TeamPage({ params }: { params: Promise<{ ID: string }> }) {
    const id = parseInt((await params).ID, 10);
    const team = isNaN(id) ? null : await getFranchise(id);
    if (!team) notFound();

    return (
        <main className="mx-auto max-w-page px-4 pb-16 pt-6 md:px-8 md:pt-10 3xl:max-w-page-3xl 4xl:max-w-page-4xl">
            <FadeIn>
                <section className="navy-spotlight relative flex flex-col items-center gap-5 overflow-hidden rounded-[22px] px-5 pb-[50px] pt-7 text-center text-white md:flex-row md:gap-9 md:rounded-[28px] md:px-12 md:pb-[54px] md:pt-10 md:text-left">
                    <TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={140} sizeClass="h-[110px] w-[110px] md:h-[140px] md:w-[140px]" ring="glow" priority />
                    <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-extrabold uppercase tracking-[.2em] text-gold-light md:text-[13px] md:tracking-[.32em]">All-Time Leaders</div>
                        <h1 className="font-wide my-3 text-[28px] font-extrabold uppercase leading-none md:text-[46px]">{team.name}</h1>
                        {team.formerNames.length > 0 && (
                            <div className="text-xs font-bold uppercase tracking-[.14em] text-[#9FB0C8]">Formerly {team.formerNames.join(' · ')}</div>
                        )}
                    </div>
                    <span className="banner-stripes absolute inset-x-0 bottom-[18px] h-3.5" />
                </section>
            </FadeIn>
            <RinkDivider />
            <div className="mx-auto max-w-board">
                <StatTable mode="all-time" topPlayers={team.leaders} currentPage={1} />
            </div>
        </main>
    );
}
