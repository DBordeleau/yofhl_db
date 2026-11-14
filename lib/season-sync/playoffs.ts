// Playoff bracket: each playoff round's championship games, written once the round's week is final (its end has
// passed, or an admin marked it final), from the live season's playoff weeks and pairings and the week's scores.
//
// A game is a championship game when both teams are still alive in the bracket: the playoff seeds in the first
// round (the top seeds having a bye), then the previous round's winners plus the bye teams. Other games in those
// weeks are ignored. A round whose pairings don't fit the bracket writes nothing, nor does any round after it; a
// playoff schedule that isn't the league's three rounds writes no bracket. Both record a warning.
//
// The winner follows the shared matchup winner rule, so a saved bracket correction decides it. On level scores
// with no correction it is the team Fantrax places in the next round; a level Final has no winner (and so no
// champion) until it is set in bracket review. A game follows Fantrax until its week's correction window closes;
// after that it is never rewritten, and the stored game decides who is alive in the next round. The Final's
// winner is the champion, which publishes the season through the season results view.
import { sql } from 'drizzle-orm';
import { rows } from '@/lib/data/db';
import { matchupWinner } from '@/lib/data/matchup-winner';
import { PLAYOFF_FORMAT } from '@/lib/fantrax/config';
import { correctionWindowClosed, type LiveSeason, type Week, type WeekScores } from '@/lib/fantrax/live-season';
import type { OpenedSeason } from './opened-season';
import type { SeasonSyncPorts } from './ports';
import type { SyncWrite } from './write';

/** a championship game as stored: its round and slot, both team seasons, both scores and the winning team season */
export interface PlayoffGame {
    round: number;
    /** top-to-bottom position in its round for drawing the bracket, from 0, in Fantrax's schedule order */
    slot: number;
    away: number;
    home: number;
    awayScore: number;
    homeScore: number;
    /** null while the game has no winner: a level Final with no bracket correction */
    winner: number | null;
}

/** a saved bracket correction (league.matchup_overrides); `winner` is a franchise, null when the score decides */
interface BracketCorrection {
    round: number;
    franchiseA: number;
    franchiseB: number;
    winner: number | null;
}

interface BracketInput {
    season: OpenedSeason;
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
    const byFantrax = new Map(season.teams.map(team => [team.fantraxTeamId, team]));
    const byTeamSeason = new Map(season.teams.map(team => [team.teamSeasonId, team]));
    const name = (fantraxTeamId: string) => live.teams.find(team => team.id === fantraxTeamId)?.name ?? fantraxTeamId;

    // Seeds in standings order; the top seeds have the first round's byes. Each round halves the bracket, so the
    // byes give the number of seeds. (Fantrax's own count of playoff teams, once the first round is seeded, takes
    // in every team with a game that week, in the bracket or not.)
    const seeds = live.standings.rows.map(row => row.team.id).slice(0, 2 ** rounds.length - playoffs.byes);
    const byes = seeds.slice(0, playoffs.byes);
    let alive = seeds;
    const games: PlayoffGame[] = [];
    const warnings: string[] = [];

    for (const [index, week] of rounds.entries()) {
        if (week.phase !== 'final') break;
        const round = index + 1;
        const isFinal = index === rounds.length - 1;
        /** every round halves the bracket down to the champion */
        const advancing = 2 ** (rounds.length - 1 - index);
        // [away, home, away score, home score, winner] as Fantrax team IDs
        let results: [string, string, number, number, string | null][];

        if (correctionWindowClosed(week.endDate, now)) {
            const kept = stored.filter(game => game.round === round).sort((a, b) => a.slot - b.slot);
            const fantraxId = (teamSeasonId: number | null) => teamSeasonId === null ? null : byTeamSeason.get(teamSeasonId)?.fantraxTeamId ?? null;
            results = kept.map(game => [fantraxId(game.away)!, fantraxId(game.home)!, game.awayScore, game.homeScore, fantraxId(game.winner)]);
            if (!results.length) {
                warnings.push(`The ${week.name} games weren't stored before their correction window closed, so the bracket stops there. Repair it with the season import.`);
                break;
            }
        } else {
            const playing = index === 0 ? alive.filter(id => !byes.includes(id)) : alive;
            const inBracket = week.matchups.flatMap(matchup => matchup.away.id && matchup.home.id && alive.includes(matchup.away.id) && alive.includes(matchup.home.id)
                ? [[matchup.away.id, matchup.home.id] as const] : []);
            const sides = inBracket.flat();
            const fits = playing.length > 0 && sides.length === playing.length && playing.every(id => sides.includes(id))
                && (index === 0 ? byes.length : 0) + inBracket.length === advancing && (isFinal || inBracket.length > 1)
                && sides.every(id => byFantrax.get(id)?.teamSeasonId);
            if (!fits) {
                warnings.push(`Fantrax's ${week.name} pairings don't fit the bracket, so none of the round's games are stored. Repair the bracket with the season import.`);
                break;
            }
            const weekScores = await scoresOf(week);
            results = inBracket.map(([away, home]) => {
                const result = weekScores.matchups.find(game => [game.away.teamId, game.home.teamId].sort().join() === [away, home].sort().join());
                if (!result) throw new Error(`Fantrax's scores for week ${week.number} have no game between teams ${away} and ${home}.`);
                const scoreOf = (id: string) => result.away.teamId === id ? result.away.score : result.home.score;
                const [awayFranchise, homeFranchise] = [byFantrax.get(away)!.franchiseId, byFantrax.get(home)!.franchiseId];
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
                return [away, home, scoreOf(away), scoreOf(home), winner];
            });
            const teamSeason = (id: string) => byFantrax.get(id)!.teamSeasonId!;
            games.push(...results.map(([away, home, awayScore, homeScore, winner], slot) => ({
                round, slot, away: teamSeason(away), home: teamSeason(home), awayScore, homeScore, winner: winner === null ? null : teamSeason(winner),
            })));
        }

        const winners = results.map(result => result[4]);
        if (winners.some(winner => winner === null)) break;
        alive = [...(index === 0 ? byes : []), ...winners as string[]];
    }
    return { games, warnings };
}

/** the live season, checked to be the opened season */
async function liveSeasonOf(ports: SeasonSyncPorts, season: OpenedSeason, now: number): Promise<LiveSeason> {
    const result = await ports.liveSeason.getLiveSeason({ now });
    if (result.status !== 'available') throw new Error('The live season is unavailable, so its playoff weeks could not be read.');
    const live = result.value;
    if (live.seasonYear !== season.seasonYear || live.fantraxLeagueId !== season.leagueId) {
        throw new Error(`The live season is Fantrax league ${live.fantraxLeagueId}'s ${live.seasonYear} season, not ${season.leagueId}'s ${season.seasonYear}.`);
    }
    return live;
}

const playoffGamesQuery = (seasonYear: number) => sql`
    select round, slot, away_team_season_id as away, home_team_season_id as home,
           away_score::float8 as "awayScore", home_score::float8 as "homeScore", winner_team_season_id as winner
    from league.matchups
    where season_year = ${seasonYear} and stage = 'playoff' and bracket = 'championship'
    order by round, slot`;

const bracketCorrectionsQuery = (seasonYear: number) => sql`
    select round, franchise_a as "franchiseA", franchise_b as "franchiseB", winner_franchise_id as winner
    from league.matchup_overrides where season_year = ${seasonYear}`;

/** Everything the bracket needs, checked, as its writes and warnings. */
export async function readBracket(ports: SeasonSyncPorts, season: OpenedSeason, now: number): Promise<{ writes: SyncWrite[]; warnings: string[] }> {
    const [live, stored, corrections] = await Promise.all([
        liveSeasonOf(ports, season, now),
        rows<PlayoffGame>(playoffGamesQuery(season.seasonYear)),
        rows<BracketCorrection>(bracketCorrectionsQuery(season.seasonYear)),
    ]);
    const scoresOf = async (week: Week) => {
        const scores = await ports.liveSeason.getWeekScores(week.number);
        if (!scores) throw new Error(`Fantrax has no scores for week ${week.number}, the ${week.name}.`);
        return scores;
    };
    const { games, warnings } = await planBracket({ season, live, scoresOf, stored, corrections, now });
    return { writes: games.length ? playoffGamesWrites(season.seasonYear, games) : [], warnings };
}

const gamesPayload = (games: PlayoffGame[]) => sql`jsonb_to_recordset(${JSON.stringify(games)}::jsonb)
    as g(round smallint, slot smallint, away int, home int, "awayScore" numeric, "homeScore" numeric, winner int)`;

/**
 * The games as two parts touching disjoint rows: a stored game (by round and slot) is rewritten only where a value
 * differs, and a game not yet stored is inserted. Each returns one row per game it changed.
 */
export const playoffGamesWrites = (seasonYear: number, games: PlayoffGame[]): SyncWrite[] => [{
    count: 'playoffGames',
    change: 'playoffs',
    statement: sql`
        update league.matchups m
        set away_team_season_id = g.away, home_team_season_id = g.home, away_score = round(g."awayScore", 2),
            home_score = round(g."homeScore", 2), winner_team_season_id = g.winner
        from ${gamesPayload(games)}
        where m.season_year = ${seasonYear} and m.stage = 'playoff' and m.bracket = 'championship' and m.round = g.round and m.slot = g.slot
          and (m.away_team_season_id, m.home_team_season_id, m.away_score, m.home_score, m.winner_team_season_id)
              is distinct from (g.away, g.home, round(g."awayScore", 2), round(g."homeScore", 2), g.winner)
        returning m.id`,
}, {
    count: 'playoffGames',
    change: 'playoffs',
    statement: sql`
        insert into league.matchups (season_year, stage, round, bracket, slot, away_team_season_id, home_team_season_id, away_score, home_score, winner_team_season_id)
        select ${seasonYear}, 'playoff', g.round, 'championship', g.slot, g.away, g.home, round(g."awayScore", 2), round(g."homeScore", 2), g.winner
        from ${gamesPayload(games)}
        where not exists (select 1 from league.matchups m
            where m.season_year = ${seasonYear} and m.stage = 'playoff' and m.bracket = 'championship' and m.round = g.round and m.slot = g.slot)
        returning id`,
}];
