import Link from 'next/link';
import type { ReactNode } from 'react';
import { seasonLabel } from '@/lib/league';
import type { PickemLeaderboardEntry, PickemWeek as Week, PickemWeekOption } from '@/lib/pickem/create-pickem';
import { Arrow } from './icons';
import LockClock from './lock-clock';
import PickemBreakdown from './pickem-breakdown';
import PickemLeaderboard from './pickem-leaderboard';
import PickemSeasonSummary from './pickem-season-summary';
import PickemWeek from './pickem-week';
import PickemWhosIn from './pickem-whos-in';
import SeasonSwitcher from './season-switcher';
import WeekSwitcher from './week-switcher';
import styles from './pickem.module.css';

interface Props {
    seasonYear: number | null;
    /** every Pick'em season, newest first, and the one being played */
    seasons?: { list: number[]; beingPlayed: number | null };
    week: Week | null;
    weeks: PickemWeekOption[] | null;
    /** where each week lives: /pickem/week/[week] for the season being played */
    base?: string;
    link?: { href: string; label: string };
    /** the season's Pick'em leaderboard; 'unavailable' when it could not be read */
    standings: { entries: PickemLeaderboardEntry[]; winners: PickemLeaderboardEntry[] } | 'unavailable' | null;
    /** each franchise's owner, for the season being played */
    owners?: Record<number, string>;
    /** what the slate says when there is no week to show */
    message?: ReactNode;
}

// Every Pick'em page: the navy stage (title, season switch, lock clock, week rail, who's in), then the week's slate
// beside the Pick'em leaderboard, with the rules and the prize under it.
export default function PickemPage({ seasonYear, seasons, week, weeks, base, link, standings, owners, message }: Props) {
    const linkNode = link && <Link key="week-link" href={link.href} className={styles.weekLink}>{link.label}<Arrow /></Link>;
    return <main className={`mx-auto max-w-page px-4 md:px-8 3xl:max-w-page-3xl 4xl:max-w-page-4xl ${styles.page}`}>
        <section className={styles.stage} aria-labelledby="pickem-title">
            <div className={styles.top}>
                <div>
                    <h1 id="pickem-title" className={styles.title}>Pick&apos;em{seasonYear && <span>{seasonLabel(seasonYear)}</span>}</h1>
                    {seasons && seasonYear && <SeasonSwitcher seasons={seasons.list} selected={seasonYear} beingPlayed={seasons.beingPlayed} />}
                </div>
                {week && <LockClock key={week.lock} lock={week.lock} locked={week.phase === 'locked'} />}
            </div>
            {weeks && weeks.length > 0 && <WeekSwitcher weeks={weeks} selected={week?.week ?? 0} base={base} />}
            {week?.whosIn && <PickemWhosIn whosIn={week.whosIn} seasonYear={week.seasonYear} week={week.week} />}
        </section>
        <div className={styles.layout}>
            <section aria-label={week?.name ?? 'Week'}>
                {week
                    ? week.phase === 'locked' && week.breakdown
                        ? <PickemBreakdown key={week.week} seasonYear={week.seasonYear} week={week.week} breakdown={week.breakdown} owners={owners} link={linkNode} />
                        : <PickemWeek key={week.week} seasonYear={week.seasonYear} week={week.week} matchups={week.matchups} locked={week.phase === 'locked'} owners={owners} link={linkNode} />
                    : <p className={styles.message}>{message}{linkNode}</p>}
            </section>
            <aside className={styles.rail}>
                {standings && <PickemLeaderboard entries={standings === 'unavailable' ? [] : standings.entries}
                    winners={standings === 'unavailable' ? [] : standings.winners} unavailable={standings === 'unavailable'} />}
                {seasonYear && <PickemSeasonSummary seasonYear={seasonYear} />}
            </aside>
        </div>
    </main>;
}
