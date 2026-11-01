import { FC, ReactNode } from 'react';
import Link from 'next/link';
import Arrow from '@/components/arrow';
import TeamBadge from '@/components/team-badge';
import TeamBranding from '@/components/team-branding/team-branding';
import { formatFpts, positionNames } from '@/lib/league';
import styles from './player-page.module.css';

interface PlayerHeroProps {
    name: string;
    positions: string[];
    team: { id: number; name: string; logoUrl: string | null; abbreviation: string } | null;
    span: string | null; // first to last season played
    totalFPts: number;
    fpg: number;
    rank: number | null;
    rankNote?: string;
    seasons: number;
    actions?: ReactNode; // e.g. the Compare button
    header?: ReactNode; // optional tribute in place of the standard player header
}

// The stage on /player/[ID]: the last club's colours behind the name, a flush stat bar of career totals, then the banner stripe
const PlayerHero: FC<PlayerHeroProps> = ({ name, positions, team, span, totalFPts, fpg, rank, rankNote, seasons, actions, header }) => {
    const stats = [
        { label: 'All-time FPts', value: formatFpts(totalFPts) },
        { label: 'FP/G', value: fpg.toFixed(2) },
        { label: 'All-time rank', value: rank ? `#${rank}` : '—', note: rankNote },
        { label: 'Seasons', value: String(seasons) },
    ];
    const statBar = (className: string) => (
        <div className={styles.bar}>
            <dl className={`${styles.stats} ${className}`}>
                {stats.map((stat) => (
                    <div key={stat.label} className={styles.stat}>
                        <dt>{stat.label}</dt>
                        <dd>
                            <span className={styles.value}>{stat.value}</span>
                            {stat.note && <span className={styles.note}>{stat.note}</span>}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );

    if (header) return (
        <div className={styles.wrap}>
            <Link href="/stats/all-time/all" className={styles.backLight}><Arrow direction="left" /> All-time leaderboard</Link>
            <section className={styles.memorial} aria-label={name}>
                {header}
                {statBar(styles.memorialStats)}
            </section>
        </div>
    );

    return (
        <TeamBranding as="section" teamId={team?.id} data-brand-layout="profile" className={styles.stage} aria-label={name}>
            <div data-brand-part="surface" className={`navy-spotlight ${styles.surface}`}>
                {/* centre ice markings, kept to the edge so they never sit behind the name */}
                <svg data-brand-part="rink" className={styles.rink} viewBox="0 0 300 300" fill="none" aria-hidden="true">
                    <line x1="150" y1="0" x2="150" y2="300" stroke="#E2475C" strokeWidth="5" strokeDasharray="12 8" opacity=".45" />
                    <circle cx="150" cy="150" r="110" stroke="#6FB1F2" strokeWidth="3" opacity=".4" />
                    <circle cx="150" cy="150" r="6" fill="#6FB1F2" opacity=".55" />
                </svg>
                <div className={`${styles.wrap} ${styles.inner}`}>
                    <div className={styles.top}>
                        <Link href="/stats/all-time/all" className={styles.back}><Arrow direction="left" /> All-time leaderboard</Link>
                        {actions && <div className={styles.actions}>{actions}</div>}
                    </div>
                    <div className={styles.identity}>
                        {team && (
                            <Link href={`/teams/${team.id}`} aria-label={`${team.name} franchise page`} className={styles.badge}>
                                <TeamBadge logo={team.logoUrl} abbreviation={team.abbreviation} teamName={team.name} size={124} sizeClass="h-[72px] w-[72px] md:h-[124px] md:w-[124px] 3xl:h-[150px] 3xl:w-[150px]" priority />
                            </Link>
                        )}
                        <div className={styles.identityText}>
                            <h1 className={styles.name}>{name}</h1>
                            <p className={styles.meta}>
                                <span>
                                    {positions.length > 0 && <span>{positions.map((p) => positionNames[p] ?? p).join(' / ')}</span>}
                                    {team && <span><Link href={`/teams/${team.id}`}>{team.name}</Link></span>}
                                    {span && <span>{span}</span>}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            {statBar(styles.wrap)}
            <div data-brand-part="stripes" className={`banner-stripes ${styles.stripes}`} />
        </TeamBranding>
    );
};

export default PlayerHero;
