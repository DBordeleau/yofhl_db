'use client';

import { FC, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { BannerSeason } from '@/lib/data/league';
import { seasonLabel } from '@/lib/league';
import TeamBadge from '@/components/team-badge';

// Jagr Cup championship banners hanging from the rafters. Each links to that season's historical summary.
const ChampionBanners: FC<{ seasons: BannerSeason[] }> = ({ seasons }) => {
    // a season in progress has no champion yet and gets no banner
    const banners = seasons.filter((s) => s.team || s.playoffStatus === 'cancelled');
    const pathname = usePathname();
    const match = pathname.match(/^\/season\/(\d{4})/);
    const selectedYear = match ? parseInt(match[1], 10) : null;
    const bannerRefs = useRef<Record<number, HTMLElement | null>>({});
    const railRef = useRef<HTMLDivElement>(null);
    const latestYear = banners.at(-1)?.year;

    // Open the mobile rail at the latest season, or the season being viewed.
    useEffect(() => {
        const mobile = window.matchMedia('(max-width: 767px)');
        const positionRail = () => {
            const rail = railRef.current;
            if (!rail || !mobile.matches) return;
            const selected = selectedYear ? bannerRefs.current[selectedYear] : null;
            const left = selected
                ? rail.scrollLeft + selected.getBoundingClientRect().left - rail.getBoundingClientRect().left - (rail.clientWidth - selected.clientWidth) / 2
                : rail.scrollWidth - rail.clientWidth;
            rail.scrollTo({ left, behavior: 'instant' });
        };
        positionRail();
        mobile.addEventListener('change', positionRail);
        return () => mobile.removeEventListener('change', positionRail);
    }, [selectedYear, latestYear]);

    return (
        <section className="mx-auto max-w-page 3xl:max-w-page-3xl 4xl:max-w-page-4xl px-4 pt-4 md:px-8 md:pt-7" aria-label="Jagr Cup champions">
            <div className="relative z-[1] h-2 rounded-full bg-ink" />
            <div ref={railRef} className="flex snap-x gap-2.5 overflow-x-auto overflow-y-hidden px-1 pb-4 md:justify-center md:gap-3.5 md:overflow-visible md:pb-2 3xl:gap-5">
                {banners.map((champ, i) => {
                    const selected = champ.year === selectedYear;
                    const delay = { animationDelay: `${i * 90}ms` };

                    if (!champ.team) {
                        return (
                            <Link
                                key={champ.year}
                                href={`/season/${champ.year}`}
                                ref={(el) => { bannerRefs.current[champ.year] = el; }}
                                className="banner banner-void flex flex-none snap-start flex-col items-center focus-visible:rounded-md focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-rink-line"
                                style={delay}
                                aria-label={`${seasonLabel(champ.year)} playoffs cancelled, see the season's standings`}
                                aria-current={selected ? 'page' : undefined}
                            >
                                <span className={`banner-cord w-0.5 bg-ink-faint ${selected ? 'h-11' : 'h-[22px]'}`} />
                                <span className="banner-cloth relative flex h-[252px] w-[112px] flex-col items-center gap-2 bg-[#E3EAF2] px-2.5 pt-4 text-center text-ink-muted md:h-[300px] md:w-[140px] md:pt-[18px] 3xl:h-[340px] 3xl:w-40">
                                    <span className="tabular text-xs font-bold tracking-[.12em]">{seasonLabel(champ.year)}</span>
                                    <span className="font-wide mt-16 text-[11px] font-extrabold uppercase leading-tight md:text-xs">Playoffs<br />Cancelled</span>
                                    <span className="banner-stripes absolute inset-x-0 bottom-[38px] h-3.5 opacity-35 md:bottom-12 3xl:bottom-14" />
                                </span>
                            </Link>
                        );
                    }

                    return (
                        <Link
                            key={champ.year}
                            href={`/season/${champ.year}`}
                            ref={(el) => { bannerRefs.current[champ.year] = el; }}
                            className="banner flex flex-none snap-start flex-col items-center text-white focus-visible:rounded-md focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-rink-line"
                            style={delay}
                            aria-label={`${seasonLabel(champ.year)} Jagr Cup champions: ${champ.team}, owner ${champ.owner}`}
                            aria-current={selected ? 'page' : undefined}
                        >
                            <span className={`banner-cord w-0.5 bg-ink-faint ${selected ? 'h-11' : 'h-[22px]'}`} />
                            <span className={`banner-cloth relative flex h-[252px] w-[112px] flex-col items-center gap-1.5 px-2 pt-3.5 text-center md:h-[300px] md:w-[140px] md:gap-2 md:px-2.5 md:pt-[18px] 3xl:h-[340px] 3xl:w-40 3xl:pt-5 ${selected ? 'bg-rink-blue' : 'bg-ink'}`}>
                                <span className="tabular text-xs font-bold tracking-[.12em]">{seasonLabel(champ.year)}</span>
                                <span className="text-[9px] font-extrabold uppercase tracking-[.22em] text-gold-light">Champions</span>
                                <span className="my-1">
                                    <TeamBadge logo={champ.logo} abbreviation={champ.abbreviation} teamName={champ.team} size={84} sizeClass="h-[62px] w-[62px] md:h-[84px] md:w-[84px] 3xl:h-24 3xl:w-24" />
                                </span>
                                <span className="font-wide text-[10px] font-extrabold uppercase leading-tight md:text-xs 3xl:text-[13px]">{champ.team}</span>
                                <span className={`text-[10px] leading-snug md:text-[11px] ${selected ? 'text-[#DCEBFA]' : 'text-[#B9C6DA]'}`}>{champ.owner}</span>
                                <span className="banner-stripes absolute inset-x-0 bottom-[38px] h-3.5 md:bottom-12 3xl:bottom-14" />
                            </span>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
};

export default ChampionBanners;
