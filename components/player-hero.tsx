import { FC, ReactNode } from 'react';
import Link from 'next/link';
import TeamBadge from '@/components/team-badge';
import TeamBranding from '@/components/team-branding/team-branding';
import { CupRow } from '@/components/trophy-icons';
import { formatFpts, positionNames } from '@/lib/league';

interface PlayerHeroProps {
    name: string;
    positions: string[];
    team: { id: number; name: string; logoUrl: string | null; abbreviation: string } | null;
    championships: number;
    totalFPts: number;
    fpg: number;
    rank: number | null;
    rankNote?: string;
    seasons: number;
    actions?: ReactNode; // e.g. the Compare button
    header?: ReactNode; // optional tribute in place of the standard player header
}

// navy header band on /player/[ID] with the player's team, positions and Jagr Cups, followed by career totals
const PlayerHero: FC<PlayerHeroProps> = ({ name, positions, team, championships, totalFPts, fpg, rank, rankNote, seasons, actions, header }) => {
    const stats = [
        { label: 'All-Time FPts', value: formatFpts(totalFPts) },
        { label: 'FP/G', value: fpg.toFixed(2) },
        { label: 'All-Time Rank', value: rank ? `#${rank}` : '—', note: rankNote },
        { label: 'Seasons', value: String(seasons) },
    ];

    return (
        <TeamBranding as="section" teamId={team?.id} data-brand-layout="profile" className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
            {header ?? <>
                <div data-brand-part="surface" className="navy-spotlight relative flex flex-col items-start gap-4 overflow-hidden px-5 pb-6 pt-5 text-white md:flex-row md:items-center md:gap-7 md:px-10 md:py-9">
                    {/* centre ice markings, kept to the edge so they never sit behind the text */}
                    <svg data-brand-part="rink" className="pointer-events-none absolute -right-[70px] -top-[30px] h-[190px] w-[190px] md:-right-5 md:top-1/2 md:h-[300px] md:w-[300px] md:-translate-y-1/2" viewBox="0 0 300 300" fill="none" aria-hidden="true">
                        <line x1="150" y1="0" x2="150" y2="300" stroke="#E2475C" strokeWidth="5" strokeDasharray="12 8" opacity=".45" />
                        <circle cx="150" cy="150" r="110" stroke="#6FB1F2" strokeWidth="3" opacity=".4" />
                        <circle cx="150" cy="150" r="6" fill="#6FB1F2" opacity=".55" />
                    </svg>

                    {team && (
                        <Link href={`/teams/${team.id}`} aria-label={`${team.name} franchise page`} className="relative rounded-full">
                            <TeamBadge logo={team.logoUrl} abbreviation={team.abbreviation} teamName={team.name} size={112} sizeClass="h-[72px] w-[72px] md:h-28 md:w-28" priority />
                        </Link>
                    )}

                    <div className="relative min-w-0 md:max-w-[calc(100%-420px)]">
                        {team && (
                            <Link href={`/teams/${team.id}`} className="font-wide inline-flex max-w-[calc(100%-110px)] items-center gap-2.5 text-[13px] font-extrabold uppercase tracking-[.06em] text-white hover:underline md:max-w-none md:text-[15px]">
                                <b data-brand-part="accent" className="block h-[18px] w-1 flex-none rounded-sm bg-rink-red" />
                                {team.name}
                            </Link>
                        )}
                        <h1 className="font-wide mb-3 mt-2 text-[32px] font-extrabold uppercase leading-[.95] tracking-tight md:text-[60px] 3xl:text-[72px]">{name}</h1>
                        <div className="flex flex-wrap items-center gap-2.5 text-sm font-semibold text-[#B9C6DA]">
                            {positions.map((p) => (
                                <span key={p} className="rounded-md bg-white px-[7px] py-1 text-xs font-extrabold tracking-[.06em] text-ink">{p}</span>
                            ))}
                            <span>{positions.map((p) => positionNames[p] ?? p).join(' / ')}</span>
                            <span className="ml-1.5">
                                <CupRow count={championships} className="h-10 w-10 drop-shadow-[0_0_8px_rgba(240,199,94,.5)]" />
                            </span>
                        </div>
                        {actions && <div className="mt-4">{actions}</div>}
                    </div>
                </div>
                <div data-brand-part="stripes" className="banner-stripes h-3.5" />
            </>}
            <dl className="grid grid-cols-6 md:grid-cols-4">
                {stats.map((stat, i) => (
                    <div key={stat.label} className={`border-line-soft px-4 py-3.5 md:col-span-1 md:px-7 md:py-5 ${rankNote && i === 2 ? 'col-span-4' : rankNote && i === 3 ? 'col-span-2' : 'col-span-3'} ${i % 2 === 0 ? 'border-r' : ''} ${i < 2 ? 'border-b md:border-b-0' : ''} ${i === 1 ? 'md:border-r' : ''}`}>
                        <dt className="text-[11px] font-bold uppercase tracking-[.14em] text-ink-muted md:text-xs">{stat.label}</dt>
                        <dd className="mt-1.5">
                            <span className="font-wide tabular block text-[22px] font-extrabold md:text-[32px]">{stat.value}</span>
                            {stat.note && <span className="mt-1.5 block text-balance font-serif text-[13px] italic leading-5 text-rink-red">{stat.note}</span>}
                        </dd>
                    </div>
                ))}
            </dl>
        </TeamBranding>
    );
};

export default PlayerHero;
