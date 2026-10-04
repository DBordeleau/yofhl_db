import { notFound } from 'next/navigation';
import AwardTable from '@/components/award-table';
import RinkDivider from '@/components/rink-divider';
import { AwardTrophyIcon } from '@/components/trophy-icons';
import { getAwardTypes, getAwardWinners } from '@/lib/data/league';
import { awardFromSlug, awardSlug } from '@/lib/league';

export async function generateStaticParams() {
    return (await getAwardTypes()).map((a) => ({ award: awardSlug(a.name) }));
}

// every winner of one award at /awards/[award], e.g. /awards/Wayne_Gretzky_Award
export default async function AwardPage({ params }: { params: Promise<{ award: string }> }) {
    const data = await getAwardWinners(awardFromSlug((await params).award));
    if (!data) notFound();
    const { award, winners } = data;

    return (
        <main className="mx-auto max-w-page px-4 pb-16 pt-6 md:px-8 md:pt-10 3xl:max-w-page-3xl 4xl:max-w-page-4xl">
            <section className="navy-spotlight relative flex flex-col items-center gap-4 overflow-hidden rounded-[22px] px-5 pb-[50px] pt-7 text-center text-white md:flex-row md:gap-8 md:rounded-[28px] md:px-12 md:pb-[54px] md:pt-10 md:text-left">
                <span className="relative flex h-[120px] w-[120px] flex-none items-end justify-center">
                    <span className="trophy-pool absolute bottom-0 left-1/2 h-7 w-[140px] -translate-x-1/2 rounded-full" />
                    <AwardTrophyIcon className="relative h-[110px] w-[98px] drop-shadow-[0_10px_24px_rgba(240,199,94,.45)]" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-extrabold uppercase tracking-[.2em] text-gold-light md:text-[13px] md:tracking-[.32em]">{award.description}</div>
                    <h1 className="font-wide mt-3 text-[28px] font-extrabold uppercase leading-none md:text-[46px]">{award.label}</h1>
                </div>
                <span className="banner-stripes absolute inset-x-0 bottom-[18px] h-3.5" />
            </section>
            <RinkDivider />
            <div className="mx-auto max-w-board">
                <AwardTable awardsData={winners} />
            </div>
        </main>
    );
}
