"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { AwardType } from "@/lib/data/league";
import { awardSlug } from "@/lib/league";
import LotteryNavLink from '@/components/lottery/nav-link';

const Header: React.FC<{ awards: AwardType[] }> = ({ awards }) => {
    const pathname = usePathname();
    const [isMenuOpen, setIsMenuOpen] = useState(false); // mobile menu state
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLLIElement>(null);

    const navItems = [
        { name: "Leaderboards", href: "/stats/all-time/all", isActive: pathname.startsWith("/stats") || pathname.startsWith("/player") },
        { name: "Compare", href: "/compare", isActive: pathname.startsWith("/compare") },
        { name: "Teams", href: "/teams/stats", isActive: pathname.startsWith("/teams") },
        { name: "Champions", href: "/champions", isActive: pathname.startsWith("/champions") },
    ];
    const awardsActive = pathname.startsWith("/awards");

    // award dropdown links
    const awardItems = awards.map((award) => ({
        name: award.label,
        description: award.description,
        href: `/awards/${awardSlug(award.name)}`,
    }));

    useEffect(() => {
        setIsDropdownOpen(false);
        setIsMenuOpen(false);
    }, [pathname]);

    // close the awards dropdown on outside click or escape
    useEffect(() => {
        if (!isDropdownOpen) return;
        const onClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsDropdownOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsDropdownOpen(false);
        };
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onClick);
            document.removeEventListener("keydown", onKey);
        };
    }, [isDropdownOpen]);

    const linkClass = (active: boolean) =>
        `relative inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-[15px] font-semibold transition-colors hover:bg-rink-wash hover:text-ink ${active
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
            <nav className="mx-auto flex min-h-16 max-w-page 3xl:max-w-page-3xl 4xl:max-w-page-4xl items-center gap-2 px-4 md:min-h-[76px] md:px-8 lg:gap-4" aria-label="Primary">
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
                <ul className="ml-auto hidden items-center gap-0.5 lg:flex">
                    {navItems.map((item) => (
                        <li key={item.name}>
                            <Link href={item.href} className={linkClass(item.isActive)} aria-current={item.isActive ? "page" : undefined}>
                                {item.name}
                            </Link>
                        </li>
                    ))}
                    <li className="relative" ref={dropdownRef}>
                        <button
                            type="button"
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
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
                                    className="absolute right-0 mt-2 w-72 overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-[0_24px_48px_-24px_rgba(31,39,69,.45)]"
                                >
                                    {awardItems.map((award) => (
                                        <li key={award.name}>
                                            <Link
                                                href={award.href}
                                                className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3.5 py-2 text-[15px] font-semibold text-ink hover:bg-rink-wash"
                                            >
                                                {award.name}
                                                <span className="text-xs font-semibold text-ink-muted">{award.description}</span>
                                            </Link>
                                        </li>
                                    ))}
                                </motion.ul>
                            )}
                        </AnimatePresence>
                    </li>
                </ul>

                <div className="ml-auto lg:ml-0"><LotteryNavLink /></div>
                <button // hamburger button
                    type="button"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line text-ink lg:hidden"
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
                            {navItems.map((item) => (
                                <li key={item.name}>
                                    <Link href={item.href} className={`${linkClass(item.isActive)} min-h-12 w-full text-[17px] after:!right-auto after:w-6`}>
                                        {item.name}
                                    </Link>
                                </li>
                            ))}
                            <li>
                                <button
                                    type="button"
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className={`${linkClass(awardsActive)} min-h-12 w-full text-[17px] after:!right-auto after:w-6`}
                                    aria-expanded={isDropdownOpen}
                                >
                                    Awards {chevron(isDropdownOpen)}
                                </button>
                                {isDropdownOpen && (
                                    <ul className="ml-3.5 border-l-2 border-line-soft pl-2">
                                        {awardItems.map((award) => (
                                            <li key={award.name}>
                                                <Link href={award.href} className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 text-[15px] font-semibold text-ink-soft hover:bg-rink-wash">
                                                    {award.name}
                                                    <span className="text-xs text-ink-muted">{award.description}</span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </header>
    );
};

export default Header;
