// Pick'em seasons (GLOSSARY.md, "Pick'em"): each season year has its own. The season being played is the live
// season's; a past season is whatever Pick'em has recorded, read from its own record alone. A season's Pick'em is
// complete once its last regular-season week is frozen, and settle stores that mark because the live season stops
// describing the season once Fantrax moves on.
import { sql } from 'drizzle-orm';
import { cached, rows } from '@/lib/data/db';
import { loadLivePickem } from './live-weeks';
import { firstPickemWeek } from './model';
import type { PickemPorts } from './ports';

/** Expires the list of Pick'em seasons: settle expires it after recording a week or completing a season */
export const PICKEM_SEASONS_TAG = 'pickem-seasons';

interface RecordedSeason { seasonYear: number; complete: boolean }

/** Every season Pick'em has recorded a week of, newest first, and whether each is complete */
const readRecordedSeasons = cached(async () => rows<RecordedSeason>(sql`
    select w.season_year as "seasonYear", c.season_year is not null as complete
    from (select distinct season_year from league.pickem_weeks) w
    left join league.pickem_completed_seasons c on c.season_year = w.season_year
    order by w.season_year desc`),
'pickem-seasons', [PICKEM_SEASONS_TAG]);

// One statement (ADR 0002): the season is marked only once every pairing of its last week is frozen, and only once.
export const completeSeasonQuery = (seasonYear: number, lastWeek: number) => sql`
    with completed as (
        insert into league.pickem_completed_seasons (season_year)
        select ${seasonYear}::int
        where (select bool_and(p.frozen_at is not null) from league.pickem_pairings p
               where p.season_year = ${seasonYear}::int and p.week = ${lastWeek}::int)
        on conflict (season_year) do nothing
        returning 1
    )
    select count(*)::int as completed from completed`;

type LivePickem = NonNullable<Awaited<ReturnType<typeof loadLivePickem>>>;

/** The season a read asks for: the one being played, a past one Pick'em has recorded, or none */
export type AskedSeason =
    | { kind: 'live'; live: LivePickem; complete: boolean; seasons: number[] }
    | { kind: 'past'; seasonYear: number; complete: boolean; seasons: number[] }
    | { kind: 'none' }
    | { kind: 'unavailable' };

/**
 * Finds the season `seasonYear` (the season being played when omitted). A past season is served from Pick'em's
 * record whatever the live season says; while the live season is unavailable, only a complete season is, since it
 * can't be told apart from the season being played otherwise. None while Pick'em is switched off. `seasons` is
 * every Pick'em season, newest first.
 */
export async function askedSeason(ports: Pick<PickemPorts, 'liveSeason' | 'launch'>, now: number, seasonYear?: number): Promise<AskedSeason> {
    if (!ports.launch) return { kind: 'none' };
    const [live, recorded] = await Promise.all([loadLivePickem(ports, now), readRecordedSeasons()]);
    const playing = live && firstPickemWeek(live.seasonYear, ports.launch) !== null ? live.seasonYear : null;
    const seasons = [...new Set([...playing === null ? [] : [playing], ...recorded.map(item => item.seasonYear)])].sort((a, b) => b - a);
    const found = recorded.find(item => item.seasonYear === (seasonYear ?? live?.seasonYear));
    if (live && (seasonYear === undefined || seasonYear === live.seasonYear)) {
        return { kind: 'live', live, complete: found?.complete ?? false, seasons };
    }
    if (!found) return live ? { kind: 'none' } : { kind: 'unavailable' };
    if (!live && !found.complete) return { kind: 'unavailable' };
    return { kind: 'past', seasonYear: found.seasonYear, complete: found.complete, seasons };
}

/** The winner of a complete season: every entry in first place. None before the season is complete. */
export const winnersOf = <Entry extends { rank: number }>(entries: Entry[], complete: boolean) =>
    complete ? entries.filter(entry => entry.rank === 1) : [];
