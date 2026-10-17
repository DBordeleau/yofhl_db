import type { PlayerProfile, FranchiseDetail, BannerSeason, FranchiseCard, LeaderRow, AwardWinner } from '../data/league';
import { awardSlug, seasonLabel, splitPositions, winPercentage } from '../league';
import { playerHref } from '../player-url';
import { AWARDS, getAwardDefinition } from '../awards';
import { comparisonChart, type ComparisonChart, type ComparisonPlayer } from '../compare/model';
import { comparisonHref, teamComparisonHref, type Metric } from '../compare/state';
import type { RankedPick } from '../draft/hindsight';
import { gameScore, pairSummary, type RivalryGame } from '../rivalries/model';

// Printed on every card; the shared link itself always uses the current deployment origin.
export const SHARE_SITE = 'yofhl.com';

export interface ShareTeam { id: number | null; name: string; abbreviation: string; logo: string | null }
/** 'cup' champion, 'final' lost final, 'out' missed playoffs, 'cancelled' no playoffs, otherwise the round reached. */
export type SeasonResult = 'cup' | 'final' | 'out' | 'cancelled' | number;

interface CardBase { href: string; title: string; summary: string }
export interface PlayerShareCard extends CardBase {
    kind: 'player'; name: string; rank: number | null; positions: string[]; team: ShareTeam | null;
    totalFPts: number; fpg: number; seasons: number; cups: number;
    seasonPoints: { year: number; value: number; champion: boolean }[];
    trophies: { name: string; image: string; count: number }[];
}
export interface TeamShareCard extends CardBase {
    kind: 'team'; team: ShareTeam; owner: string | null; span: string; defunct: boolean;
    record: string; winRate: number; fptsFor: number; cups: number; finals: number;
    seasons: { year: number; record: string; result: SeasonResult }[];
}
export interface SeasonShareCard extends CardBase {
    kind: 'season'; year: number; cancelled: boolean; team: ShareTeam | null; owner: string | null;
    scorers: { name: string; position: string; points: number }[];
}
export interface ComparisonShareCard extends CardBase {
    kind: 'comparison'; metric: Metric; span: string; chart: ComparisonChart;
}
export interface VersusShareCard extends CardBase {
    kind: 'versus'; stage: 'regular' | 'playoff'; span: string; teams: [ShareTeam, ShareTeam];
    wins: [number, number]; points: [number, number]; ties: number;
    /** Oldest first. Margin is from the first team's side; adjusted scores have no real margin. */
    meetings: { year: number; winner: 0 | 1 | null; margin: number | null }[];
}
export interface StealShareCard extends CardBase {
    kind: 'steal'; year: number; number: number; count: number; name: string; team: ShareTeam | null; positions: string[];
    round: number; pick: number; overall: number; finish: number; climb: number; fpts: number; fpg: number | null;
    totalPicks: number; rounds: number;
}
export interface AwardShareCard extends CardBase {
    kind: 'award'; recipient: 'player' | 'team'; year: number; award: string; honor: string; image: string | null;
    winner: string; team: ShareTeam | null; owner: string | null;
    /** Player: season FPts and FP/G. Team: regular-season record and points for. */
    fpts: number | null; fpg: number | null; record: string | null;
    /** How many times this winner has taken the award, counting this season. */
    count: number; short: string;
}
export interface EpisodeShareCard extends CardBase {
    kind: 'episode'; episode: string; week: number | null; aired: string | null; runtimeMs: number;
    quote: { who: 'don' | 'ron'; text: string } | null;
}
export type ShareCard = PlayerShareCard | TeamShareCard | SeasonShareCard | ComparisonShareCard | VersusShareCard | StealShareCard | AwardShareCard | EpisodeShareCard;

export function archiveSpan(years: number[]) {
    if (!years.length) return 'No archive seasons';
    const sorted = [...years].sort((a, b) => a - b);
    return sorted.length === 1 ? seasonLabel(sorted[0]) : `${seasonLabel(sorted[0])} to ${seasonLabel(sorted.at(-1)!)}`;
}
const record = (wins: number, losses: number, ties: number) => ties ? `${wins}–${losses}–${ties}` : `${wins}–${losses}`;

export function playerShareCard(player: PlayerProfile): PlayerShareCard {
    const counts = new Map<string, number>();
    for (const award of player.awards) {
        const definition = getAwardDefinition(award.Award);
        if (definition) counts.set(definition.id, (counts.get(definition.id) ?? 0) + 1);
    }
    return { kind: 'player', title: player.name, href: playerHref(player.id),
        summary: `${player.name}: ${player.totalFPts.toFixed(2)} career fantasy points, ${player.fpg.toFixed(2)} per game, ${player.championships.length} Jagr Cups.`,
        name: player.name, rank: player.rank, positions: player.positions,
        team: player.team && { id: player.team.id, name: player.team.name, abbreviation: player.team.abbreviation, logo: player.team.logoUrl },
        totalFPts: player.totalFPts, fpg: player.fpg, seasons: player.seasons, cups: player.championships.length,
        seasonPoints: [...player.playerStats].sort((a, b) => a.Year - b.Year).map(row => ({ year: row.Year, value: row.FPts, champion: row.Champion })),
        trophies: AWARDS.filter(award => counts.has(award.id)).map(award => ({ name: award.label, image: award.image, count: counts.get(award.id)! })) };
}

export function seasonResult(season: FranchiseDetail['seasons'][number], champion: boolean): SeasonResult {
    if (season.playoffStatus === 'cancelled') return 'cancelled';
    if (champion) return 'cup';
    if (season.playoffRound === null) return 'out';
    return season.playoffRound === season.finalRound ? 'final' : season.playoffRound;
}
export function teamShareCard(team: FranchiseDetail): TeamShareCard {
    return { kind: 'team', title: team.name, href: `/teams/${team.id}`,
        summary: `${team.name}: ${record(team.wins, team.losses, team.ties)} record, ${team.championships.length} Jagr Cups, ${team.seasons.length} seasons.`,
        team: { id: team.id, name: team.name, abbreviation: team.abbreviation, logo: team.logo }, owner: team.owner,
        span: archiveSpan(team.seasons.map(row => row.year)), defunct: team.foldedAfterSeason !== null,
        record: `${team.wins}–${team.losses}–${team.ties}`, winRate: winPercentage(team), fptsFor: team.fptsFor,
        cups: team.championships.length, finals: team.finals.length,
        seasons: [...team.seasons].sort((a, b) => a.year - b.year).map(row => ({ year: row.year, record: record(row.wins, row.losses, row.ties),
            result: seasonResult(row, team.championships.includes(row.year)) })) };
}

export function seasonShareCard(season: BannerSeason, roster: LeaderRow[] = []): SeasonShareCard {
    const cancelled = season.playoffStatus === 'cancelled';
    return { kind: 'season', title: seasonLabel(season.year), href: `/season/${season.year}`,
        summary: cancelled ? `${seasonLabel(season.year)}: playoffs cancelled.` : `${seasonLabel(season.year)} Jagr Cup champions: ${season.team ?? 'not recorded'}.`,
        year: season.year, cancelled, owner: cancelled ? null : season.owner,
        team: season.team && !cancelled ? { id: season.franchiseId, name: season.team, abbreviation: season.abbreviation ?? 'YOF', logo: season.logo } : null,
        scorers: cancelled ? [] : [...roster].sort((a, b) => b.FPts - a.FPts).slice(0, 3)
            .map(row => ({ name: row.Player, position: splitPositions(row.Position)[0] ?? '', points: row.FPts })) };
}

export function comparisonShareCard(players: ComparisonPlayer[], metric: Metric): ComparisonShareCard {
    const chart = comparisonChart(players, metric);
    return { kind: 'comparison', title: 'Player comparison', href: comparisonHref({ ids: players.map(player => player.id), metric }),
        summary: `${players.map(player => player.name).join(' vs ')}, ${metric === 'fpg' ? 'fantasy points per game' : 'fantasy points'}, ${archiveSpan(chart.years)}.`,
        metric, span: archiveSpan(chart.years), chart };
}

export function teamComparisonShareCard(a: FranchiseCard, b: FranchiseCard, games: RivalryGame[], stage: 'regular' | 'playoff'): VersusShareCard {
    const summary = pairSummary(games.filter(game => game.stage === stage), a.ID, b.ID);
    const span = archiveSpan(summary.meetings.map(game => game.year));
    return { kind: 'versus', title: 'Head to head', href: teamComparisonHref(a.ID, b.ID, stage),
        summary: `${a.Team} ${summary.winsA}, ${b.Team} ${summary.winsB} in ${summary.meetings.length} ${stage === 'playoff' ? 'playoff' : 'regular-season'} meetings, ${span}.`,
        stage, span, teams: [a, b].map(team => ({ id: team.ID, name: team.Team, abbreviation: team.Abbreviation, logo: team.LogoUrl })) as [ShareTeam, ShareTeam],
        wins: [summary.winsA, summary.winsB], points: [summary.pointsA, summary.pointsB], ties: summary.ties,
        meetings: [...summary.meetings].reverse().map(game => ({ year: game.year,
            winner: game.winner === a.ID ? 0 : game.winner === b.ID ? 1 : null,
            margin: game.adjusted ? null : Math.round((gameScore(game, a.ID) - gameScore(game, b.ID)) * 100) / 100 })) };
}

export function stealShareCard(year: number, steal: RankedPick, number: number, count: number, totalPicks: number, rounds: number): StealShareCard {
    const name = steal.player ?? 'Unknown player';
    return { kind: 'steal', title: `${seasonLabel(year)} steal ${number} ${name}`, href: `/season/${year}?draft=steals#draft-class`,
        summary: `Number ${number} steal of the ${seasonLabel(year)} draft: ${name}, drafted #${steal.overall}, finished #${steal.rank}.`,
        year, number, count, name, positions: splitPositions(steal.positions ?? ''),
        team: steal.teamName ? { id: steal.franchiseId, name: steal.teamName, abbreviation: steal.teamAbbreviation ?? '', logo: steal.teamLogo } : null,
        round: steal.round, pick: steal.pick, overall: steal.overall, finish: steal.rank, climb: steal.movement,
        fpts: steal.value, fpg: steal.fpg, totalPicks, rounds };
}

// Short trophy names for the repeat-win label, e.g. "3rd Gretzky win".
const SHORT_AWARD: Record<string, string> = { 'jagr-cup': 'Jagr Cup', 'prime-minister': 'PM Trophy', 'wayne-gretzky': 'Gretzky', 'le-magnifique': 'Magnifique',
    'bobby-orr': 'Orr', hasek: 'Hasek', 'danny-briere': 'Briere', 'teemu-selanne': 'Teemu' };
export interface ShareAward { id: string | null; name: string; label: string; honor: string; image: string | null }
export function awardShareCard(award: ShareAward, winner: AwardWinner, winners: AwardWinner[], recipient: 'player' | 'team'): AwardShareCard {
    const same = (other: AwardWinner) => recipient === 'team' ? other.TeamID !== null && other.TeamID === winner.TeamID : other.PlayerID === winner.PlayerID;
    const count = winners.filter(other => same(other) && other.Year <= winner.Year).length;
    return { kind: 'award', title: `${seasonLabel(winner.Year)} ${award.label} ${winner.Winner}`, href: `/awards/${awardSlug(award.name)}`,
        summary: `${winner.Winner} won the ${seasonLabel(winner.Year)} ${award.label}.`,
        recipient, year: winner.Year, award: award.label, honor: award.honor, image: award.image, winner: winner.Winner,
        team: winner.Team ? { id: winner.TeamID, name: winner.Team, abbreviation: winner.Team.slice(0, 4).toUpperCase(), logo: winner.TeamLogo ?? null } : null,
        owner: recipient === 'team' ? winner.Owner ?? null : null,
        fpts: winner.FPts ?? null, fpg: winner.FPG ?? null, record: winner.Record ?? null,
        count, short: (award.id && SHORT_AWARD[award.id]) ?? award.label };
}

/** A Coach's Corner episode; the quote comes from `pullQuote` on the server so the script parser stays out of this module. */
export function episodeShareCard(episode: { slug: string; title: string; week: number | null; publishedAt: string | null; durationMs: number },
    quote: EpisodeShareCard['quote']): EpisodeShareCard {
    const week = episode.week !== null ? `Week ${episode.week}: ` : '';
    return { kind: 'episode', title: `Coach's Corner ${week}${episode.title}`, href: `/coachs-corner/${episode.slug}`,
        summary: `Coach's Corner, ${week}${episode.title}.${quote ? ` ${quote.who === 'don' ? 'Don' : 'Ron'}: “${quote.text}”` : ''}`,
        episode: episode.title, week: episode.week, aired: episode.publishedAt, runtimeMs: episode.durationMs, quote };
}

export function shareUrl(href: string, origin: string) {
    if (!href.startsWith('/') || href.startsWith('//')) throw new Error('A public page path is required.');
    const url = new URL(href, origin);
    if (url.origin !== new URL(origin).origin) throw new Error('A public page path is required.');
    return url.href;
}
export const shareFilename = (title: string) => `yofhl-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'archive'}.png`;
