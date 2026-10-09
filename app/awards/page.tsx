import type { Metadata } from 'next';
import Link from 'next/link';
import { TrophyArt } from '@/components/trophy-icons';
import TrophySparkles from '@/components/trophy-sparkles';
import { AWARDS, awardHref } from '@/lib/awards';
import Arrow from '@/components/arrow';

export const metadata: Metadata = {
    title: 'League awards · YOFHL DB',
    description: 'Explore the eight YOFHL trophies, what they honour, and the teams and players who have won them.',
};

export default function AwardsPage() {
    return (
        <main className="mx-auto max-w-page px-4 pb-16 pt-8 md:px-8 md:pt-12 3xl:max-w-page-3xl 4xl:max-w-page-4xl">
            <header className="mb-8 max-w-2xl md:mb-10">
                <h1 className="font-wide text-4xl font-extrabold uppercase md:text-5xl">League awards</h1>
            </header>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
                {AWARDS.map((award, index) => <Link key={award.id} href={awardHref(award.name)} className={`trophy-tile group relative flex flex-col items-center overflow-hidden rounded-3xl border px-5 pb-6 pt-4 text-center text-white transition-colors hover:border-gold-light/60 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-rink-blue ${index === 0 ? 'border-gold shadow-[0_0_0_1px_rgba(240,199,94,.3)]' : 'border-gold-light/20'}`}>
                    <span className="trophy-pool absolute left-1/2 top-48 h-7 w-40 -translate-x-1/2 rounded-full" />
                    <span className="relative h-56 w-56 max-w-full">
                        <TrophyArt award={award.name} sizes="224px" priority={index < 4} className={`relative h-full w-full drop-shadow-[0_8px_20px_rgba(240,199,94,.16)] ${index === 0 ? 'scale-110' : ''}`} />
                        <TrophySparkles seed={`gallery-${award.id}`} />
                    </span>
                    <span className="relative mt-2 text-[10px] font-extrabold uppercase tracking-[.15em] text-gold-light">{award.honor}</span>
                    <h2 className="font-wide relative mt-2 text-lg font-extrabold leading-snug">{award.label}</h2>
                    <span className="relative mt-auto pt-5 text-xs font-semibold text-[#BDCCE0] group-hover:text-white">See winners <Arrow /></span>
                </Link>)}
            </div>
        </main>
    );
}
