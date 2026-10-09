'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { DRAFT_STARTS_AT, draftCountdown } from '@/lib/draft';
import styles from './draft-announcement.module.css';

const date = new Date(DRAFT_STARTS_AT);
const noticeDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric' }).format(date);
const heroDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', weekday: 'long', month: 'short', day: 'numeric' }).format(date);
const draftTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' }).format(date);
const units = [['Days', 'days'], ['Hours', 'hrs'], ['Minutes', 'min'], ['Seconds', 'sec']];

// `notice` is the slim bar under the site navigation; `hero` fills the homepage hero's bottom bar and shows `fallback` once the draft starts.
export default function DraftAnnouncement({ variant = 'notice', fallback = null }: { variant?: 'notice' | 'hero'; fallback?: ReactNode }) {
    // Keep the initial render identical on the server and browser, even on cached pages.
    const [countdown, setCountdown] = useState<ReturnType<typeof draftCountdown>>();

    useEffect(() => {
        const update = () => {
            const next = draftCountdown(Date.now());
            setCountdown(next);
            if (next === null) clearInterval(timer);
        };
        const timer = setInterval(update, 1000);
        update();
        window.addEventListener('focus', update);
        return () => { clearInterval(timer); window.removeEventListener('focus', update); };
    }, []);

    if (countdown === null) return fallback;

    if (variant === 'notice') return <aside className={styles.notice} aria-label="Upcoming draft">
        <p>
            <span className={styles.heroTag}>Up next</span>
            <strong className={styles.noticeTitle}>2026 Draft</strong>
            <time dateTime={DRAFT_STARTS_AT}>{noticeDate} · {draftTime} ET</time>
            <span className={styles.noticeClock} role="timer" aria-label="Time until the draft">
                {countdown ? <>{countdown[0] > 0 && <>{countdown[0]}<small>d</small> </>}{String(countdown[1]).padStart(2, '0')}<small>h</small> {String(countdown[2]).padStart(2, '0')}<small>m</small></> : <>–<small>d</small> ––<small>h</small> ––<small>m</small></>}
            </span>
        </p>
    </aside>;

    return <section className={styles.hero} aria-labelledby="draft-heading">
        <div className={styles.heroDetails}>
            <span className={styles.heroTag}>Up next</span>
            <h2 id="draft-heading">2026 Draft</h2>
            <time dateTime={DRAFT_STARTS_AT}>{heroDate} · {draftTime} ET</time>
        </div>
        <dl className={styles.clock} role="timer" aria-label="Time until the draft" aria-live="off">
            {units.map(([unit, short], index) => <div key={unit}>
                <dt><abbr title={unit}>{short}</abbr></dt>
                <dd>{countdown ? String(countdown[index]).padStart(2, '0') : '––'}</dd>
            </div>)}
        </dl>
    </section>;
}
