'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Chevron } from '@/components/pickem/icons';
import type { PickemWeekOption } from '@/lib/pickem/create-pickem';
import styles from './pickem.module.css';

interface Props {
    weeks: PickemWeekOption[];
    selected: number;
    /** where each week lives: /pickem/week/[week] for the season being played */
    base?: string;
    /** the shown week's lock clock, set right after the week's name */
    clock?: ReactNode;
    /** the season, set small over the week's name on a phone, where the title has no room for it */
    season?: string;
}

// the slate on screen when a week is chosen; the next week's slate is a new element, so it never carries the mark
const leaving = (on: boolean) => document.querySelectorAll('[data-pickem-slate]').forEach(slate => slate.toggleAttribute('data-leaving', on));

// Every Pick'em week of the season on one line, with no scrolling: a stepper with the week's name, then a numbered tick
// per week on a row of its own (locked weeks dimmer) with a red slab under the one shown; phones keep the stepper only.
// Choosing a week slides the slab there at once and folds the old slate away while the next week loads
// (pickem.module.css, "a week change").
export default function WeekSwitcher({ weeks, selected, base = '/pickem/week', clock, season }: Props) {
    const [going, setGoing] = useState<number | null>(null);
    const shown = going ?? selected;
    const at = Math.max(0, weeks.findIndex(option => option.week === shown));
    const index = weeks.findIndex(option => option.week === selected);
    const previous = index > 0 ? weeks[index - 1] : null;
    const next = index >= 0 && index < weeks.length - 1 ? weeks[index + 1] : null;
    const name = weeks[at]?.name ?? `Week ${shown}`;

    // The next week has rendered: its slate is a new element, and the indicator settles on it.
    useEffect(() => { setGoing(null); }, [selected]);

    function go(week: number) {
        return (event: MouseEvent<HTMLAnchorElement>) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || week === selected) return;
            setGoing(week);
            leaving(true);
            // a navigation that never lands must not leave the slate folded
            window.setTimeout(() => leaving(false), 4000);
        };
    }

    const step = (option: PickemWeekOption | null, left: boolean) => option
        ? <Link href={`${base}/${option.week}`} scroll={false} onClick={go(option.week)} className={styles.step}
            style={{ '--nudge': left ? '-3px' : '3px' } as CSSProperties} aria-label={option.name}>
            <Chevron left={left} />
        </Link>
        : <span className={styles.step} aria-disabled="true"><Chevron left={left} /></span>;

    return <nav aria-label="Weeks" className={styles.weeks}>
        <div className={styles.stepper}>
            {step(previous, true)}
            <span className={styles.weekName} aria-live="polite">
                {season && <small className={styles.weekSeason} aria-hidden="true">{season}</small>}{name}
            </span>
            {step(next, false)}
        </div>
        {clock}
        <ol className={styles.track} style={{ '--count': weeks.length, '--at': at } as CSSProperties}>
            <li className={styles.indicator} aria-hidden="true" />
            {weeks.map(option => {
                const locked = option.phase === 'locked';
                return <li key={option.week}>
                    <Link href={`${base}/${option.week}`} scroll={false} onClick={go(option.week)}
                        aria-current={option.week === shown ? 'page' : undefined} data-locked={locked ? '' : undefined}
                        aria-label={locked ? `${option.name}, locked` : option.name} title={locked ? `${option.name}, locked` : option.name}>
                        <span>{option.week}</span>
                    </Link>
                </li>;
            })}
        </ol>
    </nav>;
}
