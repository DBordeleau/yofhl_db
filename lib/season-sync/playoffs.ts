// Playoff bracket: each playoff round's championship games, written once the round's week is final (its end has
// passed, or an admin marked it final), from the live season's playoff weeks and pairings and the week's scores.
//
// A game is a championship game when both teams are still alive in the bracket: the playoff seeds in the first
// round (the top seeds having a bye), then the previous round's winners plus the bye teams. Other games in those
// weeks are ignored. The first round is slotted in Fantrax's order and each later round beside the games that fed
// it (lib/data/bracket-order.ts), so a round already frozen keeps its slots. A round whose pairings don't fit the bracket writes nothing, nor does any round after it; a
// playoff schedule that isn't the league's three rounds writes no bracket. Both record a warning.
//
// The winner follows the shared matchup winner rule, so a saved bracket correction decides it. On level scores
// with no correction it is the team Fantrax places in the next round; a level Final has no winner (and so no
// champion) until it is set in bracket review. A game follows Fantrax until its week's correction window closes;
// after that it is never rewritten, and the stored game decides who is alive in the next round. The Final's
// winner is the champion, which publishes the season through the season results view.
import { sql } from 'drizzle-orm';
import { drawingOrder } from '@/lib/data/bracket-order';
import { rows } from '@/lib/data/db';
import { matchupWinner } from '@/lib/data/matchup-winner';
import { PLAYOFF_FORMAT } from '@/lib/fantrax/config';
import { correctionWindowClosed, type LiveSeason, type Week, type WeekScores } from '@/lib/fantrax/live-season';
import type { CurrentSeason } from './current-season';
import { gamesPayload, insertGames, type SyncedGame } from './games';
import type { SeasonSyncPorts } from './ports';
import type { SyncWrite } from './write';

/**
 * a championship game as stored: its slot is its top-to-bottom position in its round for drawing the bracket, from 0
 * (lib/data/bracket-order.ts), and it has no winner while a level Final has no bracket correction
 */
export type PlayoffGame = SyncedGame;

/** a saved bracket correction (league.matchup_overrides); `winner` is a franchise, null when the score decides */
interface BracketCorrection {
    round: number;
    franchiseA: number;
    franchiseB: number;
    winner: number | null;
}

/** a championship game as the bracket plans it, by Fantrax team ID */
interface BracketResult {
    away: string;
    home: string;
    awayScore: number;
    homeScore: number;
    /** null while the game has no winner */
    winner: string | null;
}

interface BracketInput {
    season: CurrentSeason;
    live: LiveSeason;
    /** a final playoff week's scores, read only for a round about to be written */
    scoresOf: (week: Week) => Promise<WeekScores>;
    stored: PlayoffGame[];
    corrections: BracketCorrection[];
    now: number;
}

/** The championship games to write (only rounds still inside their correction window) and any warnings. */
async function planBracket({ season, live, scoresOf, stored, corrections, now }: BracketInput): Promise<{ games: PlayoffGame[]; warnings: string[] }> {
    const { playoffs } = live;
    const { rounds } = playoffs;
    if (!playoffs.fitsFormat) {
        return { games: [], warnings: [`Fantrax's playoff schedule has ${rounds.length} round${rounds.length === 1 ? '' : 's'}, not the league's ${PLAYOFF_FORMAT.rounds.length}: no playoff bracket is written. Correct the playoff settings in Fantrax.`] };
    }
    const name = (fantraxTeamId: string) => live.teams.find(team => team.id === fantraxTeamId)?.name ?? fantraxTeamId;

    // Seeds in standings order, as many as the standings' playoff line; the top seeds have the first round's byes.
    const seeds = live.standings.rows.map(row => row.team.id).slice(0, live.standings.playoffTeams);
    const byes = seeds.slice(0, live.standings.byeTeams);
    let alive = seeds;
    /** each round reached, in order, and whether it is written this run (else it is as stored) */
    const played: { round: number; results: BracketResult[]; written: boolean }[] = [];
    const warnings: string[] = [];

    for (const [index, week] of rounds.entries()) {
        if (week.phase !== 'final') break;
        const round = index + 1;
        const isFinal = index === rounds.length - 1;
        /** every round halves the bracket down to the champion */
        const advancing = 2 ** (rounds.length - 1 - index);
        let results: BracketResult[];
        const frozen = correctionWindowClosed(week.endDate, now);

        if (frozen) {
            const kept = stored.filter(game => game.round === round).sort((a, b) => a.slot - b.slot);
            const fantraxId = (teamSeasonId: number | null) => teamSeasonId === null ? null : season.teamOf(teamSeasonId)?.fantraxTeamId ?? null;
            results = kept.map(game => ({ away: fantraxId(game.away)!, home: fantraxId(game.home)!, awayScore: game.awayScore, homeScore: game.homeScore, winner: fantraxId(game.winner) }));
            if (!results.length) {
                warnings.push(`The ${week.name} games weren't stored before their correction window closed, so the bracket stops there. Repair it with the season import.`);
                break;
            }
        } else {
            if (now - Date.parse(live.fetchedAt) > LIVE_SEASON_MAX_AGE) {
                throw new Error(`The live season was saved at ${live.fetchedAt}, more than 36 hours ago, so the ${week.name} can't be written from it. Check the evening Fantrax refreshes.`);
            }
            const playing = index === 0 ? alive.filter(id => !byes.includes(id)) : alive;
            const inBracket = week.matchups.flatMap(matchup => matchup.away.id && matchup.home.id && alive.includes(matchup.away.id) && alive.includes(matchup.home.id)
                ? [[matchup.away.id, matchup.home.id] as const] : []);
            const sides = inBracket.flat();
            const fits = playing.length > 0 && sides.length === playing.length && playing.every(id => sides.includes(id))
                && (index === 0 ? byes.length : 0) + inBracket.length === advancing && (isFinal || inBracket.length > 1)
                && sides.every(id => season.team(id)?.teamSeasonId);
            if (!fits) {
                warnings.push(`Fantrax's ${week.name} pairings don't fit the bracket, so none of the round's games are stored. Repair the bracket with the season import.`);
                break;
            }
            const weekScores = await scoresOf(week);
            results = inBracket.map(([away, home]) => {
                const result = weekScores.matchups.find(game => [game.away.teamId, game.home.teamId].sort().join() === [away, home].sort().join());
                if (!result) throw new Error(`Fantrax's scores for week ${week.number} have no game between teams ${away} and ${home}.`);
                const scoreOf = (id: string) => result.away.teamId === id ? result.away.score : result.home.score;
                const [awayFranchise, homeFranchise] = [season.team(away)!.franchiseId, season.team(home)!.franchiseId];
                const correction = corrections.find(fix => fix.round === round
                    && fix.franchiseA === Math.min(awayFranchise, homeFranchise) && fix.franchiseB === Math.max(awayFranchise, homeFranchise));
                const corrected = correction?.winner === awayFranchise ? away : correction?.winner === homeFranchise ? home : null;
                let winner = matchupWinner({ id: away, score: scoreOf(away) }, { id: home, score: scoreOf(home) }, corrected);
                if (winner === null) {
                    // Level scores: the winner is the team Fantrax advanced.
                    const next = rounds[index + 1];
                    const placed = next ? [away, home].filter(id => next.matchups.some(matchup => matchup.away.id === id || matchup.home.id === id)) : [];
                    if (placed.length === 1) [winner] = placed;
                    else warnings.push(isFinal
                        ? `The Final between ${name(away)} and ${name(home)} ended level, so there is no champion yet. Set its winner in bracket review.`
                        : `The ${week.name} game between ${name(away)} and ${name(home)} ended level and Fantrax hasn't placed either in the ${next!.name} yet, so it has no winner.`);
                }
                return { away, home, awayScore: scoreOf(away), homeScore: scoreOf(home), winner };
            });
        }

        played.push({ round, results, written: !frozen });
        const winners = results.map(result => result.winner);
        if (winners.some(winner => winner === null)) break;
        alive = [...(index === 0 ? byes : []), ...winners as string[]];
    }

    // The first round in the order Fantrax lists it (or as stored), and each later round beside the games that fed it.
    const slotted = drawingOrder(played.map(({ results }) => results), 0, result => [result.away, result.home]);
    const teamSeason = (id: string) => season.team(id)!.teamSeasonId!;
    const games = played.flatMap(({ round, written }, index) => written ? slotted[index].map(({ away, home, awayScore, homeScore, winner }, slot) => ({
        round, slot, away: teamSeason(away), home: teamSeason(home), awayScore, homeScore, winner: winner === null ? null : teamSeason(winner),
    })) : []);
    return { games, warnings };
}

/** the season's champion, once its Final has a winner: its team season and name, and the weeks it played a playoff game */
export interface Champion {
    teamSeasonId: number;
    name: string;
    /** the Fantrax weeks of the playoff rounds it played a game in (a bye week is not one) */
    weeks: number[];
}

/**
 * The champion once this run's write lands: each round as planned this run, else as stored. The champion is the
 * winner of the last round when it is a single game, the rule the season results view crowns by (migration 0024);
 * it is worked out here because the view sees the bracket only after the write, and the championship roster is
 * part of the same write. Change both together.
 */
function championOf(live: LiveSeason, season: CurrentSeason, planned: PlayoffGame[], stored: PlayoffGame[]): Champion | null {
    const { rounds } = live.playoffs;
    const gamesOf = (round: number) => {
        const games = planned.filter(game => game.round === round);
        return games.length ? games : stored.filter(game => game.round === round);
    };
    const final = gamesOf(rounds.length);
    if (!live.playoffs.fitsFormat || final.length !== 1 || final[0].winner === null) return null;
    const teamSeasonId = final[0].winner;
    const fantraxTeamId = season.teamOf(teamSeasonId)?.fantraxTeamId;
    return {
        teamSeasonId,
        name: live.teams.find(team => team.id === fantraxTeamId)?.name ?? `team season ${teamSeasonId}`,
        weeks: rounds.filter((_, index) => gamesOf(index + 1).some(game => game.away === teamSeasonId || game.home === teamSeasonId)).map(week => week.number),
    };
}

/** the oldest live season the bracket is read from: a day and a half, so one missed evening of refreshes still syncs */
const LIVE_SEASON_MAX_AGE = 36 * 3600_000;

const playoffGamesQuery = (seasonYear: number) => sql`
    select round, slot, away_team_season_id as away, home_team_season_id as home,
           away_score::float8 as "awayScore", home_score::float8 as "homeScore", winner_team_season_id as winner
    from league.matchups
    where season_year = ${seasonYear} and stage = 'playoff' and bracket = 'championship'
    order by round, slot`;

const bracketCorrectionsQuery = (seasonYear: number) => sql`
    select round, franchise_a as "franchiseA", franchise_b as "franchiseB", winner_franchise_id as winner
    from league.matchup_overrides where season_year = ${seasonYear}`;

/** Everything the bracket needs, checked, as its writes and warnings, and the champion once the writes land. */
export async function readBracket(ports: SeasonSyncPorts, season: CurrentSeason, live: LiveSeason, now: number): Promise<{ writes: SyncWrite[]; warnings: string[]; champion: Champion | null }> {
    const [stored, corrections] = await Promise.all([
        rows<PlayoffGame>(playoffGamesQuery(season.seasonYear)),
        rows<BracketCorrection>(bracketCorrectionsQuery(season.seasonYear)),
    ]);
    const scoresOf = async (week: Week) => {
        const scores = await ports.liveSeason.getWeekScores(week.number);
        if (!scores) throw new Error(`Fantrax has no scores for week ${week.number}, the ${week.name}.`);
        // The evening refresh can capture scores before the week ends (e.g. 23:30 ET while West Coast games are on):
        // read fresh from Fantrax when saved scores predate the week's end and it wasn't marked final by hand.
        if (!week.manualFinal && Date.parse(scores.fetchedAt) < Date.parse(week.endDate)) {
            return ports.fantrax.weekScores(season.leagueId, week.number);
        }
        return scores;
    };
    const { games, warnings } = await planBracket({ season, live, scoresOf, stored, corrections, now });
    return { writes: games.length ? playoffGamesWrites(season.seasonYear, games) : [], warnings, champion: championOf(live, season, games, stored) };
}

/**
 * The games as two parts touching disjoint rows: any stored championship game in the rewritten rounds whose
 * pairing is no longer in the planned bracket is deleted, and every planned game is inserted or updated in place
 * on (season_year, stage, round, away_team_season_id, home_team_season_id) only where a value differs (avoiding
 * unique-key collisions when games swap slots inside a round). Each returns one row per game it changed.
 */
export const playoffGamesWrites = (seasonYear: number, games: PlayoffGame[]): SyncWrite[] => [{
    count: 'playoffGames',
    change: 'playoffs',
    statement: sql`
        delete from league.matchups m
        where m.season_year = ${seasonYear} and m.stage = 'playoff' and m.bracket = 'championship'
          and m.round in (select distinct g.round from ${gamesPayload(games)})
          and not exists (select 1 from ${gamesPayload(games)}
              where g.round = m.round and g.away = m.away_team_season_id and g.home = m.home_team_season_id)
        returning m.id`,
}, {
    count: 'playoffGames',
    change: 'playoffs',
    statement: sql`
        ${insertGames(seasonYear, 'playoff', games)}
        on conflict (season_year, stage, round, away_team_season_id, home_team_season_id) do update
        set bracket = excluded.bracket, slot = excluded.slot, away_score = excluded.away_score,
            home_score = excluded.home_score, winner_team_season_id = excluded.winner_team_season_id
        where (m.bracket, m.slot, m.away_score, m.home_score, m.winner_team_season_id)
              is distinct from (excluded.bracket, excluded.slot, excluded.away_score, excluded.home_score, excluded.winner_team_season_id)
        returning m.id`,
}];
