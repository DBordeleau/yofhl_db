'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FiHome, FiSearch, FiBarChart2, FiGrid, FiArrowRight } from 'react-icons/fi';
import Dialog from '@/components/dialog';
import NewEpisodeBadge from '@/components/coachs-corner/new-episode-badge';
import { BROWSE_LINKS, isPrivateRoute } from '@/lib/navigation';
import styles from './mobile-nav.module.css';

export default function MobileNav({ accountAction, latestCoachsCornerEpisode }: { accountAction: ReactNode; latestCoachsCornerEpisode: string | null }) {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    useEffect(() => setOpen(false), [pathname]);
    useEffect(() => {
        const desktop = window.matchMedia('(min-width: 1024px)');
        const close = () => { if (desktop.matches) setOpen(false); };
        desktop.addEventListener('change', close);
        return () => desktop.removeEventListener('change', close);
    }, []);
    if (isPrivateRoute(pathname)) return null;
    const browseActive = pathname !== '/' && !pathname.startsWith('/search') && !pathname.startsWith('/compare');
    return <div className={styles.shell} data-mobile-navigation>
        <nav className={styles.bar} aria-label="Mobile navigation">
            <Link prefetch={false} href="/" aria-current={pathname === '/' ? 'page' : undefined}><FiHome aria-hidden="true" /><span>Home</span></Link>
            <button type="button" onClick={() => {
                const input = document.getElementById('header-search');
                input?.focus(); input?.scrollIntoView({ block: 'center' });
            }}><FiSearch aria-hidden="true" /><span>Search</span></button>
            <Link prefetch={false} href="/compare/players" aria-current={pathname.startsWith('/compare') ? 'page' : undefined}><FiBarChart2 aria-hidden="true" /><span>Compare</span></Link>
            <button type="button" aria-haspopup="dialog" aria-expanded={open} data-active={browseActive || undefined} onClick={() => setOpen(true)}><FiGrid aria-hidden="true" /><span>Browse</span></button>
        </nav>
        {open && <Dialog title="Browse the league" onClose={() => setOpen(false)}>
            <nav aria-label="Browse" className={styles.links}>
                {BROWSE_LINKS.map(link => <Link prefetch={false} href={link.href} key={link.href} onClick={() => setOpen(false)}><span><strong>{link.label}{link.href === '/coachs-corner' && <NewEpisodeBadge episodeKey={latestCoachsCornerEpisode} />}</strong><small>{link.detail}</small></span><FiArrowRight aria-hidden="true" /></Link>)}
            </nav>
            <div className={styles.account} onClick={event => { if ((event.target as Element).closest('a')) setOpen(false); }}>{accountAction}</div>
        </Dialog>}
    </div>;
}
