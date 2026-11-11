import type { ReactNode } from 'react';
import { seasonLabel } from '@/lib/league';
import type { PickemLeaderboardEntry, PickemWeek as Week, PickemWeekOption } from '@/lib/pickem/create-pickem';
import LockClock from './lock-clock';
import PickemBreakdown from './pickem-breakdown';
import PickemLeaderboard from './pickem-leaderboard';
import { PickemPrize } from './pickem-prize';
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
    /** the season's Pick'em leaderboard; 'unavailable' when it could not be read */
    standings: { entries: PickemLeaderboardEntry[]; winners: PickemLeaderboardEntry[] } | 'unavailable' | null;
    /** what the slate says when there is no week to show */
    message?: ReactNode;
}

// Every Pick'em page: the navy stage (title and who's in, then the week control with its lock clock), then the week's slate
// beside the Pick'em leaderboard, with the prize above it and the rules under it.
export default function PickemPage({ seasonYear, seasons, week, weeks, base, standings, message }: Props) {
    const clock = week && <LockClock key={week.lock} lock={week.lock} locked={week.phase === 'locked'} />;
    return <main className={`mx-auto max-w-page px-4 md:px-8 3xl:max-w-page-3xl 4xl:max-w-page-4xl ${styles.page}`}>
        <section className={styles.stage} aria-labelledby="pickem-title">
            <div className={styles.top}>
                <div className={styles.titleRow}>
                    <h1 id="pickem-title" className={styles.title}>Pick&apos;em{seasonYear && <span>{seasonLabel(seasonYear)}</span>}</h1>
                    {seasons && seasonYear && <SeasonSwitcher seasons={seasons.list} selected={seasonYear} beingPlayed={seasons.beingPlayed} />}
                </div>
                {week?.whosIn && <PickemWhosIn whosIn={week.whosIn} seasonYear={week.seasonYear} week={week.week} />}
            </div>
            {weeks && weeks.length > 0
                ? <WeekSwitcher weeks={weeks} selected={week?.week ?? 0} base={base} clock={clock} />
                : clock && <div className={styles.weeks}>{clock}</div>}
        </section>
        <div className={styles.layout}>
            <section aria-label={week?.name ?? 'Week'}>
                {week
                    ? week.phase === 'locked' && week.breakdown
                        ? <PickemBreakdown key={week.week} seasonYear={week.seasonYear} week={week.week} breakdown={week.breakdown} />
                        : <PickemWeek key={week.week} seasonYear={week.seasonYear} week={week.week} matchups={week.matchups} locked={week.phase === 'locked'}
                            leagueStandings={week.leagueStandings} />
                    : <p className={styles.message}>{message}</p>}
            </section>
            <aside className={styles.rail}>
                {seasonYear && <PickemPrize seasonYear={seasonYear} />}
                {standings && <PickemLeaderboard entries={standings === 'unavailable' ? [] : standings.entries}
                    winners={standings === 'unavailable' ? [] : standings.winners} unavailable={standings === 'unavailable'} />}
                {seasonYear && <PickemSeasonSummary />}
            </aside>
        </div>
    </main>;
}
