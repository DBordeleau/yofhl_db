'use client';

import Link from 'next/link';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import NewEpisodeBadge from './new-episode-badge';
import styles from './page.module.css';

export interface PickerEpisode {
    slug: string;
    href: string;
    label: string | null;
    title: string;
    aired: string | null;
    airedIso: string | null;
    runtime: string;
    seenKey: string;
}

// The header's episode slot doubles as the way to every other episode: newest first,
// so a freshly published show lands on top without anyone touching this list.
// The side guide takes what's right of the slot, less a 20px gap and the 16px gutter,
// up to 360px; under 240px it drops down over the stage instead.
const SIDE_MIN = 240, SIDE_MAX = 360, SIDE_INSET = 36;

export default function EpisodePicker({ episodes, current }: { episodes: PickerEpisode[]; current: string }) {
    const [open, setOpen] = useState(false);
    // on wide screens the guide hangs beside the stage instead of over it
    const [side, setSide] = useState<number | null>(null);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const list = useRef<HTMLOListElement>(null);
    const listId = useId();
    const now = episodes.find(e => e.slug === current) ?? episodes[0];

    const links = () => Array.from(list.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
    const close = (refocus: boolean) => {
        setOpen(false);
        if (refocus) trigger.current?.focus();
    };

    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const room = window.innerWidth - (root.current?.getBoundingClientRect().right ?? window.innerWidth) - SIDE_INSET;
            setSide(room >= SIDE_MIN ? Math.min(room, SIDE_MAX) : null);
        };
        place();
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        // start on the episode that's showing, so a long archive opens where you are
        const here = links().find(a => a.getAttribute('aria-current'));
        (here ?? links()[0])?.focus({ preventScroll: true });
        here?.scrollIntoView({ block: 'nearest' });
        const away = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', away);
        return () => document.removeEventListener('pointerdown', away);
    }, [open]);

    const onKeyDown = (event: React.KeyboardEvent) => {
        // while the list is open, the player's page-wide shortcuts (space, j/k/l) stay out of it
        if (open) event.stopPropagation();
        if (event.key === 'Escape' && open) {
            close(true);
            return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        if (!open) {
            if (event.target === trigger.current && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                event.preventDefault();
                setOpen(true);
            }
            return;
        }
        const items = links();
        const at = items.indexOf(document.activeElement as HTMLAnchorElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
            : event.key === 'ArrowDown' ? Math.min(at + 1, items.length - 1) : Math.max(at - 1, 0);
        event.preventDefault();
        items[next]?.focus();
    };

    return (
        <div ref={root} className={styles.picker} data-open={open || undefined} data-side={side !== null || undefined}
            style={side !== null ? { '--side-width': `${side}px` } as React.CSSProperties : undefined} onKeyDown={onKeyDown}
            onBlur={event => { if (open && !root.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
            <button ref={trigger} type="button" className={styles.slot} aria-expanded={open} aria-controls={listId}
                aria-label={`Episode: ${[now.label, now.title].filter(Boolean).join(', ')}. Choose an episode`}
                onClick={() => setOpen(o => !o)}>
                {now.label && <b>{now.label}</b>}
                <span className={styles.slotTitle}>{now.title}</span>
                {now.aired && <time dateTime={now.airedIso!}>{now.aired}</time>}
                <svg className={styles.chevron} viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5 6 6.5l5-5" /></svg>
            </button>

            <div className={styles.guide} hidden={!open}>
                <ol ref={list} id={listId} aria-label="Episodes">
                    {episodes.map(e => (
                        <li key={e.slug}>
                            <Link href={e.href} aria-current={e.slug === current ? 'page' : undefined} onClick={() => close(false)}>
                                <span className={styles.slab}>{e.label ?? '—'}</span>
                                <span className={styles.name}>{e.title}</span>
                                <span className={styles.meta}>
                                    {e.slug !== current && <NewEpisodeBadge episodeKey={e.seenKey} />}
                                    {[e.aired, e.runtime].filter(Boolean).join(' · ')}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ol>
            </div>
        </div>
    );
}
