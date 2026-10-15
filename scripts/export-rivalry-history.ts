import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { findByName, loadLeagueConfig } from './db/lib/league-config';
import { parseStandings } from './db/lib/fantrax';
import type { RivalryGame } from '../lib/rivalries/model';

// Run with node --import tsx scripts/export-rivalry-history.ts. Saved responses avoid repeat API calls.
const sources = [
    { year: 2019, leagueId: 'cbeezjr4jmmz6dgo' },
    { year: 2020, leagueId: '8zqaak59juzrzfr5' },
    { year: 2021, leagueId: 'og1gnuxxkboae8ug' },
    { year: 2022, leagueId: 'z7jzx67oku2xdvgj' },
    { year: 2023, leagueId: 'bibpb81hl8dwz8ih' },
    { year: 2024, leagueId: '9k4ujgoolm6sflk7' },
    { year: 2025, leagueId: 'ikr0y4idm0rhf8v7' },
    { year: 2026, leagueId: 'gl4i2lrcmfblkbwq' },
];
interface Side { teamId: string; teamName: string; score: number }
interface Scores { period: number; matchups: { away: Side; home: Side }[] }
interface Info {
    seasonYear: number;
    teamInfo: Record<string, { name: string }>;
    playoffs: { lastRegularSeasonPeriod: number };
    scoringPeriods: { number: number; startDate: string; endDate: string }[];
    matchups: { period: number; matchupList: { away: { id: string }; home: { id: string } }[] }[];
}
interface Raw { leagueId: string; retrievedAt: string; info: Info; periods: Scores[] }

async function request<T>(leagueId: string, method: string, extra: Record<string, string>): Promise<T> {
    const response = await fetch(`https://www.fantrax.com/fxea/general/${method}?${new URLSearchParams({ leagueId, ...extra })}`, { signal: AbortSignal.timeout(25000) });
    assert(response.ok, `Fantrax ${method}: ${response.status}`);
    const data = await response.json();
    assert(!data.error, JSON.stringify(data));
    return data;
}

async function main() {
    const config = loadLeagueConfig();
    const games: RivalryGame[] = [];
    const coverage = [];
    const standings = [];
    await mkdir('output/fantrax-history', { recursive: true });
    for (const { year, leagueId } of sources) {
        const rawPath = `output/fantrax-history/${year - 1}-${String(year).slice(2)}-raw.json`;
        let raw: Raw;
        try { raw = JSON.parse(await readFile(rawPath, 'utf8')); }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            const info = await request<Info>(leagueId, 'getLeagueInfo', { excludePlayerInfo: 'true' });
            const scheduled = info.matchups.filter(p => p.period <= info.playoffs.lastRegularSeasonPeriod);
            const periods: Scores[] = [];
            for (let i = 0; i < scheduled.length; i += 3) {
                periods.push(...await Promise.all(scheduled.slice(i, i + 3).map(p => request<Scores>(leagueId, 'getMatchupScores', { period: String(p.period) }))));
            }
            raw = { leagueId, retrievedAt: new Date().toISOString(), info, periods };
            await writeFile(rawPath, JSON.stringify(raw, null, 2));
        }
        assert.equal(raw.leagueId, leagueId);
        assert.equal(raw.info.seasonYear + 1, year);
        const cutoff = raw.info.playoffs.lastRegularSeasonPeriod;
        assert.deepEqual(raw.periods.map(p => p.period), raw.info.matchups.filter(p => p.period <= cutoff).map(p => p.period));
        const ids = new Map(Object.entries(raw.info.teamInfo).map(([id, team]) => {
            const match = findByName(config, year, team.name);
            assert(match, `${year}: unknown team ${team.name}`);
            return [id, match.franchise.id];
        }));
        assert.equal(new Set(ids.values()).size, ids.size);
        const seasonGames: RivalryGame[] = [];
        for (const period of raw.periods) {
            assert(period.period <= cutoff, 'Playoff results must never enter the regular-season snapshot');
            const schedule = raw.info.matchups.find(p => p.period === period.period)!;
            const seen = new Set<number>();
            for (const [index, matchup] of period.matchups.entries()) {
                const away = ids.get(matchup.away.teamId), home = ids.get(matchup.home.teamId);
                assert(away && home && away !== home);
                assert(!seen.has(away) && !seen.has(home));
                seen.add(away); seen.add(home);
                assert(schedule.matchupList.some(m => m.away.id === matchup.away.teamId && m.home.id === matchup.home.teamId));
                assert(Number.isFinite(matchup.away.score) && Number.isFinite(matchup.home.score));
                seasonGames.push({ id: -(year * 10000 + period.period * 100 + index), year, stage: 'regular', round: period.period, finalRound: cutoff,
                    away, home, awayName: matchup.away.teamName, homeName: matchup.home.teamName, awayScore: matchup.away.score, homeScore: matchup.home.score,
                    winner: matchup.away.score > matchup.home.score ? away : matchup.home.score > matchup.away.score ? home : null, adjusted: false, note: null });
            }
        }
        const archived = parseStandings(`data/${year - 1}-${year} Team Stats.csv`);
        assert.equal(archived.length, ids.size);
        for (const row of archived) {
            const team = findByName(config, year, row.team)?.franchise.id;
            assert(team, `Unknown archived team ${row.team}`);
            const played = seasonGames.filter(g => g.away === team || g.home === team);
            const actual = [played.filter(g => g.winner === team).length, played.filter(g => g.winner !== null && g.winner !== team).length,
                played.filter(g => g.winner === null).length, played.reduce((sum, g) => sum + Math.round((g.away === team ? g.awayScore : g.homeScore) * 100), 0)];
            assert.deepEqual(actual, [row.wins, row.losses, row.ties, Math.round(row.fptsFor * 100)], `${year}: ${row.team} differs from archived standings`);
            standings.push({ year, team, wins: row.wins, losses: row.losses, ties: row.ties, points: row.fptsFor });
        }
        games.push(...seasonGames);
        coverage.push({ year, leagueId, retrievedAt: raw.retrievedAt, games: seasonGames.length });
        console.log(`${year - 1}-${year}: ${seasonGames.length} games; all ${ids.size} teams verified`);
    }
    const metadata = JSON.stringify({ coverage, standings }, null, 2).slice(0, -2);
    await writeFile('lib/rivalries/regular-season-history.json', `${metadata},\n  "games": [\n${games.map(g => '    ' + JSON.stringify(g)).join(',\n')}\n  ]\n}\n`);
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [['Season', 'Period', 'Away', 'Away score', 'Home', 'Home score', 'Winner'], ...games.map(g => [g.year, g.round, g.awayName, g.awayScore, g.homeName, g.homeScore, g.winner === g.away ? g.awayName : g.winner === g.home ? g.homeName : 'Tie'])];
    await writeFile('output/fantrax-history/regular-season-2018-2026.csv', csv.map(row => row.map(quote).join(',')).join('\r\n'));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
