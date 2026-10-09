import Link from 'next/link';
import { notFound } from 'next/navigation';
import AwardTable from '@/components/award-table';
import RinkDivider from '@/components/rink-divider';
import { TrophyArt } from '@/components/trophy-icons';
import { AWARDS, awardHref, getAwardDefinition } from '@/lib/awards';
import { getAwardTypes, getAwardWinners, getTeamAwardWinners } from '@/lib/data/league';
import { awardFromSlug, awardSlug, seasonLabel } from '@/lib/league';

export async function generateStaticParams() {
    const names = new Set([...AWARDS.map((award) => award.name), ...(await getAwardTypes()).map((award) => award.name)]);
    return [...names].map((name) => ({ award: awardSlug(name) }));
}

export async function generateMetadata({ params }: { params: Promise<{ award: string }> }) {
    const name = awardFromSlug((await params).award);
    const definition = getAwardDefinition(name);
    return { title: `${definition?.label ?? name} · YOFHL DB`, description: definition?.description };
}

export default async function AwardPage({ params }: { params: Promise<{ award: string }> }) {
    const name = awardFromSlug((await params).award);
    const definition = getAwardDefinition(name);
    const teamAward = definition?.id === 'jagr-cup' || definition?.id === 'prime-minister' ? definition.id : null;
    const data = teamAward && definition
        ? { award: { name: definition.name, label: definition.label, description: definition.honor }, winners: await getTeamAwardWinners(teamAward) }
        : await getAwardWinners(definition?.name ?? name);
    if (!data) notFound();
    const { award, winners } = data;
    const latest = winners[0];
    const latestHref = latest?.PlayerID ? `/player/${encodeURIComponent(latest.PlayerID)}` : latest?.TeamID ? `/teams/${latest.TeamID}` : null;
    const label = definition?.label ?? award.label;

    return (
        <main className="mx-auto max-w-page px-4 pb-16 pt-5 md:px-8 md:pt-8 3xl:max-w-page-3xl 4xl:max-w-page-4xl">
            <Link href="/awards" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ink-muted hover:text-rink-blue"><span aria-hidden="true">←</span> All awards</Link>
            <section className="navy-spotlight relative overflow-hidden rounded-3xl border border-gold-light/20 text-white">
                <div className="grid items-center gap-3 px-5 pb-10 pt-5 md:grid-cols-[minmax(240px,.8fr)_minmax(0,1.2fr)] md:gap-8 md:px-10 md:py-12 lg:gap-14 lg:px-14">
                    <div className="relative flex justify-center">
                        <span className="trophy-pool absolute bottom-6 left-1/2 h-10 w-48 -translate-x-1/2 rounded-full md:bottom-8 md:w-64" />
                        <TrophyArt award={award.name} title={label} priority sizes="(min-width: 768px) 384px, 256px" className="relative h-64 w-64 max-w-full drop-shadow-[0_12px_28px_rgba(240,199,94,.18)] md:h-96 md:w-96" />
                    </div>
                    <div className="min-w-0 pb-4 text-center md:py-3 md:text-left">
                        <p className="text-xs font-extrabold uppercase tracking-[.2em] text-gold-light">{definition?.honor ?? award.description}</p>
                        <h1 className="font-wide mt-3 text-3xl font-extrabold uppercase leading-tight md:text-[40px] lg:text-[48px]">{label}</h1>
                        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-[#D8E2EF] md:mx-0 md:text-base">{definition?.description ?? award.description}</p>
                        {latest && <div className="mt-6 border-t border-white/15 pt-5">
                            <p className="text-[11px] font-bold uppercase tracking-[.15em] text-gold-light">Latest winner · {seasonLabel(latest.Year)}</p>
                            <p className="mt-2 text-xl font-extrabold">{latestHref ? <Link href={latestHref} className="underline-offset-4 hover:text-gold-light hover:underline">{latest.Winner} <span aria-hidden="true">↗</span></Link> : latest.Winner}</p>
                            {!teamAward && latest.Team && <p className="mt-1 text-sm text-[#AFC0D8]">{latest.Team}</p>}
                        </div>}
                    </div>
                </div>
                <div className="banner-stripes absolute inset-x-0 bottom-0 h-3.5" />
            </section>
            <RinkDivider />
            <section className="mx-auto max-w-board" aria-labelledby="winners-title">
                <div className="mb-4 flex items-baseline justify-between gap-4 px-1">
                    <h2 id="winners-title" className="font-wide text-xl font-extrabold uppercase md:text-2xl">Past winners</h2>
                    <span className="text-xs font-semibold text-ink-muted">{winners.length} awarded</span>
                </div>
                <AwardTable awardsData={winners} recipient={teamAward ? 'team' : 'player'} />
            </section>
            <div className="mt-8 text-center"><Link href={awardHref('jagr-cup') === awardHref(award.name) ? '/season' : '/awards'} className="inline-flex min-h-11 items-center text-sm font-bold text-rink-blue hover:underline">{definition?.id === 'jagr-cup' ? 'Visit the championship rafters' : 'Explore all league awards'} <span className="ml-2" aria-hidden="true">→</span></Link></div>
        </main>
    );
}
