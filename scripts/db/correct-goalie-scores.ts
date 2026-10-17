import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import postgres from 'postgres';
import audit from '../../league/playoff-goalie-audit.json';
import { removeExtraGoalieStarts } from './lib/goalie-scoring';
import { findByAbbreviation, loadLeagueConfig } from './lib/league-config';

// Preview by default. --apply changes only the reconstructed matchups, with a saved before-image.
async function main() {
    const apply = process.argv.includes('--apply');
    assert(process.argv.slice(2).every(arg => arg === '--apply'), 'Only --apply is supported');
    const url = process.env.DATABASE_URL_V2 ?? process.env.DATABASE_URL;
    assert(url && !url.startsWith('pglite:'), 'A Postgres connection is required');
    const config = loadLeagueConfig();
    const changes = audit.games.filter(game => game.status === 'reconstructed').map(game => {
        const teams = game.teams.map(team => {
            const result = removeExtraGoalieStarts(team.exported, team.starts, game.limit);
            assert.equal(result.score, team.reconstructed);
            if (result.score !== team.exported) {
                const override = config.scoreOverrides.find(o => o.season === game.year && o.round === game.round && findByAbbreviation(config, game.year, o.team)?.franchise.id === team.franchise);
                assert(override?.verified && override.score === result.score, 'Importer correction is missing');
            }
            return { ...team, score: result.score };
        });
        assert.equal(teams.reduce((winner, team) => winner.score > team.score ? winner : team).franchise, game.winner);
        return { ...game, teams };
    });
    const db = postgres(url, { max: 1, prepare: false });
    const before: Record<string, unknown>[] = [];
    try {
        await db.begin(async tx => {
            const plans = [];
            for (const game of changes) {
                const [a, b] = game.teams;
                const rows = await tx`select m.*, a.franchise_id as away_franchise, h.franchise_id as home_franchise, w.franchise_id as winner_franchise
                    from league.matchups m join league.team_seasons a on a.id=m.away_team_season_id
                    join league.team_seasons h on h.id=m.home_team_season_id
                    left join league.team_seasons w on w.id=m.winner_team_season_id
                    where m.season_year=${game.year} and m.round=${game.round} and m.stage='playoff' and m.bracket='championship'
                    and least(a.franchise_id,h.franchise_id)=${Math.min(a.franchise, b.franchise)}
                    and greatest(a.franchise_id,h.franchise_id)=${Math.max(a.franchise, b.franchise)} for update of m`;
                assert.equal(rows.length, 1, 'Expected one archive matchup');
                const row = rows[0];
                assert.equal(row.winner_franchise, game.winner, 'Recorded winner changed');
                const away = game.teams.find(t => t.franchise === row.away_franchise)!;
                const home = game.teams.find(t => t.franchise === row.home_franchise)!;
                const unchanged = Number(row.away_score) === away.score && Number(row.home_score) === home.score && !row.score_adjusted && row.note === null;
                if (!unchanged) {
                    assert(row.score_adjusted && row.note === 'Rescored after a later rule change; adjusted to match the real result', 'Archive note changed; review before replacing');
                    assert.equal(Number(row.away_score), away.exported, 'Unexpected exported away score');
                    assert.equal(Number(row.home_score), away.exported + 0.25, 'Unexpected placeholder home score');
                }
                before.push(row);
                plans.push({ id: row.id, year: game.year, away: away.score, home: home.score, unchanged });
            }
            console.log(JSON.stringify(plans, null, 2));
            if (!apply) return;
            await mkdir('output/fantrax-history/goalie-audit', { recursive: true });
            await writeFile(`output/fantrax-history/goalie-audit/archive-before-${Date.now()}.json`, JSON.stringify(before, null, 2));
            for (const plan of plans.filter(p => !p.unchanged)) {
                const updated = await tx`update league.matchups set away_score=${plan.away},home_score=${plan.home},score_adjusted=false,note=null where id=${plan.id} returning id`;
                assert.equal(updated.length, 1);
            }
        });
    } finally { await db.end(); }
    if (apply) {
        const site = process.env.SITE_URL, secret = process.env.REVALIDATE_SECRET;
        if (site && secret) {
            const response = await fetch(new URL('/api/revalidate', site), { method: 'POST', headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(20000) });
            assert(response.ok, `Scores saved, but cache refresh failed (${response.status})`);
            console.log('Scores saved and site cache refreshed.');
        } else console.log('Scores saved. No configured site cache refresh; development reads the new values directly.');
    }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
