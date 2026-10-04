import {
    boolean,
    index,
    integer,
    numeric,
    pgSchema,
    primaryKey,
    serial,
    smallint,
    text,
    unique,
} from 'drizzle-orm/pg-core';

// Seasons are keyed by the year they end in: 2026 is the 2025–26 season.
//
// Two kinds of tables:
//  - imported: rebuilt from the Fantrax CSVs by scripts/db/import.ts (team_seasons standings,
//    players, player_seasons, matchups)
//  - curated: hand-maintained, never overwritten by an import (franchises, owners and eras come
//    from league/league.yml; championship_rosters and awards from the admin panel / legacy seed)

// everything lives in its own "league" schema, so it can share a database with other tables
export const league = pgSchema('league');

const fpts = (name: string) => numeric(name, { precision: 8, scale: 2, mode: 'number' });

export const seasons = league.table('seasons', {
    year: integer('year').primaryKey(),
    label: text('label').notNull(), // "2025–26"
    playoffStatus: text('playoff_status', { enum: ['complete', 'cancelled'] }).notNull(),
});

export const owners = league.table('owners', {
    id: serial('id').primaryKey(),
    name: text('name').notNull().unique(),
});

export const franchises = league.table('franchises', {
    id: integer('id').primaryKey(), // matches the ids in league.yml and /teams/[id] URLs
    displayName: text('display_name').notNull(), // name of the current (or final) era
    logoUrl: text('logo_url'),
    firstSeason: integer('first_season').notNull(),
    foldedAfterSeason: integer('folded_after_season'),
});

// a franchise's identity and regular-season standings for one season
export const teamSeasons = league.table(
    'team_seasons',
    {
        id: serial('id').primaryKey(),
        seasonYear: integer('season_year').notNull().references(() => seasons.year),
        franchiseId: integer('franchise_id').notNull().references(() => franchises.id),
        ownerId: integer('owner_id').references(() => owners.id),
        name: text('name').notNull(), // display name for the era
        fantraxName: text('fantrax_name').notNull(), // spelling in that season's export
        abbreviation: text('abbreviation').notNull(),
        logoUrl: text('logo_url'),
        division: smallint('division').notNull(), // 1-based order of the standings tables
        divisionRank: smallint('division_rank').notNull(),
        wins: smallint('wins').notNull(),
        losses: smallint('losses').notNull(),
        ties: smallint('ties').notNull(),
        fptsFor: fpts('fpts_for').notNull(),
        fptsAgainst: fpts('fpts_against').notNull(),
    },
    (t) => [
        unique('team_seasons_season_franchise').on(t.seasonYear, t.franchiseId),
        unique('team_seasons_season_abbreviation').on(t.seasonYear, t.abbreviation),
    ],
);

export const players = league.table('players', {
    id: text('id').primaryKey(), // Fantrax player id, e.g. *02un4*
    name: text('name').notNull(),
});

// only seasons where the player scored or was rostered are imported
export const playerSeasons = league.table(
    'player_seasons',
    {
        playerId: text('player_id').notNull().references(() => players.id),
        seasonYear: integer('season_year').notNull().references(() => seasons.year),
        teamSeasonId: integer('team_season_id').references(() => teamSeasons.id), // null = free agent at season end
        nhlTeam: text('nhl_team'),
        positions: text('positions').array().notNull(), // ["C", "LW"]
        fpts: fpts('fpts').notNull(),
        fpg: numeric('fpg', { precision: 6, scale: 2, mode: 'number' }).notNull(),
    },
    (t) => [
        primaryKey({ columns: [t.playerId, t.seasonYear] }),
        index('player_seasons_season_fpts').on(t.seasonYear, t.fpts.desc()),
        index('player_seasons_team_season').on(t.teamSeasonId),
    ],
);

// playoff games (stage leaves room for regular-season matchups later)
export const matchups = league.table(
    'matchups',
    {
        id: serial('id').primaryKey(),
        seasonYear: integer('season_year').notNull().references(() => seasons.year),
        stage: text('stage', { enum: ['playoff', 'regular'] }).notNull(),
        round: smallint('round').notNull(),
        bracket: text('bracket', { enum: ['championship', 'consolation'] }).notNull(),
        slot: smallint('slot').notNull(), // top-to-bottom position within the round, for drawing brackets
        awayTeamSeasonId: integer('away_team_season_id').notNull().references(() => teamSeasons.id),
        homeTeamSeasonId: integer('home_team_season_id').notNull().references(() => teamSeasons.id),
        awayScore: fpts('away_score').notNull(),
        homeScore: fpts('home_score').notNull(),
        winnerTeamSeasonId: integer('winner_team_season_id').references(() => teamSeasons.id), // null on a tie
        scoreAdjusted: boolean('score_adjusted').notNull().default(false),
        note: text('note'),
    },
    (t) => [index('matchups_season').on(t.seasonYear, t.stage, t.round)],
);

// curated: everyone who gets a ring for the season, including players dropped late in the year
export const championshipRosters = league.table(
    'championship_rosters',
    {
        seasonYear: integer('season_year').notNull().references(() => seasons.year),
        playerId: text('player_id').notNull().references(() => players.id),
    },
    (t) => [primaryKey({ columns: [t.seasonYear, t.playerId] })],
);

// curated: bracket corrections made in the admin panel, re-applied by every import.
// A game is identified by season, round and its two franchises (lower id first).
export const matchupOverrides = league.table(
    'matchup_overrides',
    {
        seasonYear: integer('season_year').notNull().references(() => seasons.year),
        round: smallint('round').notNull(),
        franchiseA: integer('franchise_a').notNull().references(() => franchises.id),
        franchiseB: integer('franchise_b').notNull().references(() => franchises.id),
        winnerFranchiseId: integer('winner_franchise_id').references(() => franchises.id), // null = decided by score
        bracket: text('bracket', { enum: ['championship', 'consolation'] }), // null = as imported
        note: text('note'),
    },
    (t) => [primaryKey({ columns: [t.seasonYear, t.round, t.franchiseA, t.franchiseB] })],
);

export const awardTypes = league.table('award_types', {
    id: serial('id').primaryKey(),
    name: text('name').notNull().unique(), // e.g. "Teemu Trophy" (also the URL slug source)
    label: text('label').notNull(), // e.g. "Teemu Selanne Trophy"
    description: text('description').notNull(), // e.g. "Top Rookie"
    sortOrder: smallint('sort_order').notNull(),
});

// curated
export const awards = league.table(
    'awards',
    {
        seasonYear: integer('season_year').notNull().references(() => seasons.year),
        awardTypeId: integer('award_type_id').notNull().references(() => awardTypes.id),
        playerId: text('player_id').notNull().references(() => players.id),
        teamSeasonId: integer('team_season_id').references(() => teamSeasons.id),
    },
    (t) => [primaryKey({ columns: [t.seasonYear, t.awardTypeId, t.playerId] })],
);

// ---- derived, refreshed after every import or curated edit (SQL lives in the views migration) ----

export const playerCareers = league.materializedView('player_careers', {
    playerId: text('player_id').notNull(),
    name: text('name').notNull(),
    totalFpts: fpts('total_fpts').notNull(),
    fpg: numeric('fpg', { precision: 6, scale: 2, mode: 'number' }).notNull(),
    seasons: integer('seasons').notNull(),
    firstSeason: integer('first_season').notNull(),
    lastSeason: integer('last_season').notNull(),
    positions: text('positions').array().notNull(),
    championships: integer('championships').notNull(),
    awards: integer('awards').notNull(),
    allTimeRank: integer('all_time_rank').notNull(),
    latestTeamSeasonId: integer('latest_team_season_id'),
}).existing();

export const seasonResults = league.materializedView('season_results', {
    seasonYear: integer('season_year').notNull(),
    championTeamSeasonId: integer('champion_team_season_id'),
    runnerUpTeamSeasonId: integer('runner_up_team_season_id'),
    finalMatchupId: integer('final_matchup_id'),
}).existing();

export const franchiseRecords = league.materializedView('franchise_records', {
    franchiseId: integer('franchise_id').notNull(),
    seasons: integer('seasons').notNull(),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    ties: integer('ties').notNull(),
    fptsFor: fpts('fpts_for').notNull(),
    fptsAgainst: fpts('fpts_against').notNull(),
    championships: integer('championships').array().notNull(), // season years
    finals: integer('finals').array().notNull(), // season years reached the final (won or lost)
}).existing();
