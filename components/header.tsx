"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { AwardType, BannerSeason } from "@/lib/data/league";
import { AWARDS, awardHref, getAwardDefinition } from "@/lib/awards";
import { formatFpts, seasonLabel } from "@/lib/league";
import { playerHref } from "@/lib/player-url";
import { TrophyArt } from '@/components/trophy-icons';
import DraftAnnouncement from '@/components/draft-announcement';
import TeamBadge from '@/components/team-badge';
import { useOwnerNavigation } from '@/lib/owner/navigation';
import KeeperReminder from '@/components/keepers/reminder';
import { KEEPERS_ENABLED } from '@/lib/keepers/model';
import Arrow from '@/components/arrow';
import MobileNav from '@/components/navigation/mobile-nav';
import { isPrivateRoute } from '@/lib/navigation';
import HeaderSearch from '@/components/search/header-search';
import NewEpisodeBadge from '@/components/coachs-corner/new-episode-badge';
import styles from './header.module.css';

export interface NavLeader { id: string; name: string; meta: string; points: number }
export interface NavFranchise { id: number; name: string; abbreviation: string; owner: string | null; logo: string | null }
export interface NavData {
    latestCoachsCornerEpisode: string | null;
    awards: AwardType[];
    seasons: BannerSeason[];
    franchises: NavFranchise[];
    allTime: NavLeader[];
    singleSeason: NavLeader[];
}

type Menu = 'players' | 'teams' | 'seasons' | 'awards';
const MENUS: { id: Menu; label: string }[] = [
    { id: 'players', label: 'Players' },
    { id: 'teams', label: 'Teams' },
    { id: 'seasons', label: 'Seasons' },
    { id: 'awards', label: 'Awards' },
];

const chevron = <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;

const Header: React.FC<NavData> = ({ awards, seasons, franchises, allTime, singleSeason, latestCoachsCornerEpisode }) => {
    const pathname = usePathname();
    const owner = useOwnerNavigation();
    const [open, setOpen] = useState<Menu | null>(null);
    const headerRef = useRef<HTMLElement>(null);

    const active: Record<Menu, boolean> = {
        players: pathname.startsWith('/stats') || pathname.startsWith('/player') || pathname.startsWith('/compare/players'),
        teams: pathname.startsWith('/teams') || pathname.startsWith('/compare/teams'),
        seasons: pathname.startsWith('/season'),
        awards: pathname.startsWith('/awards'),
    };
    const ownerActive = pathname.startsWith('/owner');
    const ownerLink = (
        <Link href="/owner" onClick={() => setOpen(null)} aria-current={ownerActive ? 'page' : undefined}
            className={`inline-flex min-h-11 w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-xl border px-4 py-1.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rink-blue focus-visible:ring-offset-2 ${ownerActive ? 'border-ink bg-ink text-white' : 'border-line-strong bg-ice text-ink hover:border-rink-blue hover:bg-rink-wash'}`}>
            {owner.team ? <TeamBadge logo={owner.team.logo} abbreviation={owner.team.abbreviation} teamName={owner.team.name} size={28} ring="none" />
                : <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>}
            {owner.signedIn ? 'Manage Team' : 'Sign in'}
        </Link>
    );

    const awardItems = [
        ...AWARDS.map((award) => ({ name: award.name, label: award.label, description: award.honor, href: awardHref(award.name) })),
        ...awards.filter((award) => !getAwardDefinition(award.name)).map((award) => ({ name: award.name, label: award.label, description: award.description, href: awardHref(award.name) })),
    ];
    // the rafters, newest champion first; a season in progress has no banner yet
    const banners = seasons.filter((s) => s.team || s.playoffStatus === 'cancelled').reverse();
    const currentSeason = [...seasons].reverse().find((s) => !s.team && s.playoffStatus !== 'cancelled');
    const teams = [...franchises].sort((a, b) => a.name.localeCompare(b.name));

    useEffect(() => {
        setOpen(null);
    }, [pathname]);

    // menus close on outside click or Escape
    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (!headerRef.current?.contains(e.target as Node)) setOpen(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            setOpen(null);
            headerRef.current?.querySelectorAll<HTMLButtonElement>(`[data-menu="${open}"]`).forEach(button => { if (button.getClientRects().length) button.focus(); });
        };
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const close = () => setOpen(null);
    const sideLink = (href: string, label: React.ReactNode) => <Link href={href} onClick={close}>{label} <Arrow /></Link>;

    const playerLinks = <>
        {sideLink('/stats/all-time/all', 'All-time leaderboard')}
        {sideLink('/stats/single-season/all', 'Single-season leaderboard')}
        {sideLink('/records?category=players#record-archive', 'Player records')}
        {sideLink('/compare/players', 'Compare players')}
    </>;
    const teamLinks = <>
        {sideLink('/teams/stats', 'All Teams')}
        {sideLink('/records?category=teams#record-archive', 'Team records')}
        {sideLink('/compare/teams', 'Compare teams')}
    </>;
    const seasonLinks = <>
        {sideLink('/#current-season', currentSeason ? `${seasonLabel(currentSeason.year)} · current` : 'Current season')}
        {sideLink('/season', 'All seasons')}
    </>;

    const leaderList = (title: string, leaders: NavLeader[]) => <div>
        <p className={styles.eyebrow}>{title}</p>
        <ol className={styles.leaders}>
            {leaders.map((leader, index) => <li key={`${leader.id}-${leader.meta}`}>
                <Link href={playerHref(leader.id)} onClick={close} className={styles.leaderRow}>
                    <span className={styles.leaderRank}>{index + 1}</span>
                    <span className={styles.leaderWho}><b>{leader.name}</b><small>{leader.meta}</small></span>
                    <span className={styles.leaderPoints}>{formatFpts(leader.points)}<small><abbr title="Fantasy points">FPts</abbr></small></span>
                </Link>
            </li>)}
        </ol>
    </div>;

    const teamGrid = <ul className={styles.teamGrid}>
        {teams.map((team) => <li key={team.id}>
            <Link href={`/teams/${team.id}`} onClick={close} className={styles.teamTile}>
                <TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={64} ring="none" sizeClass={styles.teamBadge} />
                <span><b>{team.name}</b></span>
            </Link>
        </li>)}
    </ul>;

    const bannerRail = <div className={styles.rafters}>
        <div className={styles.rafter} />
        <ul className={styles.rail}>
            {banners.map((season) => {
                const label = seasonLabel(season.year);
                return <li key={season.year}>
                    {season.team ? <Link href={`/season/${season.year}`} onClick={close} className={styles.banner} aria-label={`${label} Jagr Cup champions: ${season.team}`}>
                        <span className={styles.cord} />
                        <span className={styles.cloth}>
                            <span className={styles.bannerYear}>{label}</span>
                            <span className={styles.champions}>Champions</span>
                            <span className={styles.bannerBadge}><TeamBadge logo={season.logo} abbreviation={season.abbreviation} teamName={season.team} size={84} sizeClass={styles.bannerLogo} /></span>
                            <span className={styles.bannerTeam}>{season.team}</span>
                            {season.owner ? <span className={styles.bannerOwner}>{season.owner}</span> : null}
                            <span className={styles.stripes} />
                        </span>
                    </Link> : <Link href={`/season/${season.year}`} onClick={close} className={`${styles.banner} ${styles.bannerVoid}`} aria-label={`${label} playoffs cancelled`}>
                        <span className={styles.cord} />
                        <span className={styles.cloth}>
                            <span className={styles.bannerYear}>{label}</span>
                            <span className={styles.cancelled}>Playoffs<br />Cancelled</span>
                            <span className={styles.stripes} />
                        </span>
                    </Link>}
                </li>;
            })}
        </ul>
    </div>;

    const awardGrid = <ul className={styles.awardGrid}>
        {awardItems.map((award) => <li key={award.name}>
            <Link href={award.href} onClick={close} className={styles.awardTile}>
                <TrophyArt award={award.name} className={styles.awardArt} sizes="48px" />
                <span><b>{award.label}</b><small>{award.description}</small></span>
            </Link>
        </li>)}
    </ul>;

    const panels: Record<Menu, React.ReactNode> = {
        players: <>
            <div className={styles.side}><p className={styles.eyebrow}>Players</p>{playerLinks}</div>
            <div className={styles.leaderColumns}>{leaderList('All-time leaders', allTime)}{leaderList('Best single seasons', singleSeason)}</div>
        </>,
        teams: <>
            <div className={styles.side}><p className={styles.eyebrow}>Teams</p>{teamLinks}</div>
            <div><p className={styles.eyebrow}>Franchises</p>{teamGrid}</div>
        </>,
        seasons: <>
            <div className={styles.side}><p className={styles.eyebrow}>Seasons</p>{seasonLinks}</div>
            <div className="min-w-0">{bannerRail}</div>
        </>,
        awards: <>
            <div className={styles.side}><p className={styles.eyebrow}>Awards</p>{sideLink('/records', 'Record book')}</div>
            {awardGrid}
        </>,
    };

    return (
        <header ref={headerRef} className={styles.header}>
            <nav className="relative mx-auto flex min-h-16 max-w-page 3xl:max-w-page-3xl 4xl:max-w-page-4xl items-stretch gap-2 px-4 md:min-h-[76px] md:px-8" aria-label="Primary">
                <Link href="/" className={styles.brand} aria-label="YOFHL home">
                    <Image // logo made by Nick Kavanagh
                        src="/yofhldblogo.png"
                        alt=""
                        title="Logo by Nick Kavanagh"
                        width={52}
                        height={52}
                        className="h-11 w-11 object-contain md:h-[52px] md:w-[52px]"
                        priority
                    />
                    <strong className={`${styles.wordmark} hidden sm:block`}>YOFHL</strong>
                </Link>

                {/* desktop/large display nav */}
                <ul className={styles.menu}>
                    {MENUS.map((menu) => <li key={menu.id}>
                        <button type="button" data-menu={menu.id} className={styles.item} data-active={active[menu.id] || undefined}
                            aria-expanded={open === menu.id} aria-controls={`nav-${menu.id}`}
                            onClick={() => setOpen(open === menu.id ? null : menu.id)}>
                            {menu.label} {chevron}
                        </button>
                    </li>)}
                    <li><Link href="/coachs-corner" className={styles.item} data-active={pathname.startsWith('/coachs-corner') || undefined} onClick={() => setOpen(null)}><span className={styles.coachsCornerLabel}>Coach&rsquo;s Corner<NewEpisodeBadge episodeKey={latestCoachsCornerEpisode} /></span></Link></li>
                </ul>

                {!isPrivateRoute(pathname) && <HeaderSearch onOpen={close} />}
                <div className={`shrink-0 self-center border-l border-line pl-3 ${isPrivateRoute(pathname) ? 'ml-auto block lg:ml-0' : 'hidden lg:block'}`}>{ownerLink}</div>
            </nav>

            <AnimatePresence>
                {open && (
                    <motion.div
                        key={open}
                        id={`nav-${open}`}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.16 }}
                        className={styles.mega}
                    >
                        <div className={`mx-auto max-w-page 3xl:max-w-page-3xl 4xl:max-w-page-4xl px-4 md:px-8 ${styles.megaInner}`}>{panels[open]}</div>
                    </motion.div>
                )}
            </AnimatePresence>

            <MobileNav accountAction={ownerLink} latestCoachsCornerEpisode={latestCoachsCornerEpisode} />
            {pathname !== '/' && <DraftAnnouncement />}
            {KEEPERS_ENABLED && owner.keepers && <KeeperReminder state={owner.keepers} />}
        </header>
    );
};

export default Header;
