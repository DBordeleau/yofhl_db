// The steps of a prepare, in order, each a bounded piece of work that writes its result and marks itself done in one
// statement (so a step is never half done, and the next call resumes after the last one written):
//  - dates: the season's date ranges, from its own Fantrax league info (season-dates.ts)
//  - one read per stat set any award shows and position group: the players with fantasy points over its days (and,
//    once the Final's rosters are read, everyone on them whatever their points)
//  - final rosters, before the Danny Briere Award's stat sets: both finalists' daily rosters over the Final
//  - rookies: the NHL's record of each player young enough by Fantrax's age to be a rookie, a few at a time, and
//    whether the Calder rule (calder.ts) admits them
//  - candidates: each award's eligible players (voted-awards.ts), each with its credited team season, and the
//    prepare's finish
// Each step's write is conditional on the progress being what this call read, so two prepares never interleave.
import { sql, type SQL } from 'drizzle-orm';
import { calderEligible, mightBeCalderEligible } from './calder';
import type { GoalieLine, PrepareProgress, RookieAdjustments, SkaterLine, StatSetName } from './model';
import type { AwardVotePorts, FantraxDayRosters, NhlLookupPlayer, RangedGoalie, RangedSkater } from './ports';
import { seasonDates, type SeasonDates } from './season-dates';
import { PLAYER_AWARD_RULES, STAT_SETS, type SnapshotPlayer } from './voted-awards';

/** a failed or unexpected Fantrax read, which the admin is told about and can retry */
export class FantraxFailure extends Error {
    constructor(error: unknown) {
        super(error instanceof Error ? error.message : String(error), { cause: error });
    }
}

/** a failed NHL lookup, which the admin is told about and can retry */
export class NhlFailure extends Error {
    constructor(error: unknown) {
        super(error instanceof Error ? error.message : String(error), { cause: error });
    }
}

/** how many young players one run of the rookies step looks up, all at once */
export const NHL_LOOKUPS_AT_ONCE = 8;

export interface PrepareStep {
    name: string;
    /** run the step after `progress`, returning the progress with it done, or null if another prepare moved on first */
    run(progress: PrepareProgress): Promise<PrepareProgress | null>;
}

type Group = 'skater' | 'goalie';

/** daily roster reads made at once, as the season sync's championship roster makes them */
const ROSTER_READS_AT_ONCE = 7;

const skaterLine = (player: RangedSkater): SkaterLine => ({
    group: 'skater', points: player.points, perGame: player.perGame, gamesPlayed: player.gamesPlayed,
    goals: player.goals, assists: player.assists, shots: player.shots, hits: player.hits, blocks: player.blocks,
});
const goalieLine = (player: RangedGoalie): GoalieLine => ({
    group: 'goalie', points: player.points, perGame: player.perGame, gamesPlayed: player.gamesPlayed,
    wins: player.wins, goalsAgainst: player.goalsAgainst, saves: player.saves, shutouts: player.shutouts,
});
const positionsOf = (positions: string) => positions.split(',').map(position => position.trim()).filter(Boolean);

export function prepareSteps({ db, fantrax, nhl, clock }: AwardVotePorts, { seasonYear, leagueId }: { seasonYear: number; leagueId: string }): PrepareStep[] {
    const read = <T>(fn: () => Promise<T>) => fn().catch(error => { throw new FantraxFailure(error); });

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
        if (changes.finalRosters) next.finalRosters = changes.finalRosters;
        return advance(progress, next, changes, writes);
    }

    const dates: PrepareStep = {
        name: 'dates',
        run: async progress => {
            const info = await read(() => fantrax.leagueInfo(leagueId));
            const found = await read(async () => {
                if (info.seasonYear !== seasonYear) throw new Error(`Fantrax league ${leagueId} is the ${info.seasonYear} season, not ${seasonYear}`);
                return seasonDates(info);
            });
            return markDone(progress, 'dates', { dates: found });
        },
    };

    const statSetRead = (statSet: StatSetName, group: Group): PrepareStep => ({
        name: `${statSet} ${group}s`,
        run: async progress => {
            const range = { leagueId, seasonYear, ...STAT_SETS[statSet].range(progress.dates!) };
            const lines = group === 'skater'
                ? (await read(() => fantrax.skaters(range))).map(player => ({ player, line: skaterLine(player) }))
                : (await read(() => fantrax.goalies(range))).map(player => ({ player, line: goalieLine(player) }));
            const rostered = progress.finalRosters ?? {};
            const payload = JSON.stringify(lines.filter(({ player, line }) => line.points !== 0 || player.id in rostered).map(({ player, line }) => ({
                playerId: player.id, name: player.name, positions: positionsOf(player.positions), nhlTeam: player.nhlTeam, age: player.age, line,
            })));
            return markDone(progress, `${statSet} ${group}s`, {}, [
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
            ]);
        },
    });

    const rookies: PrepareStep = {
        name: 'rookies',
        run: async progress => {
            const looked = progress.rookies ?? {};
            const today = new Date(clock.now()).toISOString().slice(0, 10);
            // only regular-season scorers can be Teemu Trophy candidates
            const young = (await db.rows<NhlLookupPlayer & { age: number | null }>(sql`
                select p.player_id as id, p.name, p.positions, p.nhl_team as "nhlTeam", p.age
                from league.award_vote_players p
                join league.award_vote_stats s on s.season_year = p.season_year and s.player_id = p.player_id and s.stat_set = ${'regularSeason' satisfies StatSetName}
                where p.season_year = ${seasonYear}
                order by p.player_id`))
                .filter(player => !(player.id in looked) && mightBeCalderEligible(player.age, seasonYear, today));
            const batch = young.slice(0, NHL_LOOKUPS_AT_ONCE);
            const found = await Promise.all(batch.map(async ({ id, name, positions, nhlTeam }) => {
                const record = await nhl.lookup({ id, name, positions, nhlTeam }).catch(error => { throw new NhlFailure(error); });
                return [id, record && { nhlId: record.nhlId, eligible: calderEligible(record, seasonYear) }] as const;
            }));
            const next: PrepareProgress = { ...progress, rookies: { ...looked, ...Object.fromEntries(found) } };
            return advance(progress, young.length > batch.length ? next : { ...next, done: [...next.done, 'rookies'] });
        },
    };

    const candidates: PrepareStep = {
        name: 'candidates',
        run: async progress => {
            // the Calder-eligible rookies, with the admin's changes
            const [{ adjustments }] = await db.rows<{ adjustments: RookieAdjustments }>(sql`
                select rookie_adjustments as adjustments from league.award_votes where season_year = ${seasonYear}`);
            const rookies = new Set(Object.entries(progress.rookies ?? {}).filter(([, lookup]) => lookup?.eligible).map(([id]) => id));
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
            return markDone(progress, 'candidates', { preparedAt: new Date(clock.now()).toISOString(), guard }, [
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
        name: 'final rosters',
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
            return markDone(progress, 'final rosters', { finalRosters: credited });
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
