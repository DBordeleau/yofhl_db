'use client';

import { useEffect, useState } from 'react';
import { DRAFT_STARTS_AT, draftCountdown } from '@/lib/draft';
import styles from './draft-announcement.module.css';

const date = new Date(DRAFT_STARTS_AT);
const draftDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(date);
const draftTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit' }).format(date);
const units = ['Days', 'Hours', 'Minutes', 'Seconds'];

export default function DraftAnnouncement({ featured = false }: { featured?: boolean }) {
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

    if (countdown === null) return null;

    const when = <time dateTime={DRAFT_STARTS_AT}><span>{draftDate}</span><span className={styles.separator} aria-hidden="true">·</span><strong>{draftTime} Eastern</strong></time>;

    if (!featured) return <aside className={styles.notice} aria-label="Upcoming draft">
        <p><span className={styles.noticeTitle}>2026 Draft</span>{when}</p>
    </aside>;

    return <section className={styles.featured} aria-labelledby="draft-heading">
        <div className={styles.details}>
            <p className={styles.eyebrow}>Coming up · 2026–27 season</p>
            <h2 id="draft-heading">Draft night</h2>
            {when}
        </div>
        <div className={styles.countdown}>
            <p className={styles.countdownLabel}>On the clock in</p>
            <dl className={styles.clock} role="timer" aria-label="Time until the draft" aria-live="off">
                {units.map((unit, index) => <div key={unit}>
                    <dt>{unit}</dt>
                    <dd>{countdown ? String(countdown[index]).padStart(2, '0') : '—'}</dd>
                </div>)}
            </dl>
        </div>
    </section>;
}
