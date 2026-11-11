'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { OWNER_EVENT, type OwnerEvent } from './entry-event';
import { VIEW_PANEL, VIEW_TAB, type PickemView } from './views';
import styles from './pickem.module.css';

const VIEWS: PickemView[] = ['picks', 'leaderboard'];
const LABEL: Record<PickemView, string> = { picks: 'Picks', leaderboard: 'Leaderboard' };
const PARAM = 'view';

interface Props {
    /** each entry's place as the leaderboard shows it ("T3"), by franchise id */
    places: Record<number, string>;
    /** the slate's panel, then the leaderboard rail's (pickem-page.tsx gives them their tab roles) */
    children: ReactNode;
}

// Below 1280px the leaderboard can't stand beside the slate, so the page splits into two tabs, Picks and Leaderboard: a
// white bar under the stage like the header's nav, the open tab in ink over a red rule. The bar pins to the top of the
// screen so the other tab is one tap away from any strip, and a switch made while it's pinned starts the other tab at its
// top. The Leaderboard tab carries the signed-in owner's place once their slate has said who they are (entry-event.ts).
// The open tab is kept in the address (?view=leaderboard) without a navigation, so a shared link opens on it while the
// page itself reads no search params and stays cached. From 1280px the bar hides and both panels show, side by side.
export default function PickemViews({ places, children }: Props) {
    const [view, setView] = useState<PickemView>('picks');
    const [franchiseId, setFranchiseId] = useState<number | null>(null);
    const [stuck, setStuck] = useState(false);
    // sits just above the bar: once it has scrolled off the top, the bar is pinned
    const sentinel = useRef<HTMLSpanElement>(null);
    const tabs = useRef<Partial<Record<PickemView, HTMLButtonElement | null>>>({});

    useEffect(() => {
        if (new URLSearchParams(window.location.search).get(PARAM) === 'leaderboard') setView('leaderboard');
        const listen = (event: Event) => setFranchiseId((event as CustomEvent<OwnerEvent>).detail.franchiseId);
        window.addEventListener(OWNER_EVENT, listen);
        return () => window.removeEventListener(OWNER_EVENT, listen);
    }, []);

    useEffect(() => {
        const mark = sentinel.current;
        if (!mark) return;
        const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0));
        observer.observe(mark);
        return () => observer.disconnect();
    }, []);

    function open(next: PickemView) {
        if (next === view) return;
        setView(next);
        const url = new URL(window.location.href);
        if (next === 'leaderboard') url.searchParams.set(PARAM, next); else url.searchParams.delete(PARAM);
        window.history.replaceState(window.history.state, '', url);
        const top = (sentinel.current?.getBoundingClientRect().top ?? 0) + window.scrollY;
        if (window.scrollY > top) window.scrollTo({ top });
    }

    // the tabs pattern: arrows (and Home, End) move between the two tabs and open the one they land on
    function keys(event: KeyboardEvent) {
        const other = VIEWS.find(option => option !== view)!;
        const next = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? other
            : event.key === 'Home' ? 'picks' : event.key === 'End' ? 'leaderboard' : null;
        if (!next) return;
        event.preventDefault();
        tabs.current[next]?.focus();
        open(next);
    }

    const place = franchiseId === null ? undefined : places[franchiseId];
    return <>
        <span ref={sentinel} className={styles.viewSentinel} aria-hidden="true" />
        <div className={styles.viewTabs} role="tablist" aria-label="Pick'em" data-stuck={stuck ? '' : undefined} onKeyDown={keys}>
            {VIEWS.map(option => <button key={option} ref={button => { tabs.current[option] = button; }} type="button" role="tab"
                id={VIEW_TAB[option]} aria-controls={VIEW_PANEL[option]} aria-selected={view === option} tabIndex={view === option ? 0 : -1}
                className={styles.viewTab} onClick={() => open(option)}>
                {LABEL[option]}
                {option === 'leaderboard' && place && <span className={styles.viewPlace}><span className="sr-only">, you&apos;re </span>{place}</span>}
            </button>)}
        </div>
        <div className={styles.layout} data-view={view}>{children}</div>
    </>;
}
