"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { AwardType } from "@/lib/data/league";
import { AWARDS, awardHref, getAwardDefinition } from "@/lib/awards";
import { TrophyArt } from '@/components/trophy-icons';
import DraftAnnouncement from '@/components/draft-announcement';
import TeamBadge from '@/components/team-badge';
import { useOwnerNavigation } from '@/lib/owner/navigation';
import KeeperReminder from '@/components/keepers/reminder';
import { KEEPERS_ENABLED } from '@/lib/keepers/model';
import Arrow from '@/components/arrow';

const Header: React.FC<{ awards: AwardType[] }> = ({ awards }) => {
    const pathname = usePathname();
    const owner = useOwnerNavigation();
    const [isMenuOpen, setIsMenuOpen] = useState(false); // mobile menu state
    const [openDropdown, setOpenDropdown] = useState<'awards' | 'compare' | null>(null);
    const isDropdownOpen = openDropdown === 'awards';
    const isCompareOpen = openDropdown === 'compare';
    const dropdownRef = useRef<HTMLLIElement>(null);
    const mobileDropdownRef = useRef<HTMLLIElement>(null);
    const compareRef = useRef<HTMLLIElement>(null);
    const mobileCompareRef = useRef<HTMLLIElement>(null);

    const navItems = [
        { name: "Home", href: "/", isActive: pathname === "/" },
        { name: "Leaderboards", href: "/stats/all-time/all", isActive: pathname.startsWith("/stats") || pathname.startsWith("/player") },
        { name: "Compare", href: "/compare", isActive: pathname.startsWith("/compare") || pathname.startsWith("/demo/rivalries") },
        { name: "Teams", href: "/teams/stats", isActive: pathname.startsWith("/teams") },
        { name: "Seasons", href: "/season", isActive: pathname.startsWith("/season") },
    ];
    const compareItems = [
        { name: 'Players', href: '/compare', active: pathname.startsWith('/compare') },
        ...(process.env.NODE_ENV === 'development' ? [{ name: 'Teams', href: '/demo/rivalries', active: pathname.startsWith('/demo/rivalries') }] : []),
    ];
    const compareLinks = compareItems.map(item => <li key={item.name}>
        <Link href={item.href} aria-current={item.active ? 'page' : undefined}
            onClick={() => { setOpenDropdown(null); setIsMenuOpen(false); }}
            className={`flex min-h-12 items-center rounded-xl px-4 text-base font-semibold hover:bg-rink-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-rink-blue ${item.active ? 'bg-rink-wash text-rink-blue' : 'text-ink'}`}>
            {item.name}
        </Link>
    </li>);
    const awardsActive = pathname.startsWith("/awards");
    const ownerActive = pathname.startsWith('/owner');
    const ownerLink = (
        <Link href="/owner" onClick={() => setIsMenuOpen(false)} aria-current={ownerActive ? 'page' : undefined}
            className={`inline-flex min-h-11 w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-xl border px-4 py-1.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rink-blue focus-visible:ring-offset-2 ${ownerActive ? 'border-ink bg-ink text-white' : 'border-line-strong bg-ice text-ink hover:border-rink-blue hover:bg-rink-wash'}`}>
            {owner.team ? <TeamBadge logo={owner.team.logo} abbreviation={owner.team.abbreviation} teamName={owner.team.name} size={28} ring="none" />
                : <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>}
            {owner.signedIn ? 'Manage Team' : 'Sign in'}
        </Link>
    );

    // award dropdown links
    const awardItems = [
        ...AWARDS.map((award) => ({ name: award.label, description: award.honor, href: awardHref(award.name) })),
        ...awards.filter((award) => !getAwardDefinition(award.name)).map((award) => ({ name: award.label, description: award.description, href: awardHref(award.name) })),
    ];

    useEffect(() => {
        setOpenDropdown(null);
        setIsMenuOpen(false);
    }, [pathname]);

    // Both navigation disclosures close on outside click or Escape.
    useEffect(() => {
        if (!openDropdown) return;
        const refs = openDropdown === 'awards' ? [dropdownRef, mobileDropdownRef] : [compareRef, mobileCompareRef];
        const onClick = (e: MouseEvent) => {
            if (!refs.some(ref => ref.current?.contains(e.target as Node))) setOpenDropdown(null);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setOpenDropdown(null);
                refs.find(ref => ref.current?.getClientRects().length)?.current?.querySelector('button')?.focus();
            }
        };
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [openDropdown]);

    const linkClass = (active: boolean) =>
        `relative inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[15px] font-semibold transition-colors hover:bg-rink-wash hover:text-ink lg:px-2.5 xl:px-3.5 3xl:min-h-12 3xl:text-lg ${active
            ? "text-ink after:absolute after:inset-x-3.5 after:bottom-1 after:h-[3px] after:rounded-full after:bg-rink-red"
            : "text-ink-soft"
        }`;

    const chevron = (open: boolean) => (
        <svg className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
        </svg>
    );

    return (
        <header className="relative z-50 border-b border-line bg-white">
            <nav className="mx-auto flex min-h-16 max-w-page 3xl:max-w-page-3xl 4xl:max-w-page-4xl items-center gap-2 px-4 md:min-h-[76px] md:px-8 lg:gap-2.5 xl:gap-4" aria-label="Primary">
                <Link href="/" className="flex flex-none" aria-label="YOFHL Database home">
                    <Image // logo made by Nick Kavanagh
                        src="/yofhldblogo.png"
                        alt="YOFHL Database"
                        title="Logo by Nick Kavanagh"
                        width={52}
                        height={52}
                        className="h-11 w-11 object-contain md:h-[52px] md:w-[52px]"
                        priority
                    />
                </Link>

                {/* desktop/large display nav */}
                <ul className="hidden items-center gap-0.5 lg:flex">
                    {navItems.map((item) => item.name === 'Compare' ? (
                        <li key={item.name} className="relative" ref={compareRef}>
                            <button type="button" className={linkClass(item.isActive)}
                                aria-expanded={isCompareOpen} aria-controls="compare-links-desktop"
                                onClick={() => setOpenDropdown(isCompareOpen ? null : 'compare')}>
                                Compare {chevron(isCompareOpen)}
                            </button>
                            {isCompareOpen && <ul id="compare-links-desktop" className="absolute left-0 z-10 mt-2 w-48 rounded-2xl border border-line bg-white p-1.5 shadow-card">{compareLinks}</ul>}
                        </li>
                    ) : (
                        <li key={item.name}>
                            <Link href={item.href} className={linkClass(item.isActive)} aria-current={item.isActive ? "page" : undefined}>
                                {item.name}
                            </Link>
                        </li>
                    ))}
                    <li className="relative" ref={dropdownRef}>
                        <button
                            type="button"
                            onClick={() => setOpenDropdown(isDropdownOpen ? null : 'awards')}
                            className={linkClass(awardsActive)}
                            aria-expanded={isDropdownOpen}
                            aria-haspopup="true"
                        >
                            Awards {chevron(isDropdownOpen)}
                        </button>
                        <AnimatePresence>
                            {isDropdownOpen && (
                                <motion.ul
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.18 }}
                                    className="absolute z-10 right-0 mt-2 max-h-[80vh] w-80 overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-[0_24px_48px_-24px_rgba(31,39,69,.45)]"
                                >
                                    <li><Link href="/awards" className="mb-1 flex min-h-11 items-center justify-between rounded-xl bg-ice px-3.5 text-sm font-extrabold text-ink hover:bg-rink-wash">All league awards <Arrow /></Link></li>
                                    {awardItems.map((award) => (
                                        <li key={award.name}>
                                            <Link
                                                href={award.href}
                                                className="flex min-h-14 items-center gap-2 rounded-xl px-2 py-1.5 text-[15px] font-semibold text-ink hover:bg-rink-wash"
                                            >
                                                <TrophyArt award={award.name} className="h-11 w-11" sizes="44px" />
                                                <span>{award.name}<span className="mt-0.5 block text-xs font-medium text-ink-muted">{award.description}</span></span>
                                            </Link>
                                        </li>
                                    ))}
                                </motion.ul>
                            )}
                        </AnimatePresence>
                    </li>
                </ul>

                <div className="ml-auto hidden shrink-0 border-l border-line pl-4 lg:block">{ownerLink}</div>
                <button // hamburger button
                    type="button"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line text-ink lg:hidden"
                    aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                    aria-expanded={isMenuOpen}
                >
                    <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                        {isMenuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
                    </svg>
                </button>
            </nav>

            {/* mobile/small display nav */}
            <AnimatePresence>
                {isMenuOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
                        className="overflow-hidden border-t border-line-soft bg-white lg:hidden"
                    >
                        <ul className="flex flex-col px-4 pb-4 pt-2">
                            {navItems.map((item) => item.name === 'Compare' ? (
                                <li key={item.name} ref={mobileCompareRef}>
                                    <button type="button" className={`${linkClass(item.isActive)} min-h-12 w-full text-[17px] after:!right-auto after:w-6`}
                                        aria-expanded={isCompareOpen} aria-controls="compare-links-mobile"
                                        onClick={() => setOpenDropdown(isCompareOpen ? null : 'compare')}>
                                        Compare {chevron(isCompareOpen)}
                                    </button>
                                    {isCompareOpen && <ul id="compare-links-mobile" className="ml-3.5 border-l-2 border-line-soft pl-2">{compareLinks}</ul>}
                                </li>
                            ) : (
                                <li key={item.name}>
                                    <Link href={item.href} className={`${linkClass(item.isActive)} min-h-12 w-full text-[17px] after:!right-auto after:w-6`}>
                                        {item.name}
                                    </Link>
                                </li>
                            ))}
                            <li ref={mobileDropdownRef}>
                                <button
                                    type="button"
                                    onClick={() => setOpenDropdown(isDropdownOpen ? null : 'awards')}
                                    className={`${linkClass(awardsActive)} min-h-12 w-full text-[17px] after:!right-auto after:w-6`}
                                    aria-expanded={isDropdownOpen}
                                >
                                    Awards {chevron(isDropdownOpen)}
                                </button>
                                {isDropdownOpen && (
                                    <ul className="ml-3.5 border-l-2 border-line-soft pl-2">
                                        <li><Link href="/awards" className="flex min-h-11 items-center px-3 text-sm font-extrabold text-rink-blue hover:underline">All league awards <Arrow /></Link></li>
                                        {awardItems.map((award) => (
                                            <li key={award.name}>
                                                <Link href={award.href} className="flex min-h-14 items-center gap-2 rounded-xl px-2 py-1.5 text-[15px] font-semibold text-ink-soft hover:bg-rink-wash">
                                                    <TrophyArt award={award.name} className="h-11 w-11" sizes="44px" />
                                                    <span>{award.name}<span className="mt-0.5 block text-xs font-medium text-ink-muted">{award.description}</span></span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                            <li className="mt-3 border-t border-line pt-4">{ownerLink}</li>
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
            {pathname !== '/' && <DraftAnnouncement />}
            {KEEPERS_ENABLED && owner.keepers && <KeeperReminder state={owner.keepers} />}
        </header>
    );
};

export default Header;
