import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { connect, refreshViews, type Db } from './lib/connect';
import { parsePlayerStats, parsePlayoffs, parseStandings, type PlayerStatRow, type StandingRow } from './lib/fantrax';
import {
    eraFor,
    findByAbbreviation,
    findByName,
    loadLeagueConfig,
    suggestEra,
    type LeagueConfig,
    type TeamMatch,
} from './lib/league-config';

// Loads Fantrax CSVs from data/ into the database.
//
//   npm run db:import            every season found in data/
//   npm run db:import -- 2026    just the 2025–26 season (also accepts 2025-2026 or 2025-26)
//
// Nothing is written unless every season validates. Each season is replaced in one transaction:
// standings, player seasons and playoff games are rebuilt; championship rosters and awards are
// never touched (the legacy snapshot in league/seed is loaded once for seasons that have none).

const DATA_DIR = process.env.YOFHL_DATA_DIR ?? 'data';
const LEGACY_AWARDS = 'league/seed/legacy-awards.json';
const LEGACY_ROSTERS = 'league/seed/legacy-championship-rosters.json';

const seasonLabel = (year: number) => `${year - 1}–${String(year).slice(2)}`;

interface SeasonFiles {
    year: number;
    players?: string;
    standings?: string;
    playoffs?: string;
}

interface PreparedTeam extends StandingRow {
    match: TeamMatch;
    abbreviation: string;
}

interface PreparedGame {
    round: number;
    bracket: 'championship' | 'consolation';
    slot: number;
    awayFranchise: number;
    homeFranchise: number;
    awayScore: number;
    homeScore: number;
    winnerFranchise: number | null;
    scoreAdjusted: boolean;
    note: string | null;
}

interface PreparedSeason {
    year: number;
    playoffStatus: 'complete' | 'cancelled';
    teams: PreparedTeam[];
    players: (PlayerStatRow & { franchiseId: number | null })[];
    games: PreparedGame[];
}

const findSeasonFiles = (): Map<number, SeasonFiles> => {
    const seasons = new Map<number, SeasonFiles>();
    for (const file of readdirSync(DATA_DIR)) {
        const m = file.match(/^(\d{4})-(\d{4}) (Player Stats|Team Stats|Playoffs)\.csv$/i);
        if (!m) continue;
        const year = parseInt(m[2], 10);
        const entry = seasons.get(year) ?? { year };
        const full = path.join(DATA_DIR, file);
        const kind = m[3].toLowerCase();
        if (kind === 'player stats') entry.players = full;
        else if (kind === 'team stats') entry.standings = full;
        else entry.playoffs = full;
        seasons.set(year, entry);
    }
    return seasons;
};

const parseSeasonArg = (arg: string) => {
    const m = arg.match(/^(?:\d{4}-)?(\d{2}|\d{4})$/);
    if (!m) throw new Error(`Don't understand season "${arg}". Use the end year, e.g. 2026 or 2025-26.`);
    return m[1].length === 2 ? 2000 + parseInt(m[1], 10) : parseInt(m[1], 10);
};

// order each round's games so a bracket can be drawn: a game sits next to the games that fed it
const assignSlots = (games: PreparedGame[]) => {
    for (const bracket of ['championship', 'consolation'] as const) {
        const rounds = Array.from(new Set(games.filter((g) => g.bracket === bracket).map((g) => g.round))).sort((a, b) => b - a);
        rounds.forEach((round, i) => {
            const inRound = games.filter((g) => g.bracket === bracket && g.round === round);
            if (i === 0) {
                inRound.forEach((g, slot) => (g.slot = slot));
                return;
            }
            const next = games
                .filter((g) => g.bracket === bracket && g.round === rounds[i - 1])
                .sort((a, b) => a.slot - b.slot);
            const ordered: PreparedGame[] = [];
            for (const later of next) {
                for (const team of [later.awayFranchise, later.homeFranchise]) {
                    const feeder = inRound.find((g) => !ordered.includes(g) && (g.awayFranchise === team || g.homeFranchise === team));
                    if (feeder) ordered.push(feeder);
                }
            }
            inRound.filter((g) => !ordered.includes(g)).forEach((g) => ordered.push(g));
            ordered.forEach((g, slot) => (g.slot = slot));
        });
    }
};

type MatchupOverride = typeof schema.matchupOverrides.$inferSelect;

const prepareSeason = (config: LeagueConfig, files: SeasonFiles, errors: string[], matchupOverrides: MatchupOverride[]): PreparedSeason | null => {
    const { year } = files;
    const label = seasonLabel(year);
    const fail = (message: string) => errors.push(`${label}: ${message}`);
    const settings = config.seasons[year] ?? {};
    const cancelled = settings.playoffs === 'cancelled';

    if (!files.players) fail(`missing "${year - 1}-${year} Player Stats.csv"`);
    if (!files.standings) fail(`missing "${year - 1}-${year} Team Stats.csv"`);
    if (!files.playoffs && !cancelled) fail(`missing "${year - 1}-${year} Playoffs.csv" (mark the season "playoffs: cancelled" in league.yml if there were none)`);
    if (!files.players || !files.standings) return null;

    const unknownName = (name: string) => {
        const guess = suggestEra(config, name);
        const hint = guess ? ` Closest match: "${guess.era.name}" (franchise ${guess.franchise.id}).` : '';
        return `team "${name}" doesn't match any franchise era in league.yml for this season.${hint} Add it as a new era or an alias.`;
    };

    // standings define who played this season
    const players = parsePlayerStats(files.players);
    const teams: PreparedTeam[] = [];
    for (const row of parseStandings(files.standings)) {
        const match = findByName(config, year, row.team);
        if (!match) {
            fail(unknownName(row.team));
            continue;
        }
        if (teams.some((t) => t.match.franchise.id === match.franchise.id)) {
            fail(`"${row.team}" and another team both map to franchise ${match.franchise.id}`);
            continue;
        }
        // the abbreviation Fantrax actually used this season, from the player rosters
        const used = new Set(players.map((p) => p.fantasyTeam).filter((a): a is string => !!a && match.era.abbreviations.includes(a)));
        teams.push({ ...row, match, abbreviation: Array.from(used)[0] ?? match.era.abbreviations[0] });
    }
    for (const franchise of config.franchises) {
        if (eraFor(franchise, year) && !teams.some((t) => t.match.franchise.id === franchise.id)) {
            fail(`league.yml says franchise ${franchise.id} (${eraFor(franchise, year)!.name}) played this season, but it isn't in the standings. Close the era with "to: ${year - 1}" or set "folded".`);
        }
    }
    const franchiseFor = (abbreviation: string) => {
        const match = findByAbbreviation(config, year, abbreviation);
        return match && teams.some((t) => t.match.franchise.id === match.franchise.id) ? match.franchise.id : null;
    };

    const unknownAbbreviations = new Set<string>();
    const preparedPlayers = players.map((p) => {
        const franchiseId = p.fantasyTeam ? franchiseFor(p.fantasyTeam) : null;
        if (p.fantasyTeam && franchiseId === null) unknownAbbreviations.add(p.fantasyTeam);
        return { ...p, franchiseId };
    });
    unknownAbbreviations.forEach((a) => fail(`fantasy team abbreviation "${a}" isn't listed in any franchise era for this season in league.yml`));

    // playoffs
    const games: PreparedGame[] = [];
    if (files.playoffs && !cancelled) {
        const consolation = new Set((settings.consolation ?? []).map((a) => {
            const id = franchiseFor(a);
            if (id === null) fail(`consolation team "${a}" in league.yml isn't a team this season`);
            return id;
        }));
        const overrides = config.scoreOverrides.filter((o) => o.season === year);
        const applied = new Set<number>();

        for (const row of parsePlayoffs(files.playoffs)) {
            const away = findByName(config, year, row.away);
            const home = findByName(config, year, row.home);
            if (!away) fail(unknownName(row.away));
            if (!home) fail(unknownName(row.home));
            if (!away || !home) continue;

            const game: PreparedGame = {
                round: row.round,
                bracket: 'championship',
                slot: 0,
                awayFranchise: away.franchise.id,
                homeFranchise: home.franchise.id,
                awayScore: row.awayScore,
                homeScore: row.homeScore,
                winnerFranchise: null,
                scoreAdjusted: false,
                note: null,
            };
            overrides.forEach((o, i) => {
                if (o.round !== row.round) return;
                const team = franchiseFor(o.team);
                if (team === game.awayFranchise) game.awayScore = o.score;
                else if (team === game.homeFranchise) game.homeScore = o.score;
                else return;
                game.scoreAdjusted = true;
                game.note = o.note;
                applied.add(i);
            });
            game.winnerFranchise =
                game.awayScore > game.homeScore ? game.awayFranchise : game.homeScore > game.awayScore ? game.homeFranchise : null;

            const inConsolation = [consolation.has(game.awayFranchise), consolation.has(game.homeFranchise)];
            if (inConsolation[0] !== inConsolation[1]) {
                fail(`round ${row.round} ${row.away} vs ${row.home} mixes a consolation team with a championship team`);
            }
            if (inConsolation[0]) game.bracket = 'consolation';

            // corrections made in the admin panel's bracket review
            const [low, high] = [game.awayFranchise, game.homeFranchise].sort((x, y) => x - y);
            const fix = matchupOverrides.find((o) => o.seasonYear === year && o.round === row.round && o.franchiseA === low && o.franchiseB === high);
            if (fix?.bracket) game.bracket = fix.bracket;
            if (fix?.winnerFranchiseId) game.winnerFranchise = fix.winnerFranchiseId;
            // the admin note itself stays in matchup_overrides and is shown alongside the game's note
            games.push(game);
        }
        overrides.forEach((o, i) => {
            if (!applied.has(i)) fail(`score override for ${o.team} in round ${o.round} didn't match any playoff game`);
        });

        // every team in a later round must have won its game in the round before
        const teamName = (id: number) => teams.find((t) => t.match.franchise.id === id)?.match.era.name ?? `franchise ${id}`;
        for (const game of games) {
            const previous = games.filter((g) => g.round === game.round - 1 && g.bracket === game.bracket);
            for (const team of [game.awayFranchise, game.homeFranchise]) {
                const earlier = previous.find((g) => g.awayFranchise === team || g.homeFranchise === team);
                if (earlier && earlier.winnerFranchise !== team) {
                    fail(`${teamName(team)} plays in round ${game.round} but lost round ${game.round - 1} on the exported scores. Add a scoreOverrides entry in league.yml if the result stood.`);
                }
            }
        }
        assignSlots(games);
    }

    return {
        year,
        playoffStatus: cancelled ? 'cancelled' : 'complete',
        teams,
        players: preparedPlayers,
        games,
    };
};

const chunk = <T,>(items: T[], size: number) =>
    Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

const writeLeague = async (db: Db, config: LeagueConfig) => {
    const ownerNames = Array.from(new Set(config.franchises.flatMap((f) => f.eras.map((e) => e.owner)).filter((o): o is string => !!o)));
    if (ownerNames.length) {
        await db.insert(schema.owners).values(ownerNames.map((name) => ({ name }))).onConflictDoNothing();
    }
    for (const franchise of config.franchises) {
        const latest = franchise.eras[franchise.eras.length - 1];
        const values = {
            id: franchise.id,
            displayName: latest.name,
            logoUrl: latest.logo ?? null,
            firstSeason: franchise.eras[0].from,
            foldedAfterSeason: franchise.folded ?? null,
        };
        await db.insert(schema.franchises).values(values).onConflictDoUpdate({ target: schema.franchises.id, set: values });
    }
    for (const [i, award] of config.awards.entries()) {
        const values = { name: award.name, label: award.label ?? award.name, description: award.description, sortOrder: i };
        await db.insert(schema.awardTypes).values(values).onConflictDoUpdate({ target: schema.awardTypes.name, set: values });
    }
};

const writeSeason = async (db: Db, config: LeagueConfig, season: PreparedSeason, keep: Set<string>) => {
    const ownerIds = new Map((await db.select().from(schema.owners)).map((o) => [o.name, o.id]));

    await db.transaction(async (tx) => {
        const seasonValues = { year: season.year, label: seasonLabel(season.year), playoffStatus: season.playoffStatus };
        await tx.insert(schema.seasons).values(seasonValues).onConflictDoUpdate({ target: schema.seasons.year, set: seasonValues });

        // team_seasons keep their ids across re-imports because awards point at them
        const teamSeasonIds = new Map<number, number>();
        for (const team of season.teams) {
            const values = {
                seasonYear: season.year,
                franchiseId: team.match.franchise.id,
                ownerId: team.match.era.owner ? ownerIds.get(team.match.era.owner) ?? null : null,
                name: team.match.era.name,
                fantraxName: team.team,
                abbreviation: team.abbreviation,
                logoUrl: team.match.era.logo ?? null,
                division: team.division,
                divisionRank: team.divisionRank,
                wins: team.wins,
                losses: team.losses,
                ties: team.ties,
                fptsFor: team.fptsFor,
                fptsAgainst: team.fptsAgainst,
            };
            const [row] = await tx
                .insert(schema.teamSeasons)
                .values(values)
                .onConflictDoUpdate({ target: [schema.teamSeasons.seasonYear, schema.teamSeasons.franchiseId], set: values })
                .returning({ id: schema.teamSeasons.id });
            teamSeasonIds.set(team.match.franchise.id, row.id);
        }

        // only seasons where the player scored, was rostered, or is on a ring/award list are kept
        const kept = season.players.filter((p) => p.fpts !== 0 || p.franchiseId !== null || keep.has(`${season.year}:${p.id}`));
        for (const batch of chunk(kept, 1000)) {
            await tx
                .insert(schema.players)
                .values(batch.map((p) => ({ id: p.id, name: p.name })))
                .onConflictDoUpdate({ target: schema.players.id, set: { name: sql`excluded.name` } });
        }
        await tx.delete(schema.playerSeasons).where(eq(schema.playerSeasons.seasonYear, season.year));
        for (const batch of chunk(kept, 1000)) {
            await tx.insert(schema.playerSeasons).values(
                batch.map((p) => ({
                    playerId: p.id,
                    seasonYear: season.year,
                    teamSeasonId: p.franchiseId === null ? null : teamSeasonIds.get(p.franchiseId)!,
                    nhlTeam: p.nhlTeam,
                    positions: p.positions,
                    fpts: p.fpts,
                    fpg: p.fpg,
                })),
            );
        }

        await tx.delete(schema.matchups).where(eq(schema.matchups.seasonYear, season.year));
        if (season.games.length) {
            await tx.insert(schema.matchups).values(
                season.games.map((g) => ({
                    seasonYear: season.year,
                    stage: 'playoff' as const,
                    round: g.round,
                    bracket: g.bracket,
                    slot: g.slot,
                    awayTeamSeasonId: teamSeasonIds.get(g.awayFranchise)!,
                    homeTeamSeasonId: teamSeasonIds.get(g.homeFranchise)!,
                    awayScore: g.awayScore,
                    homeScore: g.homeScore,
                    winnerTeamSeasonId: g.winnerFranchise === null ? null : teamSeasonIds.get(g.winnerFranchise)!,
                    scoreAdjusted: g.scoreAdjusted,
                    note: g.note,
                })),
            );
        }
    });

    return season.players.filter((p) => p.fpts !== 0 || p.franchiseId !== null || keep.has(`${season.year}:${p.id}`)).length;
};

interface LegacyAward { season: number; award: string; playerId: string; player: string; team: string }
interface LegacyRosterPlayer { playerId: string; player: string }

// one-time carry-over of the awards and rings already on the old site; skipped for any season
// that already has awards / a roster, so edits made later in the admin panel are never undone
const seedLegacy = async (db: Db, config: LeagueConfig, years: Set<number>) => {
    const notes: string[] = [];
    const { awards: legacyAwards } = JSON.parse(readFileSync(LEGACY_AWARDS, 'utf8')) as { awards: LegacyAward[] };
    const { rosters } = JSON.parse(readFileSync(LEGACY_ROSTERS, 'utf8')) as { rosters: Record<string, LegacyRosterPlayer[]> };
    const awardTypeIds = new Map((await db.select().from(schema.awardTypes)).map((a) => [a.name, a.id]));

    for (const year of Array.from(years).sort()) {
        const seasonAwards = legacyAwards.filter((a) => a.season === year);
        const existingAwards = await db.select().from(schema.awards).where(eq(schema.awards.seasonYear, year)).limit(1);
        if (seasonAwards.length && !existingAwards.length) {
            const rows = [];
            for (const award of seasonAwards) {
                const [ps] = await db
                    .select({ teamSeasonId: schema.playerSeasons.teamSeasonId, name: schema.teamSeasons.name })
                    .from(schema.playerSeasons)
                    .leftJoin(schema.teamSeasons, eq(schema.teamSeasons.id, schema.playerSeasons.teamSeasonId))
                    .where(sql`${schema.playerSeasons.playerId} = ${award.playerId} and ${schema.playerSeasons.seasonYear} = ${year}`);
                let teamSeasonId = ps?.teamSeasonId ?? null;
                // the old site stored the winner's team as typed text; trust the player's actual team, fall back to the text
                const typed = findByName(config, year, award.team);
                if (teamSeasonId === null && typed) {
                    const [ts] = await db
                        .select({ id: schema.teamSeasons.id })
                        .from(schema.teamSeasons)
                        .where(sql`${schema.teamSeasons.seasonYear} = ${year} and ${schema.teamSeasons.franchiseId} = ${typed.franchise.id}`);
                    teamSeasonId = ts?.id ?? null;
                }
                if (ps?.name && ps.name !== typed?.era.name) {
                    notes.push(`${seasonLabel(year)} ${award.award} (${award.player}): old site said "${award.team}", linked to ${ps.name}, his team at season end`);
                }
                const awardTypeId = awardTypeIds.get(award.award);
                if (!awardTypeId) throw new Error(`Legacy award "${award.award}" isn't in league.yml awards`);
                rows.push({ seasonYear: year, awardTypeId, playerId: award.playerId, teamSeasonId });
            }
            await db.insert(schema.awards).values(rows);
        }

        const roster = rosters[String(year)] ?? [];
        const existingRoster = await db.select().from(schema.championshipRosters).where(eq(schema.championshipRosters.seasonYear, year)).limit(1);
        if (roster.length && !existingRoster.length) {
            await db.insert(schema.championshipRosters).values(roster.map((p) => ({ seasonYear: year, playerId: p.playerId })));
        }
    }
    return notes;
};

const main = async () => {
    const config = loadLeagueConfig();
    const available = findSeasonFiles();
    const requested = process.argv.slice(2).map(parseSeasonArg);
    const years = requested.length ? requested : Array.from(available.keys()).sort();
    if (!years.length) throw new Error(`No Fantrax CSVs found in ${DATA_DIR}/`);

    const { db, label, migrate, close } = await connect();
    try {
        // schema first, so the admin panel's bracket corrections can be read and validated with the CSVs
        await migrate();
        const matchupOverrides = await db.select().from(schema.matchupOverrides);

        // validate everything before writing any league data
        const errors: string[] = [];
        const prepared: PreparedSeason[] = [];
        for (const year of years) {
            const files = available.get(year);
            if (!files) {
                errors.push(`${seasonLabel(year)}: no CSVs in ${DATA_DIR}/ for this season`);
                continue;
            }
            const season = prepareSeason(config, files, errors, matchupOverrides);
            if (season) prepared.push(season);
        }
        if (errors.length) {
            const unique = Array.from(new Set(errors));
            console.error(`Import stopped, nothing was written. Fix these and run it again:\n\n${unique.map((e) => `  • ${e}`).join('\n')}\n`);
            process.exitCode = 1;
            return;
        }

        console.log(`Importing ${years.map(seasonLabel).join(', ')} into ${label}`);
        await writeLeague(db, config);

        // players on a ring or award list must survive even with 0 points as a free agent
        const keep = new Set<string>();
        const legacyAwards = JSON.parse(readFileSync(LEGACY_AWARDS, 'utf8')).awards as LegacyAward[];
        const legacyRosters = JSON.parse(readFileSync(LEGACY_ROSTERS, 'utf8')).rosters as Record<string, LegacyRosterPlayer[]>;
        legacyAwards.forEach((a) => keep.add(`${a.season}:${a.playerId}`));
        Object.entries(legacyRosters).forEach(([y, roster]) => roster.forEach((p) => keep.add(`${y}:${p.playerId}`)));
        const curated = [
            ...(await db.select({ y: schema.championshipRosters.seasonYear, p: schema.championshipRosters.playerId }).from(schema.championshipRosters).where(inArray(schema.championshipRosters.seasonYear, years))),
            ...(await db.select({ y: schema.awards.seasonYear, p: schema.awards.playerId }).from(schema.awards).where(inArray(schema.awards.seasonYear, years))),
        ];
        curated.forEach((r) => keep.add(`${r.y}:${r.p}`));

        const missing = Array.from(keep).filter((key) => {
            const [y, id] = key.split(':');
            const season = prepared.find((s) => s.year === parseInt(y, 10));
            return season && !season.players.some((p) => p.id === id);
        });
        if (missing.length) throw new Error(`These ring/award players aren't in their season's Player Stats CSV: ${missing.join(', ')}`);

        const rows: Record<number, number> = {};
        for (const season of prepared) rows[season.year] = await writeSeason(db, config, season, keep);

        const notes = await seedLegacy(db, config, new Set(prepared.map((s) => s.year)));
        await refreshViews(db);

        const summary = await db.execute<{
            season_year: number; label: string; playoff_status: string; teams: number; games: number; champion: string | null; ring: number; awards: number;
        }>(sql`
            select s.year as season_year, s.label, s.playoff_status,
                   (select count(*)::int from league.team_seasons t where t.season_year = s.year) as teams,
                   (select count(*)::int from league.matchups m where m.season_year = s.year) as games,
                   (select t.name from league.team_seasons t where t.id = r.champion_team_season_id) as champion,
                   (select count(*)::int from league.championship_rosters c where c.season_year = s.year) as ring,
                   (select count(*)::int from league.awards a where a.season_year = s.year) as awards
            from league.seasons s left join league.season_results r on r.season_year = s.year
            order by s.year`);
        const summaryRows = (Array.isArray(summary) ? summary : (summary as unknown as { rows: typeof summary }).rows) as unknown as {
            season_year: number; label: string; playoff_status: string; teams: number; games: number; champion: string | null; ring: number; awards: number;
        }[];

        console.log('\nseason   teams  players  playoff games  champion                  ring  awards');
        for (const r of summaryRows) {
            const champion = r.playoff_status === 'cancelled' ? '(playoffs cancelled)' : r.champion ?? '—';
            console.log(
                `${r.label.padEnd(8)} ${String(r.teams).padStart(5)}  ${String(rows[r.season_year] ?? '').padStart(7)}  ${String(r.games).padStart(13)}  ${champion.padEnd(24)}  ${String(r.ring).padStart(4)}  ${String(r.awards).padStart(6)}`,
            );
        }
        const needsRing = summaryRows.filter((r) => r.playoff_status === 'complete' && r.ring === 0).map((r) => r.label);
        if (needsRing.length) console.log(`\nNo championship roster yet for ${needsRing.join(', ')}: set it in the admin panel.`);
        if (notes.length) console.log(`\nLegacy award notes:\n${notes.map((n) => `  • ${n}`).join('\n')}`);

        // tell the site to drop its cached pages so the new data shows up
        const site = process.env.SITE_URL;
        const secret = process.env.REVALIDATE_SECRET;
        if (site && secret) {
            const res = await fetch(new URL('/api/revalidate', site), { method: 'POST', headers: { authorization: `Bearer ${secret}` } });
            console.log(res.ok ? `\nCleared the site cache at ${site}.` : `\nCouldn't clear the site cache at ${site} (${res.status}). Redeploy or POST /api/revalidate to show the new data.`);
        } else {
            console.log("\nSet SITE_URL and REVALIDATE_SECRET to clear the live site's cache automatically after an import.");
        }
    } finally {
        await close();
    }
};

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
