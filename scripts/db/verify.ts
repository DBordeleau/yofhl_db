import { sql, type SQL } from 'drizzle-orm';
import { connect, type Db } from './lib/connect';
import { normalizeName } from './lib/league-config';

// Compares the new database with the live site's API, using only the seasons the live site has.
//   npm run db:verify
// Differences are listed for review rather than failing: some are intended corrections.

const LIVE_API = process.env.YOFHL_LIVE_API ?? 'https://yofhl-db.vercel.app/api';

// the champions list the old site hard-coded, for comparison with the bracket results
const legacyChampions: { year: number; team: string | null }[] = [
    { year: 2019, team: 'Hub City Hyman Hounds' },
    { year: 2020, team: null },
    { year: 2021, team: 'Hub City Hyman Hounds' },
    { year: 2022, team: 'Jagrtown Icefellas' },
    { year: 2023, team: 'Jagrtown Icefellas' },
    { year: 2024, team: 'Varrock Dark Wizards' },
    { year: 2025, team: 'Hamhung Hall Monitors' },
];
const seasonLabel = (year: number) => `${year - 1}–${String(year).slice(2)}`;
const close = (a: number, b: number) => Math.abs(a - b) < 0.006;

const live = async <T,>(path: string): Promise<T> => {
    const res = await fetch(`${LIVE_API}${path}`);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json() as Promise<T>;
};

const rows = async <T,>(db: Db, query: SQL): Promise<T[]> => {
    const result = await db.execute(query);
    return (Array.isArray(result) ? result : (result as unknown as { rows: T[] }).rows) as T[];
};

let problems = 0;
const report = (title: string, diffs: string[], checked: number) => {
    problems += diffs.length;
    console.log(`\n${diffs.length ? '✗' : '✓'} ${title} (${checked} checked${diffs.length ? `, ${diffs.length} different` : ''})`);
    diffs.slice(0, 40).forEach((d) => console.log(`    ${d}`));
    if (diffs.length > 40) console.log(`    … and ${diffs.length - 40} more`);
};

interface LivePlayer { ID: string; Player: string; FPts: number; FPG: string; Year?: number; ChampionshipsWon?: number; hasAward?: boolean; hasMultipleAwards?: boolean; Champion?: boolean }

const main = async () => {
    const { db, label, close: closeDb } = await connect();
    try {
        const [{ max }] = await rows<{ max: number }>(db, sql`select max(season_year)::int as max from league.player_seasons`);
        const liveSingle = await live<{ players: LivePlayer[]; maxPages: number }>('/stats/single-season/all?page=1');
        const liveLast = Math.max(...liveSingle.players.map((p) => p.Year ?? 0), 2025);
        const upTo = Math.min(max, liveLast);
        console.log(`Comparing ${label} with ${LIVE_API} for seasons up to ${seasonLabel(upTo)}`);

        // champions: the hard-coded list on the old site vs the bracket results
        const results = await rows<{ season_year: number; champion: string | null; status: string }>(db, sql`
            select s.year as season_year, s.playoff_status as status, t.name as champion
            from league.seasons s left join league.season_results r on r.season_year = s.year
            left join league.team_seasons t on t.id = r.champion_team_season_id
            where s.year <= ${upTo} order by s.year`);
        report('Jagr Cup champions', legacyChampions.filter((c) => c.year <= upTo).flatMap((c) => {
            const ours = results.find((r) => r.season_year === c.year);
            const expected = c.team ? normalizeName(c.team) : null;
            const got = ours?.champion ? normalizeName(ours.champion) : null;
            return expected === got ? [] : [`${seasonLabel(c.year)}: old site ${c.team ?? 'cancelled'}, new ${ours?.champion ?? ours?.status}`];
        }), legacyChampions.length);

        // all-time leaderboard, first two pages
        const liveAllTime = [
            ...(await live<{ players: LivePlayer[] }>('/stats/all-time/all?page=1')).players,
            ...(await live<{ players: LivePlayer[] }>('/stats/all-time/all?page=2')).players,
        ];
        const ourAllTime = await rows<{ player_id: string; total: number; fpg: number; cups: number }>(db, sql`
            select ps.player_id, sum(ps.fpts)::float as total, round(avg(ps.fpg), 2)::float as fpg,
                   (select count(*)::int from league.championship_rosters c where c.player_id = ps.player_id and c.season_year <= ${upTo}) as cups
            from league.player_seasons ps where ps.fpts > 0 and ps.season_year <= ${upTo}
            group by ps.player_id order by total desc limit ${liveAllTime.length}`);
        report('All-time leaderboard top 50 (order, FPts, FP/G, cups)', liveAllTime.flatMap((p, i) => {
            // players tied on points can be listed in either order
            const o = ourAllTime[i]?.player_id === p.ID ? ourAllTime[i] : ourAllTime.find((r) => r.player_id === p.ID && close(r.total, ourAllTime[i]?.total ?? NaN));
            const diffs = [];
            if (!o) diffs.push(`#${i + 1}: old ${p.Player}, new ${ourAllTime[i]?.player_id}`);
            else {
                if (!close(o.total, p.FPts)) diffs.push(`${p.Player} FPts: old ${p.FPts}, new ${o.total}`);
                if (!close(o.fpg, parseFloat(p.FPG))) diffs.push(`${p.Player} FP/G: old ${p.FPG}, new ${o.fpg}`);
                if (o.cups !== p.ChampionshipsWon) diffs.push(`${p.Player} cups: old ${p.ChampionshipsWon}, new ${o.cups}`);
            }
            return diffs;
        }), liveAllTime.length);

        // single-season leaderboard, first two pages
        const liveSeasons = [...liveSingle.players, ...(await live<{ players: LivePlayer[] }>('/stats/single-season/all?page=2')).players];
        const ourSeasons = await rows<{ player_id: string; season_year: number; fpts: number; fpg: number; awards: number; champion: boolean }>(db, sql`
            select ps.player_id, ps.season_year, ps.fpts::float as fpts, ps.fpg::float as fpg,
                   (select count(*)::int from league.awards a where a.player_id = ps.player_id and a.season_year = ps.season_year) as awards,
                   exists (select 1 from league.championship_rosters c where c.player_id = ps.player_id and c.season_year = ps.season_year) as champion
            from league.player_seasons ps where ps.fpts > 0 and ps.season_year <= ${upTo}
            order by ps.fpts desc limit ${liveSeasons.length}`);
        report('Single-season leaderboard top 50 (order, FPts, FP/G, award and ring markers)', liveSeasons.flatMap((p, i) => {
            const o = ourSeasons.find((r) => r.player_id === p.ID && r.season_year === p.Year);
            if (!o) return [`${p.Player} ${p.Year} missing`];
            const diffs = [];
            if (!close(o.fpts, p.FPts)) diffs.push(`${p.Player} ${p.Year} FPts: old ${p.FPts}, new ${o.fpts}`);
            if (!close(o.fpg, parseFloat(p.FPG))) diffs.push(`${p.Player} ${p.Year} FP/G: old ${p.FPG}, new ${o.fpg}`);
            if ((o.awards > 0) !== !!p.hasAward || (o.awards > 1) !== !!p.hasMultipleAwards) diffs.push(`${p.Player} ${p.Year} awards: new has ${o.awards}`);
            if (o.champion !== !!p.Champion) diffs.push(`${p.Player} ${p.Year} ring: old ${!!p.Champion}, new ${o.champion}`);
            return diffs;
        }), liveSeasons.length);

        // leaderboard sizes (live maxPages = rows / 25, rounded up)
        const [counts] = await rows<{ seasons: number; players: number }>(db, sql`
            select count(*)::int as seasons, count(distinct player_id)::int as players
            from league.player_seasons where fpts > 0 and season_year <= ${upTo}`);
        const liveAllTimePages = (await live<{ maxPages: number }>('/stats/all-time/all?page=1')).maxPages;
        report('Leaderboard sizes', [
            ...(Math.ceil(counts.seasons / 25) !== liveSingle.maxPages ? [`single-season pages: old ${liveSingle.maxPages}, new ${Math.ceil(counts.seasons / 25)} (${counts.seasons} rows)`] : []),
            ...(Math.ceil(counts.players / 25) !== liveAllTimePages ? [`all-time pages: old ${liveAllTimePages}, new ${Math.ceil(counts.players / 25)} (${counts.players} players)`] : []),
        ], 2);

        // franchise records
        const liveTeams = await live<{ ID: number; Team: string; Wins: number; Losses: number; FPF: number; Championships: string; Finals: string }[]>('/teams/stats');
        const ourTeams = await rows<{ franchise_id: number; wins: number; losses: number; fpf: number; titles: number[]; finals: number[] }>(db, sql`
            select f.id as franchise_id,
                   coalesce(sum(t.wins), 0)::int as wins, coalesce(sum(t.losses), 0)::int as losses, coalesce(sum(t.fpts_for), 0)::float as fpf,
                   coalesce(array_agg(t.season_year order by t.season_year) filter (where t.id = r.champion_team_season_id), '{}') as titles,
                   coalesce(array_agg(t.season_year order by t.season_year) filter (where t.id in (r.champion_team_season_id, r.runner_up_team_season_id)), '{}') as finals
            from league.franchises f
            left join league.team_seasons t on t.franchise_id = f.id and t.season_year <= ${upTo}
            left join league.season_results r on r.season_year = t.season_year
            group by f.id`);
        const years = (text: string) => (text === 'None' ? [] : text.split(',').map((s) => parseInt(s.trim().split('-')[1], 10)));
        report('Franchise records (W, L, FPF, titles, finals)', liveTeams.flatMap((t) => {
            const o = ourTeams.find((r) => r.franchise_id === t.ID);
            if (!o) return [`${t.Team} missing`];
            const diffs = [];
            if (o.wins !== t.Wins || o.losses !== t.Losses) diffs.push(`${t.Team} record: old ${t.Wins}-${t.Losses}, new ${o.wins}-${o.losses}`);
            if (!close(o.fpf, t.FPF)) diffs.push(`${t.Team} FPF: old ${t.FPF}, new ${o.fpf.toFixed(2)}`);
            if (years(t.Championships).join() !== o.titles.join()) diffs.push(`${t.Team} titles: old ${t.Championships}, new ${o.titles.map(seasonLabel).join(', ') || 'none'}`);
            if (years(t.Finals).join() !== o.finals.join()) diffs.push(`${t.Team} finals: old ${t.Finals}, new ${o.finals.map(seasonLabel).join(', ') || 'none'}`);
            return diffs;
        }), liveTeams.length);

        // season-by-season careers of the all-time top 25
        const careerDiffs: string[] = [];
        let careerRows = 0;
        for (const p of liveAllTime.slice(0, 25)) {
            const { playerStats } = await live<{ playerStats: { Year: number; FPts: number; YOFHLTeam: string; Champion: boolean }[] }>(`/player/${encodeURIComponent(p.ID)}`);
            const ours = await rows<{ season_year: number; fpts: number; abbreviation: string | null; champion: boolean }>(db, sql`
                select ps.season_year, ps.fpts::float as fpts, t.abbreviation,
                       exists (select 1 from league.championship_rosters c where c.player_id = ps.player_id and c.season_year = ps.season_year) as champion
                from league.player_seasons ps left join league.team_seasons t on t.id = ps.team_season_id
                where ps.player_id = ${p.ID} and ps.season_year <= ${upTo}`);
            for (const season of playerStats) {
                careerRows++;
                const o = ours.find((r) => r.season_year === season.Year);
                if (!o) {
                    if (season.FPts !== 0) careerDiffs.push(`${p.Player} ${season.Year}: missing`);
                    continue;
                }
                if (!close(o.fpts, season.FPts)) careerDiffs.push(`${p.Player} ${season.Year} FPts: old ${season.FPts}, new ${o.fpts}`);
                if ((o.abbreviation ?? 'FA') !== season.YOFHLTeam) careerDiffs.push(`${p.Player} ${season.Year} team: old ${season.YOFHLTeam}, new ${o.abbreviation ?? 'FA'}`);
                if (o.champion !== season.Champion) careerDiffs.push(`${p.Player} ${season.Year} ring: old ${season.Champion}, new ${o.champion}`);
            }
        }
        report('Season-by-season careers of the top 25 players', careerDiffs, careerRows);

        console.log(problems ? `\n${problems} difference(s) to review.` : '\nEverything matches the live site.');
    } finally {
        await closeDb();
    }
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
