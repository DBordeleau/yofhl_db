import { seasonLabel } from '../league';
import { playerHref } from '../player-url';
import { getAwardDefinition } from '../awards';
import { PLAYER_STATS, type PlayerStat, type PlayerCategories } from './player-stats';
import type { FranchiseCard } from '../data/league';
import type { LeagueSnapshot, RosterStats } from '../fantrax/model';
import type { RivalryGame } from '../rivalries/model';

export type Category = 'teams' | 'players' | 'matchups' | 'honours';
export interface PlayerSeason { id: string; name: string; year: number; points: number; positions: string[]; stats?: PlayerCategories }
export interface TeamSeason { team: number; name: string; year: number; wins: number; losses: number; ties: number; points: number; logo?: string | null; abbreviation?: string }
export interface Award { player: string; name: string; award: string; year: number; team: number | null }
export interface PeriodInfo { year: number; period: number; days: number; era: number; start: string; end: string }
export interface RecordSource {
    teams: FranchiseCard[]; players: PlayerSeason[]; seasons: TeamSeason[]; awards: Award[];
    competitions: number[]; games: RivalryGame[]; periods: PeriodInfo[];
}
export interface Entry {
    id: string; name: string; value: number; detail: string; href: string; team: number | null; rank?: number; logo?: string | null; abbreviation?: string; portrait?: string;
}
export interface RecordList { id: string; category: Category; title: string; unit: string; entries: Entry[] }
export interface Chase {
    id: string; name: string; team: number | null; kind: string; unit: string;
    archived: number; current: number; total: number; target: number; gap: number; step: number; href: string;
}
export { playerHref } from '../player-url';
const round = (value: number) => Math.round(value * 100) / 100;
const yearList = (years: number[]) => [...years].sort((a, b) => a - b).map(seasonLabel).join(', ');

export function rankEntries(entries: Entry[], ascending = false): Entry[] {
    const sorted = [...entries].sort((a, b) => (ascending ? a.value - b.value : b.value - a.value) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    let rank = 0;
    return sorted.map((entry, index) => {
        if (index === 0 || entry.value !== sorted[index - 1].value) rank = index + 1;
        return { ...entry, rank };
    });
}

export function longestRun(years: number[], calendar: number[]): number[] {
    const won = new Set(years);
    let current: number[] = [], best: number[] = [];
    for (const year of [...calendar].sort((a, b) => a - b)) {
        current = won.has(year) ? [...current, year] : [];
        if (current.length > best.length) best = current;
    }
    return best;
}

export function matchupFormats(source: RecordSource) {
    const active = new Set(source.games.filter(game => game.awayScore !== 0 || game.homeScore !== 0).map(game => `${game.year}:${game.round}`));
    const formats = new Set(source.periods.filter(p => active.has(`${p.year}:${p.period}`)).map(matchupFormat));
    return [{ id: 'biweekly', label: 'Bi-weekly' }, { id: 'weekly', label: 'Weekly' }].filter(f => formats.has(f.id as MatchupFormat));
}

export type MatchupFormat = 'biweekly' | 'weekly';

export function matchupFormat(period: PeriodInfo): MatchupFormat | null {
    if (period.days <= 0 || period.days > 7) return null;
    // Keep shortened opening periods with their season's usual schedule.
    if (period.year === 2019) return 'weekly';
    if (period.days >= 7) return null;
    return 'biweekly';
}

export function buildRecords(source: RecordSource, filter: { team?: number; position?: string; format?: string; stat?: PlayerStat } = {}): RecordList[] {
    const records: RecordList[] = [];
    const teams = source.teams.filter(t => !filter.team || t.ID === filter.team);
    const seasons = source.seasons.filter(s => !filter.team || s.team === filter.team);
    const add = (id: string, category: Category, title: string, unit: string, entries: Entry[], ascending = false) => {
        records.push({ id, category, title, unit, entries: rankEntries(entries, ascending).filter(entry => entry.rank! <= 10) });
    };
    const teamEntry = (team: FranchiseCard, value: number, detail = ''): Entry => ({ id: String(team.ID), name: team.Team, team: team.ID, value, detail, href: `/teams/${team.ID}` });
    const seasonEntry = (s: TeamSeason, value: number, detail = seasonLabel(s.year)): Entry => ({ id: `${s.team}:${s.year}`, name: s.name, team: s.team, logo: s.logo, abbreviation: s.abbreviation, value, detail, href: `/teams/${s.team}` });
    add('season-points', 'teams', 'Highest-scoring season', 'FPts', seasons.map(s => seasonEntry(s, s.points)));
    add('career-wins', 'teams', 'Career wins', 'wins', teams.map(t => teamEntry(t, t.Wins, `${t.Wins}–${t.Losses}–${t.Ties}`)));
    add('win-percentage', 'teams', 'Best season record', '%', seasons.filter(s => s.wins + s.losses + s.ties > 0).map(s => seasonEntry(s,
        round((s.wins + s.ties / 2) / (s.wins + s.losses + s.ties) * 100), `${seasonLabel(s.year)} · ${s.wins}–${s.losses}–${s.ties}`)));
    add('career-points', 'teams', 'Career scoring', 'FPts', teams.map(t => teamEntry(t, t.FPF, 'Regular season')));
    add('season-wins', 'teams', 'Most wins in a season', 'wins', seasons.map(s => seasonEntry(s, s.wins, `${seasonLabel(s.year)} · ${s.wins}–${s.losses}–${s.ties}`)));

    const playerGroups = new Map<string, PlayerSeason[]>();
    for (const p of source.players) playerGroups.set(p.id, [...(playerGroups.get(p.id) ?? []), p]);
    const playerEntry = (p: PlayerSeason, value: number, detail: string): Entry => ({ id: p.id, name: p.name, team: null, value, detail, href: playerHref(p.id) });
    const eligible = source.players.filter(p => !filter.position || p.positions.includes(filter.position));
    const calendar = [...new Set(source.players.map(p => p.year))].sort((a, b) => a - b);
    // Position-specific career totals include only seasons played at that position.
    const careers = [...playerGroups.values()].map(seasons => seasons.filter(p => !filter.position || p.positions.includes(filter.position))).filter(seasons => seasons.length);
    const stat = PLAYER_STATS.find(stat => stat.id === filter.stat);
    if (stat) {
        const unit = stat.label.toLowerCase();
        const measured = careers.map(seasons => seasons.filter(p => p.stats?.[stat.id] != null)).filter(seasons => seasons.length);
        add(`player-career-${stat.id}`, 'players', `Career ${unit}`, unit, measured.map(seasons => playerEntry(seasons[0], seasons.reduce((sum, p) => sum + p.stats![stat.id], 0), `${seasons.length} seasons`)).filter(p => p.value > 0));
        add(`player-season-${stat.id}`, 'players', `Most ${unit} in a season`, unit, eligible.filter(p => (p.stats?.[stat.id] ?? 0) > 0).map(p => ({ ...playerEntry(p, p.stats![stat.id], seasonLabel(p.year)), id: `${p.id}:${p.year}` })));
    } else {
        add('player-career', 'players', 'Career scoring', 'FPts', careers.map(seasons => playerEntry(seasons[0], round(seasons.reduce((sum, p) => sum + p.points, 0)), `${seasons.length} seasons`)));
        add('player-season', 'players', 'Highest-scoring season', 'FPts', eligible.map(p => ({ ...playerEntry(p, p.points, seasonLabel(p.year)), id: `${p.id}:${p.year}` })));
        add('five-hundred', 'players', '500-point seasons', 'seasons', careers.map(seasons => {
            const years = seasons.filter(p => p.points >= 500).map(p => p.year);
            return playerEntry(seasons[0], years.length, yearList(years));
        }).filter(p => p.value > 0));
        add('five-hundred-run', 'players', 'Consecutive 500-point seasons', 'seasons', careers.map(seasons => {
            const run = longestRun(seasons.filter(p => p.points >= 500).map(p => p.year), calendar);
            return playerEntry(seasons[0], run.length, yearList(run));
        }).filter(p => p.value > 0));
    }
    add('cups', 'honours', 'Jagr Cups', 'cups', teams.filter(t => t.championships.length).map(t => teamEntry(t, t.championships.length, yearList(t.championships))));
    add('finals', 'honours', 'Finals appearances', 'finals', teams.filter(t => t.finals.length).map(t => teamEntry(t, t.finals.length, yearList(t.finals))));
    add('repeat-cups', 'honours', 'Consecutive championships', 'cups', teams.filter(t => t.championships.length).map(t => {
        const run = longestRun(t.championships, source.competitions);
        return teamEntry(t, run.length, yearList(run));
    }).filter(t => t.value >= 2));
    add('repeat-finals', 'honours', 'Consecutive finals', 'finals', teams.filter(t => t.finals.length).map(t => {
        const run = longestRun(t.finals, source.competitions);
        return teamEntry(t, run.length, yearList(run));
    }));
    const scoringTitles = teams.map(t => {
        const years = source.seasons.filter(s => s.team === t.ID && !source.seasons.some(other => other.year === s.year && other.team !== t.ID && other.points >= s.points)).map(s => s.year);
        return teamEntry(t, years.length, yearList(years));
    }).filter(t => t.value > 0);
    add('scoring-titles', 'honours', "Prime Minister’s Trophies", 'trophies', scoringTitles);
    for (const award of [...new Set(source.awards.map(a => a.award))]) {
        if (getAwardDefinition(award)?.id === 'teemu-selanne') continue;
        const winners = new Map<string, Award[]>();
        for (const a of source.awards.filter(a => a.award === award && (!filter.team || a.team === filter.team))) winners.set(a.player, [...(winners.get(a.player) ?? []), a]);
        add(`award-${award.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, 'honours', award, 'wins', [...winners.values()].map(wins => ({ id: wins[0].player, name: wins[0].name, value: wins.length,
            detail: yearList(wins.map(a => a.year)), team: filter.team ?? null, href: playerHref(wins[0].player) })));
    }

    const selectedFormat = filter.format ?? matchupFormats(source)[0]?.id;
    const periods = new Map(source.periods.map(p => [`${p.year}:${p.period}`, p]));
    // Entirely inactive periods cannot establish scoring records or break a streak.
    const activePeriods = new Set(source.games.filter(g => g.awayScore !== 0 || g.homeScore !== 0).map(g => `${g.year}:${g.round}`));
    const games = source.games.filter(g => activePeriods.has(`${g.year}:${g.round}`) && (!filter.team || g.away === filter.team || g.home === filter.team));
    const comparable = games.filter(g => { const p = periods.get(`${g.year}:${g.round}`); return g.stage === 'regular' && p && matchupFormat(p) === selectedFormat; });
    const sides = comparable.flatMap(g => [{ game: g, team: g.away, name: g.awayName, opponent: g.homeName, score: g.awayScore, against: g.homeScore },
        { game: g, team: g.home, name: g.homeName, opponent: g.awayName, score: g.homeScore, against: g.awayScore }]).filter(s => !filter.team || s.team === filter.team);
    const gameEntry = (s: typeof sides[number], value: number): Entry => ({ id: `${s.game.id}:${s.team}`, name: s.name, team: s.team, value,
        detail: `${s.score}–${s.against} vs ${s.opponent} · ${seasonLabel(s.game.year)} · P${s.game.round}`,
        href: `/records/game/${s.game.id}` });
    add('matchup-score', 'matchups', 'Highest matchup score', 'FPts', sides.map(s => gameEntry(s, s.score)));
    add('losing-score', 'matchups', 'Most points in a loss', 'FPts', sides.filter(s => s.game.winner !== null && s.game.winner !== s.team).map(s => gameEntry(s, s.score)));
    add('winning-margin', 'matchups', 'Largest winning margin', 'FPts', sides.filter(s => s.game.winner === s.team).map(s => gameEntry(s, round(s.score - s.against))));
    const streaks = teams.map(t => {
        let length = 0, best = 0, start: RivalryGame | undefined, end: RivalryGame | undefined, bestStart: RivalryGame | undefined;
        for (const game of games.filter(g => g.away === t.ID || g.home === t.ID).sort((a, b) => a.year - b.year || a.round - b.round)) {
            if (game.winner !== t.ID) { length = 0; start = undefined; continue; }
            if (!start) start = game;
            length++;
            if (length > best) { best = length; bestStart = start; end = game; }
        }
        return { ...teamEntry(t, best, bestStart && end ? `${seasonLabel(bestStart.year)} P${bestStart.round} → ${seasonLabel(end.year)} P${end.round}` : ''),
            href: `/compare/teams?a=${t.ID}&stage=regular` };
    });
    add('win-streak', 'teams', 'Longest winning streak', 'wins', streaks.filter(t => t.value));
    return records;
}

export function buildChases(source: RecordSource, live: LeagueSnapshot | null, stats: RosterStats | null, team?: number): Chase[] {
    if (!live) return [];
    const currentYear = live.seasonYear + 1;
    const chases: Chase[] = [];
    const add = (candidate: Omit<Chase, 'total' | 'gap' | 'target'>) => {
        const total = round(candidate.archived + candidate.current);
        const target = (Math.floor(total / candidate.step) + 1) * candidate.step;
        chases.push({ ...candidate, total, target, gap: round(target - total) });
    };
    for (const t of live.teams.filter(t => !team || t.franchiseId === team)) {
        for (const p of t.players) {
            const current = stats?.players[p.id]?.points;
            if (current == null || !Number.isFinite(current)) continue;
            const seasons = source.players.filter(s => s.id.replace(/\*/g, '') === p.id && s.year < currentYear);
            if (!seasons.length) continue;
            add({ id: `player-${p.id}`, name: p.name, team: t.franchiseId, kind: 'Career scoring', unit: 'FPts', step: 1000,
                archived: round(seasons.reduce((sum, s) => sum + s.points, 0)), current, href: playerHref(seasons[0].id) });
        }
        const seasons = source.seasons.filter(s => s.team === t.franchiseId && s.year < currentYear);
        if (!seasons.length) continue;
        if (t.points !== null && Number.isFinite(t.points)) add({ id: `team-points-${t.franchiseId}`, name: t.name, team: t.franchiseId, kind: 'Franchise scoring', unit: 'FPts', step: 5000,
            archived: round(seasons.reduce((sum, s) => sum + s.points, 0)), current: t.points, href: `/teams/${t.franchiseId}` });
        const wins = t.record?.match(/^(\d+)\s*-\s*\d+\s*-\s*\d+$/);
        if (wins) add({ id: `team-wins-${t.franchiseId}`, name: t.name, team: t.franchiseId, kind: 'Career wins', unit: 'wins', step: 50,
            archived: seasons.reduce((sum, s) => sum + s.wins, 0), current: Number(wins[1]), href: `/teams/${t.franchiseId}` });
    }
    return chases.sort((a, b) => a.gap / a.step - b.gap / b.step || a.name.localeCompare(b.name));
}
