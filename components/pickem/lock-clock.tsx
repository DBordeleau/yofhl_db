'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './pickem.module.css';

// The week's lock as a broadcast clock: a countdown while the week is open (red in its last hour), the lock time
// once it has passed. At zero the page refreshes, so the slate turns into the breakdown without a reload.

const lockTime = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

const HOUR = 3_600_000;

function parts(left: number) {
    const seconds = Math.max(0, Math.floor(left / 1000));
    return { d: Math.floor(seconds / 86_400), h: Math.floor(seconds / 3600) % 24, m: Math.floor(seconds / 60) % 60, s: seconds % 60 };
}

const two = (value: number) => String(value).padStart(2, '0');

export default function LockClock({ lock, locked }: { lock: string; locked: boolean }) {
    const router = useRouter();
    const at = new Date(lock).getTime();
    const [now, setNow] = useState(() => Date.now());
    const left = at - now;
    const done = locked || left <= 0;

    useEffect(() => {
        if (done) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [done]);

    useEffect(() => {
        if (!locked && left <= 0) router.refresh();
    }, [locked, left <= 0, router]); // eslint-disable-line react-hooks/exhaustive-deps

    const when = `${lockTime.format(new Date(lock))} ET`;
    if (done) return <div className={styles.clock} data-locked="">
        <span className={styles.clockLabel}>Locked</span>
        <span className={styles.clockTime}>{when}</span>
    </div>;

    const { d, h, m, s } = parts(left);
    const units = [...(d ? [{ key: 'd', value: String(d) }] : []), { key: 'h', value: two(h) }, { key: 'm', value: two(m) }, { key: 's', value: two(s) }];
    return <div className={styles.clock} data-urgent={left < HOUR ? '' : undefined} role="timer" aria-label={`Locks ${when}`}>
        <span className={styles.clockLabel} aria-hidden="true">Locks on<small>{when}</small></span>
        <span className={styles.clockTime} aria-hidden="true">
            {units.map(unit => <span key={unit.key} className={styles.unit}>
                <b key={unit.value} className={styles.tick} suppressHydrationWarning>{unit.value}</b>
                <small>{unit.key}</small>
            </span>)}
        </span>
    </div>;
}
