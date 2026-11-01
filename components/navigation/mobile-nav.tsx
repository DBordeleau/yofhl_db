'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FiHome, FiShield, FiUser, FiMoreHorizontal, FiX } from 'react-icons/fi';
import { isPrivateRoute } from '@/lib/navigation';
import styles from './mobile-nav.module.css';

export type MobileSheet = 'teams' | 'players' | 'seasons' | 'more';

const pennant = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3h18M6 3v16l6-3.5 6 3.5V3" /></svg>;

// each tab mirrors a desktop menu; More holds the awards menu, Coach's Corner and the account
const TABS: { id: MobileSheet; label: string; icon: ReactNode; matches: (pathname: string) => boolean }[] = [
    { id: 'teams', label: 'Teams', icon: <FiShield aria-hidden="true" />, matches: (path) => path.startsWith('/teams') || path.startsWith('/compare/teams') },
    { id: 'players', label: 'Players', icon: <FiUser aria-hidden="true" />, matches: (path) => path.startsWith('/stats') || path.startsWith('/player') || path.startsWith('/compare/players') },
    { id: 'seasons', label: 'Seasons', icon: pennant, matches: (path) => path.startsWith('/season') },
    { id: 'more', label: 'More', icon: <FiMoreHorizontal aria-hidden="true" />, matches: (path) => /^\/(awards|records|coachs-corner)(\/|$)/.test(path) },
];

export default function MobileNav({ sheets }: { sheets: Record<MobileSheet, ReactNode> }) {
    const pathname = usePathname();
    const [open, setOpen] = useState<MobileSheet | null>(null);
    const sheet = useRef<HTMLElement>(null);
    const opener = useRef<HTMLButtonElement | null>(null);

    useEffect(() => setOpen(null), [pathname]);
    useEffect(() => {
        const desktop = window.matchMedia('(min-width: 1024px)');
        const close = () => { if (desktop.matches) setOpen(null); };
        desktop.addEventListener('change', close);
        return () => desktop.removeEventListener('change', close);
    }, []);

    const close = () => {
        setOpen(null);
        if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    };

    // an open sheet holds the page still, takes focus and closes on Escape
    useEffect(() => {
        if (!open) return;
        const overflow = document.body.style.overflowY;
        document.body.style.overflowY = 'hidden';
        sheet.current?.focus({ preventScroll: true });
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setOpen(null);
            if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflowY = overflow;
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    if (isPrivateRoute(pathname)) return null;
    const title = TABS.find((tab) => tab.id === open)?.label;
    return <div className={styles.shell} data-mobile-navigation>
        {open && <>
            <div className={styles.scrim} aria-hidden="true" onClick={close} />
            <section ref={sheet} id="mobile-menu-sheet" className={styles.sheet} aria-labelledby="mobile-menu-title" tabIndex={-1}
                onClick={(event) => { if ((event.target as Element).closest('a')) setOpen(null); }}>
                <div className={styles.heading}>
                    <h2 id="mobile-menu-title">{title}</h2>
                    <button type="button" aria-label={`Close ${title?.toLowerCase()}`} onClick={close}><FiX aria-hidden="true" /></button>
                </div>
                <div className={styles.body}>{sheets[open]}</div>
            </section>
        </>}
        <nav className={styles.bar} aria-label="Mobile navigation">
            <Link prefetch={false} href="/" aria-current={pathname === '/' ? 'page' : undefined} data-active={(pathname === '/' && !open) || undefined} onClick={() => setOpen(null)}>
                <FiHome aria-hidden="true" /><span>Home</span>
            </Link>
            {TABS.map((tab) => <button key={tab.id} type="button" aria-expanded={open === tab.id} aria-controls={open === tab.id ? 'mobile-menu-sheet' : undefined}
                data-active={(open ? open === tab.id : tab.matches(pathname)) || undefined}
                onClick={(event) => {
                    if (open === tab.id) return close();
                    opener.current = event.currentTarget;
                    setOpen(tab.id);
                }}>
                {tab.icon}<span>{tab.label}</span>
            </button>)}
        </nav>
    </div>;
}
