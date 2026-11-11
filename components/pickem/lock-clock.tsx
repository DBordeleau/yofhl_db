'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type CSSProperties } from 'react';
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

// One figure of the clock. Only a figure whose value changed rolls: the old one drops out as the new one drops in,
// and a carry ripples leftward a beat at a time (--place counts figures from the right of the clock).
function Figure({ value, place }: { value: string; place: number }) {
    const [roll, setRoll] = useState<{ now: string; was: string | null }>({ now: value, was: null });
    if (roll.now !== value) setRoll({ now: value, was: roll.now });
    return <span className={styles.figure} style={{ '--place': place } as CSSProperties}>
        {roll.was !== null && <span key={`was-${roll.now}`} className={styles.figureOut}>{roll.was}</span>}
        <span key={roll.now} className={roll.was !== null ? styles.figureIn : undefined} suppressHydrationWarning>{roll.now}</span>
    </span>;
}

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
    let place = units.reduce((sum, unit) => sum + unit.value.length, 0);
    return <div className={styles.clock} data-urgent={left < HOUR ? '' : undefined} role="timer" aria-label={`Locks ${when}`}>
        <span className={styles.clockLabel} aria-hidden="true">Locks on<small>{when}</small></span>
        <span className={styles.clockTime} aria-hidden="true">
            {units.map(unit => <span key={unit.key} className={styles.unit}>
                <b>{[...unit.value].map((figure, i) => <Figure key={unit.value.length - i} value={figure} place={--place} />)}</b>
                <small>{unit.key}</small>
            </span>)}
        </span>
    </div>;
}
