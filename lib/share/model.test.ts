import assert from 'node:assert/strict';
import test from 'node:test';
import type { BannerSeason, FranchiseCard, FranchiseDetail, PlayerProfile } from '../data/league';
import { comparisonChart } from '../compare/model';
import type { RankedPick } from '../draft/hindsight';
import { awardShareCard, comparisonShareCard, playerShareCard, seasonShareCard, shareUrl, stealShareCard, teamComparisonShareCard, teamShareCard } from './model';
import type { RivalryGame } from '../rivalries/model';

test('player card uses the displayed archive totals and groups trophies, and cancelled seasons never invent champions', () => {
    const player: PlayerProfile = { id: '*one*', name: 'Player', rank: null, totalFPts: 123.45, fpg: 1.23, seasons: 0, positions: [], team: null, playerStats: [],
        awards: [2021, 2023].map(Year => ({ Award: 'Wayne Gretzky Award', label: 'Wayne Gretzky Award', description: '', Year })), championships: [] };
    const card = playerShareCard(player);
    assert.equal(card.href, '/player/one');
    assert.deepEqual([card.totalFPts, card.fpg, card.cups, card.seasons], [123.45, 1.23, 0, 0]);
    assert.deepEqual(card.trophies.map(row => [row.name, row.count]), [['Wayne Gretzky Award', 2]]);
    const season: BannerSeason = { year: 2020, label: '2019–20', playoffStatus: 'cancelled', team: null, owner: null, logo: null, abbreviation: null, franchiseId: null };
    const cancelled = seasonShareCard(season, [{ ID: 'x', Player: 'Someone', Position: 'C', FPts: 1, FPG: 1 } as never]);
    assert.equal(cancelled.cancelled, true);
    assert.equal(cancelled.team, null);
    assert.deepEqual(cancelled.scorers, []);
});

test('franchise card labels each season by how far the team went', () => {
    const row = { name: 'A', owner: null, fptsFor: 0, fptsAgainst: 0, wins: 1, losses: 2, ties: 0, playoffStatus: 'complete' as const, playoffRound: null, finalRound: 3 };
    const team: FranchiseDetail = { id: 4, name: 'A', abbreviation: 'A', logo: null, formerNames: [], owner: null, firstSeason: 2019, foldedAfterSeason: null,
        wins: 3, losses: 1, ties: 0, fptsFor: 0, fptsAgainst: 0, championships: [2024], finals: [2023, 2024], leaders: [],
        seasons: [{ ...row, year: 2024, playoffRound: 3 }, { ...row, year: 2023, playoffRound: 3 }, { ...row, year: 2022, playoffRound: 2 }, { ...row, year: 2021 },
            { ...row, year: 2020, playoffStatus: 'cancelled', ties: 1 }] };
    const card = teamShareCard(team);
    assert.deepEqual(card.seasons.map(season => [season.year, season.result]), [[2020, 'cancelled'], [2021, 'out'], [2022, 2], [2023, 'final'], [2024, 'cup']]);
    assert.equal(card.seasons[0].record, '1–2–1');
    assert.equal(card.winRate, 75);
});

test('share comparison uses the exact page chart, selection order and metric', () => {
    const players = ['second', 'first'].map(id => ({ id, name: id, playerStats: [{ Year: 2025, FPts: 12.25, FPG: 1.5 }] }));
    const card = comparisonShareCard(players, 'fpg');
    assert.equal(card.href, '/compare/players?player=second&player=first&metric=fpg');
    assert.deepEqual(card.chart, comparisonChart(players, 'fpg'));
    assert.equal(shareUrl(card.href, 'https://league.example'), `https://league.example${card.href}`);
    for (const path of ['https://other.example', '//other.example', '/\\other.example']) assert.throws(() => shareUrl(path, 'https://league.example'));
});

test('team card respects stage and orientation, reports ties and lists meetings oldest first', () => {
    const base: FranchiseCard = { ID: 4, Team: 'A', Abbreviation: 'A', Owner: null, defunct: false, Wins: 0, Losses: 0, Ties: 0, FPF: 0, championships: [], finals: [], LogoUrl: null };
    const other = { ...base, ID: 5, Team: 'B', Abbreviation: 'B' };
    const game: RivalryGame = { id: 1, year: 2025, stage: 'regular', round: 2, finalRound: 3, away: 4, home: 5, awayName: 'A', homeName: 'B', awayScore: 10, homeScore: 10, winner: null, adjusted: false, note: null };
    const card = teamComparisonShareCard(other, base, [game, { ...game, id: 3, year: 2024, awayScore: 30, winner: 4 }, { ...game, id: 2, stage: 'playoff', awayScore: 100, winner: 4 }], 'regular');
    assert.deepEqual(card.wins, [0, 1]);
    assert.deepEqual(card.points, [20, 40]);
    assert.equal(card.ties, 1);
    assert.deepEqual(card.meetings, [{ year: 2024, winner: 1, margin: -20 }, { year: 2025, winner: null, margin: 0 }]);
    assert.equal(card.href, '/compare/teams?a=5&b=4&stage=regular');
});

test('steal card links to the season steals and carries the climb', () => {
    const steal = { overall: 36, round: 3, pick: 12, player: 'Mika Zibanejad', playerId: '*x*', positions: 'C', points: 447, fpg: 5.52, value: 447, rank: 3, movement: 33,
        regretEligible: false, franchiseId: 13, teamName: 'Hall Monitors', teamAbbreviation: 'HUNG', teamLogo: null } as unknown as RankedPick;
    const card = stealShareCard(2026, steal, 1, 10, 96, 8);
    assert.equal(card.href, '/season/2026?draft=steals#draft-class');
    assert.deepEqual([card.number, card.overall, card.finish, card.climb, card.totalPicks], [1, 36, 3, 33, 96]);
    assert.match(card.summary, /drafted #36, finished #3/);
});

test('award card counts repeat wins up to that season and keeps the season context', () => {
    const win = (Year: number, PlayerID: string) => ({ Year, Winner: PlayerID === 'a' ? 'Connor McDavid' : 'Other', PlayerID, Team: 'Varrock', TeamID: 4, TeamLogo: '/vwizlogo.png', FPts: 600, FPG: 8 });
    const winners = [win(2026, 'a'), win(2024, 'b'), win(2023, 'a'), win(2021, 'a')];
    const award = { id: 'wayne-gretzky', name: 'Wayne Gretzky Award', label: 'Wayne Gretzky Award', honor: 'Most outstanding player', image: '/trophies/wayne-gretzky.webp' };
    const card = awardShareCard(award, winners[2], winners, 'player');
    assert.deepEqual([card.count, card.short, card.fpts, card.href], [2, 'Gretzky', 600, '/awards/Wayne_Gretzky_Award']);
    assert.equal(card.team?.logo, '/vwizlogo.png');
    assert.equal(awardShareCard(award, winners[0], winners, 'player').count, 3);
});
