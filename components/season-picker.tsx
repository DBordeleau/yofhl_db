'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import TeamBadge from '@/components/team-badge';
import type { BannerSeason } from '@/lib/data/league';
import { seasonLabel } from '@/lib/league';
import styles from './season-page.module.css';

// The season's year in the hero. On phones, where the banner rail is hidden, the year is also the switch: tapping it opens every season.
export default function SeasonPicker({ year, seasons }: { year: number; seasons: BannerSeason[] }) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const button = useRef<HTMLButtonElement>(null);
    const pathname = usePathname();

    useEffect(() => setOpen(false), [pathname]);
    useEffect(() => {
        if (!open) return;
        const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            setOpen(false);
            button.current?.focus();
        };
        document.addEventListener('pointerdown', dismiss);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('pointerdown', dismiss);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const label = seasonLabel(year);
    return <div ref={root} className={styles.picker}>
        <span className={styles.year}>{label}</span>
        <button ref={button} type="button" className={styles.yearButton} aria-expanded={open} aria-controls="season-list" onClick={() => setOpen(!open)}>
            <span className={styles.year}>{label}</span>
            <span className={styles.chevron} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg></span>
            <span className="sr-only">Choose a season</span>
        </button>
        {open && <nav id="season-list" className={styles.guide} aria-label="Seasons">
            <ul>
                {[...seasons].reverse().map((season) => <li key={season.year}>
                    <Link href={`/season/${season.year}`} className={styles.guideRow} aria-current={season.year === year ? 'page' : undefined} onClick={() => setOpen(false)}>
                        <span className={styles.guideSlab}>{season.label}</span>
                        {season.team ? <TeamBadge logo={season.logo} abbreviation={season.abbreviation} teamName={null} size={30} ring="none" /> : null}
                        <span className={styles.guideWho}><b>{season.team ?? 'Playoffs cancelled'}</b>{season.owner ? <small>{season.owner}</small> : null}</span>
                    </Link>
                </li>)}
            </ul>
        </nav>}
    </div>;
}
