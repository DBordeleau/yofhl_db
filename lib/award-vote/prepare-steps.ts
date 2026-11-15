// The steps of a prepare, in order, each a bounded piece of work that writes its result and marks itself done in one
// statement (so a step is never half done, and the next call resumes after the last one written):
//  - dates: the season's date ranges, from its own Fantrax league info (season-dates.ts)
//  - one read per stat set any award shows and position group: the players with fantasy points over its days (and,
//    once the Final's rosters are read, everyone on them whatever their points), a page of Fantrax's table at a time
//  - final rosters, before the Danny Briere Award's stat sets: both finalists' daily rosters over the Final
//  - rookies: the NHL's record of each player at the candidate floor young enough by Fantrax's age to be a rookie,
//    a few at a time with a pause between, and whether the Calder rule (calder.ts) admits them; a player whose
//    lookup fails is recorded as failed and tried again on a later call, up to NHL_LOOKUP_ATTEMPTS in all
//  - candidates: each award's eligible players (voted-awards.ts), each with its credited team season, and the
//    prepare's finish
// Each step's write is conditional on the progress being what this call read, so two prepares never interleave.
import { sql, type SQL } from 'drizzle-orm';
import { calderEligible, mightBeCalderEligible } from './calder';
import { lookupFailed, type GoalieLine, type PrepareProgress, type RookieAdjustments, type RookieLookup, type SkaterLine, type StatSetName } from './model';
import type { AwardVotePorts, FantraxDayRosters, NhlLookupPlayer, RangedGoalie, RangedSkater } from './ports';
import { seasonDates, type SeasonDates } from './season-dates';
import { CANDIDATE_FPTS_FLOOR, PLAYER_AWARD_RULES, ROOKIE_STAT_SET, STAT_SETS, type SnapshotPlayer } from './voted-awards';

/** a failed or unexpected Fantrax read, which the admin is told about (by `reason`) and can retry */
export class ReadFailure extends Error {
    constructor(readonly reason: 'fantrax-failed', error: unknown) {
        super(error instanceof Error ? error.message : String(error), { cause: error });
    }
}

/** the ids of the hand-written steps, as `PrepareProgress.done` records them */
export const PREPARE_STEPS = { dates: 'dates', finalRosters: 'final rosters', rookies: 'rookies', candidates: 'candidates' } as const;

/** the id of a stat set's read for one position group, e.g. `regularSeason skaters` */
export const statSetStep = (statSet: StatSetName, group: Group) => `${statSet} ${group}s`;

/** how many young players one run of the rookies step looks up, all at once */
export const NHL_LOOKUPS_AT_ONCE = 3;
/** the pause before each batch of NHL lookups after a call's first */
export const NHL_LOOKUP_PAUSE_MS = 1000;
/** how many times a young player's NHL lookup is tried, once a prepare call, before it is left as failed */
export const NHL_LOOKUP_ATTEMPTS = 3;

export interface PrepareStep {
    name: string;
    /** whether it reads Fantrax, which a call does for one step at most (prepare.ts) */
    readsFantrax: boolean;
    /**
     * run the step after `progress`, returning the progress it leaves, or null if another prepare moved on first or
     * the step has nothing more to do until the next call
     */
    run(progress: PrepareProgress): Promise<PrepareProgress | null>;
}

type Group = 'skater' | 'goalie';

/** daily roster reads made at once, as the season sync's championship roster makes them */
const ROSTER_READS_AT_ONCE = 7;

const skaterLine = (player: RangedSkater): SkaterLine => ({
    group: 'skater', points: player.points, perGame: player.perGame, gamesPlayed: player.gamesPlayed,
    goals: player.goals, assists: player.assists, shots: player.shots, hits: player.hits, blocks: player.blocks,
});
/** the categories a goalie's league may not score, kept only when its table has them */
const OPTIONAL_GOALIE_CATEGORIES = ['overtimeLosses', 'goalsAgainst', 'saves', 'savePercentage'] as const;
const goalieLine = (player: RangedGoalie): GoalieLine => ({
    group: 'goalie', points: player.points, perGame: player.perGame, gamesPlayed: player.gamesPlayed,
    wins: player.wins, shutouts: player.shutouts,
    ...Object.fromEntries(OPTIONAL_GOALIE_CATEGORIES.filter(category => player[category] !== undefined).map(category => [category, player[category]])),
});
const positionsOf = (positions: string) => positions.split(',').map(position => position.trim()).filter(Boolean);

export function prepareSteps({ db, fantrax, nhl, clock }: AwardVotePorts, { seasonYear, leagueId }: { seasonYear: number; leagueId: string }): PrepareStep[] {
    const read = <T>(fn: () => Promise<T>) => fn().catch(error => { throw new ReadFailure('fantrax-failed', error); });

    /**
     * move `progress` on to `next`, running `writes` (CTE bodies that may use `claim`) only if it is still the
     * recorded progress and `guard` (a condition on the award vote's row) holds
     */
    async function advance(progress: PrepareProgress, next: PrepareProgress, { preparedAt, guard }: { preparedAt?: string; guard?: SQL } = {}, writes: SQL[] = []) {
        const [{ claimed }] = await db.rows<{ claimed: number }>(sql`
            with claim as (
                update league.award_votes
                set prepare_progress = ${JSON.stringify(next)}::jsonb, updated_at = now()
                    ${preparedAt ? sql`, prepared_at = ${preparedAt}::timestamptz` : sql``}
                where season_year = ${seasonYear} and state = 'prepared' and prepare_progress = ${JSON.stringify(progress)}::jsonb
                    ${guard ? sql`and ${guard}` : sql``}
                returning 1
            )${sql.join(writes.map((write, index) => sql`, ${sql.raw(`part_${index}`)} as (${write})`))}
            select count(*)::int as claimed from claim`);
        return claimed ? next : null;
    }

    /** mark `step` done after `progress` (with `changes`), running `writes` only if it is (see `advance`) */
    async function markDone(progress: PrepareProgress, step: string, changes: { dates?: SeasonDates; finalRosters?: Record<string, number>; preparedAt?: string; guard?: SQL } = {}, writes: SQL[] = []) {
        const next: PrepareProgress = { ...progress, done: [...progress.done, step], dates: changes.dates ?? progress.dates };
        delete next.pagesRead;
        if (changes.finalRosters) next.finalRosters = changes.finalRosters;
        return advance(progress, next, changes, writes);
    }

    const dates: PrepareStep = {
        name: PREPARE_STEPS.dates,
        readsFantrax: true,
        run: async progress => {
            const info = await read(() => fantrax.leagueInfo(leagueId));
            const found = await read(async () => {
                if (info.seasonYear !== seasonYear) throw new Error(`Fantrax league ${leagueId} is the ${info.seasonYear} season, not ${seasonYear}`);
                return seasonDates(info);
            });
            return markDone(progress, PREPARE_STEPS.dates, { dates: found });
        },
    };

    const statSetRead = (statSet: StatSetName, group: Group): PrepareStep => ({
        name: statSetStep(statSet, group),
        readsFantrax: true,
        run: async progress => {
            const step = statSetStep(statSet, group);
            const range = { leagueId, seasonYear, ...STAT_SETS[statSet].range(progress.dates!) };
            const sofar = progress.pagesRead?.step === step ? progress.pagesRead : null;
            const page = (sofar?.read ?? 0) + 1;
            const table = group === 'skater'
                ? await read(async () => {
                    const { players, ...size } = await fantrax.skaters(range, page);
                    return { ...size, lines: players.map(player => ({ player, line: skaterLine(player) })) };
                })
                : await read(async () => {
                    const { players, ...size } = await fantrax.goalies(range, page);
                    return { ...size, lines: players.map(player => ({ player, line: goalieLine(player) })) };
                });
            if (sofar && (table.pages !== sofar.pages || table.total !== sofar.total)) {
                // its pages no longer line up, so it is read again from the first, rewriting what the earlier pages wrote
                console.error(`Fantrax's ${range.startDate}..${range.endDate} ${group} table changed between pages; reading it again`);
                const restarted = { ...progress };
                delete restarted.pagesRead;
                return advance(progress, restarted);
            }
            const lines = table.lines;
            const rostered = progress.finalRosters ?? {};
            const payload = JSON.stringify(lines.filter(({ player, line }) => line.points !== 0 || player.id in rostered).map(({ player, line }) => ({
                playerId: player.id, name: player.name, positions: positionsOf(player.positions), nhlTeam: player.nhlTeam, age: player.age, line,
            })));
            const writes = [
                sql`insert into league.award_vote_players (season_year, player_id, name, positions, nhl_team, age)
                    select ${seasonYear}, p."playerId", p.name, p.positions, p."nhlTeam", p.age
                    from jsonb_to_recordset(${payload}::jsonb) as p("playerId" text, name text, positions text[], "nhlTeam" text, age smallint)
                    where exists (select 1 from claim)
                    on conflict (season_year, player_id) do update
                    set name = excluded.name, positions = excluded.positions, nhl_team = excluded.nhl_team, age = excluded.age`,
                sql`insert into league.award_vote_stats (season_year, player_id, stat_set, line)
                    select ${seasonYear}, p."playerId", ${statSet}, p.line
                    from jsonb_to_recordset(${payload}::jsonb) as p("playerId" text, line jsonb)
                    where exists (select 1 from claim)
                    on conflict (season_year, player_id, stat_set) do update set line = excluded.line`,
            ];
            if (page < table.pages) return advance(progress, { ...progress, pagesRead: { step, read: page, pages: table.pages, total: table.total } }, {}, writes);
            return markDone(progress, step, {}, writes);
        },
    });

    // the young players this call has looked up (the steps are built afresh for each call), whose failed lookups
    // wait for a later call
    const lookedUpThisCall = new Set<string>();
    const rookies: PrepareStep = {
        name: PREPARE_STEPS.rookies,
        readsFantrax: false,
        run: async progress => {
            const looked = progress.rookies ?? {};
            const today = new Date(clock.now()).toISOString().slice(0, 10);
            // only players at the candidate floor can be Teemu Trophy candidates
            const young = (await db.rows<NhlLookupPlayer & { age: number | null }>(sql`
                select p.player_id as id, p.name, p.positions, p.nhl_team as "nhlTeam", p.age
                from league.award_vote_players p
                join league.award_vote_stats s on s.season_year = p.season_year and s.player_id = p.player_id and s.stat_set = ${ROOKIE_STAT_SET}
                where p.season_year = ${seasonYear} and (s.line ->> 'points')::numeric >= ${CANDIDATE_FPTS_FLOOR}
                order by p.player_id`))
                .filter(player => mightBeCalderEligible(player.age, seasonYear, today));
            /** never looked up, or failed with attempts left */
            const toLookUp = (lookups: Record<string, RookieLookup>, id: string) => {
                const lookup = lookups[id];
                return lookup === undefined || (lookupFailed(lookup) && lookup.failedAttempts < NHL_LOOKUP_ATTEMPTS);
            };
            const batch = young.filter(player => toLookUp(looked, player.id) && !lookedUpThisCall.has(player.id)).slice(0, NHL_LOOKUPS_AT_ONCE);
            // only failed lookups this call already tried are left: they wait for the next call
            if (!batch.length && young.some(player => toLookUp(looked, player.id))) return null;
            // a pause between batches, so the NHL isn't asked for too much at once
            if (batch.length && lookedUpThisCall.size) await clock.sleep(NHL_LOOKUP_PAUSE_MS);
            const found = await Promise.all(batch.map(async ({ id, name, positions, nhlTeam }): Promise<[string, RookieLookup]> => {
                lookedUpThisCall.add(id);
                try {
                    const record = await nhl.lookup({ id, name, positions, nhlTeam });
                    return [id, record && { nhlId: record.nhlId, eligible: calderEligible(record, seasonYear) }];
                } catch (error) {
                    // recorded as failed, so one player can't stop the prepare: they are tried again on a later
                    // call, and after the last attempt the admin's rookie review lists them to decide on by hand
                    const previous = looked[id];
                    const failedAttempts = (lookupFailed(previous) ? previous.failedAttempts : 0) + 1;
                    console.error(`The NHL lookup of ${name} (${id}) for the ${seasonYear} award vote failed (attempt ${failedAttempts} of ${NHL_LOOKUP_ATTEMPTS}):`, error);
                    return [id, { failedAttempts }];
                }
            }));
            const lookups = { ...looked, ...Object.fromEntries(found) };
            const next: PrepareProgress = { ...progress, rookies: lookups };
            const finished = !young.some(player => toLookUp(lookups, player.id));
            return advance(progress, finished ? { ...next, done: [...next.done, PREPARE_STEPS.rookies] } : next);
        },
    };

    const candidates: PrepareStep = {
        name: PREPARE_STEPS.candidates,
        readsFantrax: false,
        run: async progress => {
            // the Calder-eligible rookies, with the admin's changes
            const [{ adjustments }] = await db.rows<{ adjustments: RookieAdjustments }>(sql`
                select rookie_adjustments as adjustments from league.award_votes where season_year = ${seasonYear}`);
            const rookies = new Set(Object.entries(progress.rookies ?? {}).filter(([, lookup]) => lookup !== null && !lookupFailed(lookup) && lookup.eligible).map(([id]) => id));
            for (const id of adjustments.removed) rookies.delete(id);
            for (const id of adjustments.added) rookies.add(id);
            const players = await db.rows<SnapshotPlayer>(sql`
                select p.player_id as "playerId", p.name, p.positions, p.nhl_team as "nhlTeam", p.age,
                       coalesce((select jsonb_object_agg(s.stat_set, s.line) from league.award_vote_stats s
                                 where s.season_year = p.season_year and s.player_id = p.player_id), '{}'::jsonb) as stats
                from league.award_vote_players p
                where p.season_year = ${seasonYear}`);
            const context = { seasonYear, finalRosters: progress.finalRosters ?? {}, rookies };
            const picked = JSON.stringify(PLAYER_AWARD_RULES.flatMap(rule =>
                players.filter(player => rule.eligible(player, context)).map(player => ({
                    award: rule.award, playerId: player.playerId, ruleCredits: rule.credit !== undefined, teamSeasonId: rule.credit?.(player, context) ?? null,
                }))));
            // the admin's changes can't move while the candidates are written from them
            const guard = sql`rookie_adjustments = ${JSON.stringify(adjustments)}::jsonb`;
            return markDone(progress, PREPARE_STEPS.candidates, { preparedAt: new Date(clock.now()).toISOString(), guard }, [
                // The franchise credited with a player is the award's own (the Danny Briere Award's finalist), or else
                // the last to roster them that season: the one with them at the end of it, or else the one the
                // player's last move left them with (the receiving franchise of a claim or trade, the dropping one of
                // a drop). Nobody, for a player no one rostered.
                sql`insert into league.award_vote_candidates (season_year, award, player_id, team_season_id)
                    select ${seasonYear}, c.award, c."playerId",
                           case when c."ruleCredits" then c."teamSeasonId" else coalesce(ps.team_season_id, last_move.team_season_id) end
                    from jsonb_to_recordset(${picked}::jsonb) as c(award text, "playerId" text, "ruleCredits" boolean, "teamSeasonId" int)
                    left join league.player_seasons ps on ps.player_id = c."playerId" and ps.season_year = ${seasonYear}
                    left join lateral (
                        select t.id as team_season_id
                        from league.transaction_assets a
                        join league.transaction_events e on e.id = a.event_id
                        left join league.team_seasons t on t.season_year = e.season_year
                            and t.franchise_id = case when a.action = 'drop' then a.from_franchise_id else a.to_franchise_id end
                        where a.player_id = c."playerId" and e.season_year = ${seasonYear}
                        order by e.occurred_at desc, a.source_row desc
                        limit 1
                    ) last_move on true
                    where exists (select 1 from claim)`,
            ]);
        },
    };

    const finalRosters: PrepareStep = {
        name: PREPARE_STEPS.finalRosters,
        readsFantrax: true,
        run: async progress => {
            const finalists = await db.rows<{ teamSeasonId: number; name: string; fantraxTeamId: string | null }>(sql`
                select t.id as "teamSeasonId", t.name,
                       (select min(ft.fantrax_team_id) from league.fantrax_teams ft
                        where ft.season_year = t.season_year and ft.fantrax_league_id = ${leagueId} and ft.franchise_id = t.franchise_id) as "fantraxTeamId"
                from league.season_results r
                join league.team_seasons t on t.id in (r.champion_team_season_id, r.runner_up_team_season_id)
                where r.season_year = ${seasonYear}
                order by t.id = r.champion_team_season_id desc`);
            const credited = await read(async () => {
                const unmapped = finalists.find(finalist => finalist.fantraxTeamId === null);
                if (finalists.length !== 2 || unmapped) throw new Error(`The league configuration has no Fantrax team for finalist ${unmapped?.name ?? 'of the Final'}`);
                const periods = progress.dates!.finalRosterPeriods;
                const days: FantraxDayRosters[] = [];
                for (let index = 0; index < periods.length; index += ROSTER_READS_AT_ONCE) {
                    days.push(...await Promise.all(periods.slice(index, index + ROSTER_READS_AT_ONCE).map(period => fantrax.dayRosters(leagueId, period))));
                }
                // day by day, so a player on both finalists' rosters during the Final goes to the one that had him last
                const byPlayer: Record<string, number> = {};
                days.forEach((day, index) => {
                    for (const finalist of finalists) {
                        const roster = day[finalist.fantraxTeamId!];
                        if (!roster) throw new Error(`Fantrax's rosters for roster period ${periods[index]} have no team ${finalist.fantraxTeamId}`);
                        for (const player of roster) if (player.status !== 'MINORS') byPlayer[player.id] = finalist.teamSeasonId;
                    }
                });
                return byPlayer;
            });
            return markDone(progress, PREPARE_STEPS.finalRosters, { finalRosters: credited });
        },
    };

    const statSets = [...new Set(PLAYER_AWARD_RULES.flatMap(rule => rule.statSets))];
    // The Final's rosters are read before the stat sets of an award that credits its own franchise, so those reads
    // keep every rostered player, scored or not.
    const rosterStatSets = new Set(PLAYER_AWARD_RULES.filter(rule => rule.credit).flatMap(rule => rule.statSets));
    const firstRosterStatSet = statSets.find(statSet => rosterStatSets.has(statSet));
    return [
        dates,
        ...statSets.flatMap(statSet => [
            ...statSet === firstRosterStatSet ? [finalRosters] : [],
            statSetRead(statSet, 'skater'),
            statSetRead(statSet, 'goalie'),
        ]),
        rookies,
        candidates,
    ];
}
