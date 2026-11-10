import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { matchupWinner } from '@/lib/data/matchup-winner';
import { seasonLabel } from '@/lib/seasons';
import { refreshViews, type Db } from './connect';
import { prepareHistory, writeHistory } from './history';
import { enrichDraftDevelopment, type DraftFactsLoader } from './draft-development';
import { prepareFantraxTeams, writeFantraxTeams } from './fantrax-teams';
import { parsePlayerStats, parsePlayoffs, parseStandings, type PlayerStatRow, type StandingRow } from './fantrax';
import { eraFor, findByAbbreviation, findByName, suggestEra, type LeagueConfig, type TeamMatch } from './league-config';

// The season import: loads a folder of Fantrax season CSVs (and the history files beside them) into the
// database. `importSeasons` is the one call; scripts/db/import.ts runs it after migrations and prints
// what it returns. The module prints nothing and never sets an exit code.
//
// Nothing is written unless every season validates. Each season is replaced in one transaction:
// standings, player seasons and playoff games are rebuilt; championship rosters and awards are
// never touched (the legacy seeds are loaded once for seasons that have none).

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

const findSeasonFiles = (dataDir: string): Map<number, SeasonFiles> => {
    const seasons = new Map<number, SeasonFiles>();
    for (const file of readdirSync(dataDir)) {
        const m = file.match(/^(\d{4})-(\d{4}) (Player Stats|Team Stats|Playoffs)\.csv$/i);
        if (!m) continue;
        const year = parseInt(m[2], 10);
        const entry = seasons.get(year) ?? { year };
        const full = path.join(dataDir, file);
        const kind = m[3].toLowerCase();
        if (kind === 'player stats') entry.players = full;
        else if (kind === 'team stats') entry.standings = full;
        else entry.playoffs = full;
        seasons.set(year, entry);
    }
    return seasons;
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
                if (!o.verified) {
                    game.scoreAdjusted = true;
                    game.note = o.note;
                }
                applied.add(i);
            });
            // corrections made in the admin panel's bracket review
            const [low, high] = [game.awayFranchise, game.homeFranchise].sort((x, y) => x - y);
            const fix = matchupOverrides.find((o) => o.seasonYear === year && o.round === row.round && o.franchiseA === low && o.franchiseB === high);
            game.winnerFranchise = matchupWinner(
                { id: game.awayFranchise, score: game.awayScore },
                { id: game.homeFranchise, score: game.homeScore },
                fix?.winnerFranchiseId,
            );

            const inConsolation = [consolation.has(game.awayFranchise), consolation.has(game.homeFranchise)];
            if (inConsolation[0] !== inConsolation[1]) {
                fail(`round ${row.round} ${row.away} vs ${row.home} mixes a consolation team with a championship team`);
            }
            if (inConsolation[0]) game.bracket = 'consolation';

            if (fix?.bracket) game.bracket = fix.bracket;
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

export interface LegacyAward { season: number; award: string; playerId: string; player: string; team: string }
export interface LegacyRosterPlayer { playerId: string; player: string }

/** The awards and championship rosters carried over from the old site, by season year. */
export interface LegacySeeds {
    awards: LegacyAward[];
    rosters: Record<string, LegacyRosterPlayer[]>;
}

export const readLegacySeeds = (awardsFile: string, rostersFile: string): LegacySeeds => ({
    awards: (JSON.parse(readFileSync(awardsFile, 'utf8')) as { awards: LegacyAward[] }).awards,
    rosters: (JSON.parse(readFileSync(rostersFile, 'utf8')) as { rosters: Record<string, LegacyRosterPlayer[]> }).rosters,
});

// one-time carry-over of the awards and rings already on the old site; skipped for any season
// that already has awards / a roster, so edits made later in the admin panel are never undone
const seedLegacy = async (db: Db, config: LeagueConfig, legacy: LegacySeeds, years: Set<number>) => {
    const notes: string[] = [];
    const { awards: legacyAwards, rosters } = legacy;
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

export interface SeasonImportInput {
    /** A database already migrated: saved bracket corrections are read from it during validation. */
    db: Db;
    config: LeagueConfig;
    /** The folder holding the season CSVs, with transactions/ and drafts/ inside it. */
    dataDir: string;
    /** Season years to import; empty imports every season found in `dataDir`. */
    seasons: number[];
    legacy: LegacySeeds;
    /** Looks up a draft pick's NHL facts. Defaults to the NHL's public API; tests pass a stand-in. */
    loadDraftFacts?: DraftFactsLoader;
}

export type SeasonImportResult =
    /** Every validation problem, de-duplicated. Nothing was written. */
    | { ok: false; errors: string[] }
    /** Each imported season and how many player seasons it kept, in import order, plus the legacy award notes. */
    | { ok: true; seasons: { year: number; players: number }[]; legacyNotes: string[] };

export const importSeasons = async ({ db, config, dataDir, seasons, legacy, loadDraftFacts }: SeasonImportInput): Promise<SeasonImportResult> => {
    const available = findSeasonFiles(dataDir);
    const years = seasons.length ? seasons : Array.from(available.keys()).sort();
    if (!years.length) throw new Error(`No Fantrax CSVs found in ${dataDir}/`);
    const history = prepareHistory(dataDir, config, years);

    // the admin panel's bracket corrections are validated with the CSVs
    const matchupOverrides = await db.select().from(schema.matchupOverrides);

    // validate everything before writing any league data
    const errors: string[] = [];
    const prepared: PreparedSeason[] = [];
    for (const year of years) {
        const files = available.get(year);
        if (!files) {
            errors.push(`${seasonLabel(year)}: no CSVs in ${dataDir}/ for this season`);
            continue;
        }
        const season = prepareSeason(config, files, errors, matchupOverrides);
        if (season) prepared.push(season);
    }
    // every season's Fantrax IDs, including a live season with no CSVs yet
    const fantraxTeams = prepareFantraxTeams(config);
    errors.push(...fantraxTeams.errors);
    if (errors.length) return { ok: false, errors: Array.from(new Set(errors)) };

    await enrichDraftDevelopment(db, history.picks, loadDraftFacts);
    await writeLeague(db, config);
    await writeFantraxTeams(db, fantraxTeams.rows);

    // players on a ring or award list must survive even with 0 points as a free agent
    const keep = new Set<string>();
    legacy.awards.forEach((a) => keep.add(`${a.season}:${a.playerId}`));
    Object.entries(legacy.rosters).forEach(([y, roster]) => roster.forEach((p) => keep.add(`${y}:${p.playerId}`)));
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

    const imported: { year: number; players: number }[] = [];
    for (const season of prepared) imported.push({ year: season.year, players: await writeSeason(db, config, season, keep) });

    const legacyNotes = await seedLegacy(db, config, legacy, new Set(prepared.map((s) => s.year)));
    await writeHistory(db, history);
    await refreshViews(db);

    return { ok: true, seasons: imported, legacyNotes };
};
