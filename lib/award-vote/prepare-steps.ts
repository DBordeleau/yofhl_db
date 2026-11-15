// The steps of a prepare, in order, each a bounded piece of work that writes its result and marks itself done in one
// statement (so a step is never half done, and the next call resumes after the last one written):
//  - dates: the season's date ranges, from its own Fantrax league info (season-dates.ts)
//  - one read per stat set any award shows and position group: the players with fantasy points over its days
//  - candidates: each award's eligible players (voted-awards.ts), each with its credited team season, and the
//    prepare's finish
// Each step's write is conditional on the progress being what this call read, so two prepares never interleave.
import { sql, type SQL } from 'drizzle-orm';
import type { GoalieLine, PrepareProgress, SkaterLine, StatSetName } from './model';
import type { AwardVotePorts, RangedGoalie, RangedSkater } from './ports';
import { seasonDates, type SeasonDates } from './season-dates';
import { PLAYER_AWARD_RULES, STAT_SETS, type SnapshotPlayer } from './voted-awards';

/** a failed or unexpected Fantrax read, which the admin is told about and can retry */
export class FantraxFailure extends Error {
    constructor(error: unknown) {
        super(error instanceof Error ? error.message : String(error), { cause: error });
    }
}

export interface PrepareStep {
    name: string;
    /** run the step after `progress`, returning the progress with it done, or null if another prepare moved on first */
    run(progress: PrepareProgress): Promise<PrepareProgress | null>;
}

type Group = 'skater' | 'goalie';

const skaterLine = (player: RangedSkater): SkaterLine => ({
    group: 'skater', points: player.points, perGame: player.perGame, gamesPlayed: player.gamesPlayed,
    goals: player.goals, assists: player.assists, shots: player.shots, hits: player.hits, blocks: player.blocks,
});
const goalieLine = (player: RangedGoalie): GoalieLine => ({
    group: 'goalie', points: player.points, perGame: player.perGame, gamesPlayed: player.gamesPlayed,
    wins: player.wins, goalsAgainst: player.goalsAgainst, saves: player.saves, shutouts: player.shutouts,
});
const positionsOf = (positions: string) => positions.split(',').map(position => position.trim()).filter(Boolean);

export function prepareSteps({ db, fantrax, clock }: AwardVotePorts, { seasonYear, leagueId }: { seasonYear: number; leagueId: string }): PrepareStep[] {
    const read = <T>(fn: () => Promise<T>) => fn().catch(error => { throw new FantraxFailure(error); });

    /** mark `step` done after `progress` (with `changes`), running `writes` (CTE bodies that may use `claim`) only if it is */
    async function markDone(progress: PrepareProgress, step: string, changes: { dates?: SeasonDates; preparedAt?: string } = {}, writes: SQL[] = []) {
        const next: PrepareProgress = { ...progress, done: [...progress.done, step], dates: changes.dates ?? progress.dates };
        const [{ claimed }] = await db.rows<{ claimed: number }>(sql`
            with claim as (
                update league.award_votes
                set prepare_progress = ${JSON.stringify(next)}::jsonb, updated_at = now()
                    ${changes.preparedAt ? sql`, prepared_at = ${changes.preparedAt}::timestamptz` : sql``}
                where season_year = ${seasonYear} and state = 'prepared' and prepare_progress = ${JSON.stringify(progress)}::jsonb
                returning 1
            )${sql.join(writes.map((write, index) => sql`, ${sql.raw(`part_${index}`)} as (${write})`))}
            select count(*)::int as claimed from claim`);
        return claimed ? next : null;
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
            const payload = JSON.stringify(lines.filter(({ line }) => line.points !== 0).map(({ player, line }) => ({
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

    const candidates: PrepareStep = {
        name: 'candidates',
        run: async progress => {
            const players = await db.rows<SnapshotPlayer>(sql`
                select p.player_id as "playerId", p.name, p.positions, p.nhl_team as "nhlTeam", p.age,
                       coalesce((select jsonb_object_agg(s.stat_set, s.line) from league.award_vote_stats s
                                 where s.season_year = p.season_year and s.player_id = p.player_id), '{}'::jsonb) as stats
                from league.award_vote_players p
                where p.season_year = ${seasonYear}`);
            const picked = JSON.stringify(PLAYER_AWARD_RULES.flatMap(rule =>
                players.filter(player => rule.eligible(player, { seasonYear })).map(player => ({ award: rule.award, playerId: player.playerId }))));
            return markDone(progress, 'candidates', { preparedAt: new Date(clock.now()).toISOString() }, [
                // The franchise credited with a player is the last to roster them that season: the one with them at
                // the end of it, or else the one whose drop was the player's last move. Nobody, for a player no one rostered.
                sql`insert into league.award_vote_candidates (season_year, award, player_id, team_season_id)
                    select ${seasonYear}, c.award, c."playerId", coalesce(ps.team_season_id, case when last_move.action = 'drop' then last_move.team_season_id end)
                    from jsonb_to_recordset(${picked}::jsonb) as c(award text, "playerId" text)
                    left join league.player_seasons ps on ps.player_id = c."playerId" and ps.season_year = ${seasonYear}
                    left join lateral (
                        select a.action, t.id as team_season_id
                        from league.transaction_assets a
                        join league.transaction_events e on e.id = a.event_id
                        left join league.team_seasons t on t.season_year = e.season_year and t.franchise_id = a.from_franchise_id
                        where a.player_id = c."playerId" and e.season_year = ${seasonYear}
                        order by e.occurred_at desc, a.source_row desc
                        limit 1
                    ) last_move on true
                    where exists (select 1 from claim)`,
            ]);
        },
    };

    const statSets = [...new Set(PLAYER_AWARD_RULES.flatMap(rule => rule.statSets))];
    return [dates, ...statSets.flatMap(statSet => [statSetRead(statSet, 'skater'), statSetRead(statSet, 'goalie')]), candidates];
}
