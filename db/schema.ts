import {
    boolean,
    check,
    date,
    foreignKey,
    index,
    integer,
    jsonb,
    numeric,
    pgSchema,
    primaryKey,
    serial,
    smallint,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { LotteryEntry } from '@/lib/lottery/model';
import type { KeeperPlayer, RookieReview } from '@/lib/keepers/model';
import type { TeamColours } from '@/lib/team-branding';
import type { DraftDevelopmentFacts } from '@/lib/draft/development';
import type { SavedLiveSeason } from '@/lib/fantrax/fantrax-client';
import type { AwardVoteState, PlayerAwardId, PrepareProgress, RookieAdjustments, StatLine, StatSetName } from '@/lib/award-vote/model';

// Seasons are keyed by the year they end in: 2026 is the 2025–26 season.
//
// Two kinds of tables:
//  - imported: rebuilt from the Fantrax CSVs by the season import, scripts/db/lib/season-import.ts (team_seasons standings,
//    players, player_seasons, matchups, transaction_events, transaction_assets, draft_picks)
//  - curated: hand-maintained, never overwritten by an import (franchises, owners and eras come
//    from league/league.yml; championship_rosters and awards from the admin panel / legacy seed)

// everything lives in its own "league" schema, so it can share a database with other tables
export const league = pgSchema('league');

export const fantraxSnapshots = league.table('fantrax_snapshots', {
    leagueId: text('league_id').primaryKey(),
    data: jsonb('data').$type<SavedLiveSeason>().notNull(),
});

// Current Fantrax seasons need not have been imported into the historical archive.
export const fantraxFinalWeeks = league.table('fantrax_final_weeks', {
    leagueId: text('league_id').notNull(),
    seasonYear: integer('season_year').notNull(),
    period: integer('period').notNull(),
    markedAt: timestamp('marked_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.leagueId, t.seasonYear, t.period] })]);

// Each season's Fantrax league and team IDs, loaded from league.yml by the importer. A season is
// listed here before it reaches the archive, so there is no reference to league.seasons. Names
// and logos come only from league.current_teams (ADR 0001).
export const fantraxTeams = league.table('fantrax_teams', {
    seasonYear: integer('season_year').notNull(),
    fantraxLeagueId: text('fantrax_league_id').notNull(),
    fantraxTeamId: text('fantrax_team_id').notNull(),
    franchiseId: integer('franchise_id').notNull().references(() => franchises.id),
}, (t) => [
    primaryKey({ columns: [t.seasonYear, t.fantraxTeamId] }),
    unique('fantrax_teams_one_team_per_franchise').on(t.seasonYear, t.franchiseId),
]);

// Event snapshots survive team renames and imports. Only one event is current at a time.
export const draftLotteries = league.table('draft_lotteries', {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'string' }).notNull(),
    entries: jsonb('entries').$type<LotteryEntry[]>().notNull(),
    version: integer('version').notNull().default(1),
    isCurrent: boolean('is_current').notNull().default(true),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'string' }),
    winnerId: integer('winner_id').references(() => franchises.id),
    drawnAt: timestamp('drawn_at', { withTimezone: true, mode: 'string' }),
}, (t) => [uniqueIndex('one_current_draft_lottery').on(t.isCurrent).where(sql`${t.isCurrent} = true`)]);

const fpts = (name: string) => numeric(name, { precision: 8, scale: 2, mode: 'number' });

export const seasons = league.table('seasons', {
    year: integer('year').primaryKey(),
    label: text('label').notNull(), // "2025–26"
    playoffStatus: text('playoff_status', { enum: ['complete', 'cancelled'] }).notNull(),
});

// What the season sync (lib/season-sync) last did to a season: one row per season year, written by every run that
// finds the season opened. The counts and warnings are the last successful run's; the last error is cleared by
// the next success. Once frozen_at is set the season sync leaves the season alone.
// auto_roster_franchise_id is the champion the season sync wrote an automatic championship roster for, cleared
// when the league owner saves the roster in admin, which records the champion it was saved for in
// saved_roster_franchise_id; an automatic roster is replaced only while auto_roster_franchise_id is set.
export const seasonSyncStatus = league.table('season_sync_status', {
    seasonYear: integer('season_year').primaryKey().references(() => seasons.year),
    lastRunAt: timestamp('last_run_at', { withTimezone: true, mode: 'string' }).notNull(),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true, mode: 'string' }),
    lastError: text('last_error'),
    changedPlayerSeasons: integer('changed_player_seasons').notNull().default(0),
    changedTeamSeasons: integer('changed_team_seasons').notNull().default(0),
    changedPlayoffGames: integer('changed_playoff_games').notNull().default(0),
    changedChampionshipRoster: integer('changed_championship_roster').notNull().default(0),
    changedSkaterCategories: integer('changed_skater_categories').notNull().default(0),
    changedRegularSeasonGames: integer('changed_regular_season_games').notNull().default(0),
    changedWeeks: integer('changed_weeks').notNull().default(0),
    warnings: jsonb('warnings').$type<string[]>().notNull().default([]),
    frozenAt: timestamp('frozen_at', { withTimezone: true, mode: 'string' }),
    autoRosterFranchiseId: integer('auto_roster_franchise_id').references(() => franchises.id),
    savedRosterFranchiseId: integer('saved_roster_franchise_id').references(() => franchises.id),
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

// Current owner-managed identity is separate from imported historical seasons.
export const teamManagement = league.table('team_management', {
    franchiseId: integer('franchise_id').primaryKey().references(() => franchises.id),
    name: text('name'),
    logoUrl: text('logo_url'),
    branding: jsonb('branding').$type<TeamColours>(),
    ownerUid: text('owner_uid').unique(),
    ownerEmail: text('owner_email'),
    inviteHash: text('invite_hash').unique(),
    inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
});

export const ownerRateLimits = league.table('owner_rate_limits', {
    key: text('key').primaryKey(),
    attempts: integer('attempts').notNull(),
    resetsAt: timestamp('resets_at', { withTimezone: true }).notNull(),
});

// Curated submission snapshots remain available after Fantrax roster rollover and CSV imports.
export const keeperSubmissions = league.table('keeper_submissions', {
    seasonYear: integer('season_year').notNull(),
    franchiseId: integer('franchise_id').notNull().references(() => franchises.id),
    roster: jsonb('roster').$type<KeeperPlayer[]>().notNull(),
    keptIds: jsonb('kept_ids').$type<string[]>().notNull(),
    rookieId: text('rookie_id'),
    rookieDeclared: boolean('rookie_declared').notNull().default(false),
    rookieSeason: integer('rookie_season'),
    rookieReviews: jsonb('rookie_reviews').$type<Partial<Record<string, RookieReview>>>().notNull().default({}),
    version: integer('version').notNull().default(1),
    submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    submittedBy: text('submitted_by').notNull(),
}, (t) => [primaryKey({ columns: [t.seasonYear, t.franchiseId] })]);

// Pick'em picks (GLOSSARY.md): one per season year, week, entry franchise and matchup, the matchup being its pair
// of franchises with the lower id first. Keyed by franchise, never by team season or Fantrax team ID (ADR 0005).
// A schedule change never rewrites a pick; it counts only while its pair still meets that week.
export const pickemPicks = league.table('pickem_picks', {
    seasonYear: integer('season_year').notNull(),
    week: integer('week').notNull(),
    entryFranchiseId: integer('entry_franchise_id').notNull().references(() => franchises.id),
    lowFranchiseId: integer('low_franchise_id').notNull().references(() => franchises.id),
    highFranchiseId: integer('high_franchise_id').notNull().references(() => franchises.id),
    pickedFranchiseId: integer('picked_franchise_id').notNull().references(() => franchises.id),
    savedAt: timestamp('saved_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
    primaryKey({ columns: [t.seasonYear, t.week, t.entryFranchiseId, t.lowFranchiseId, t.highFranchiseId] }),
    check('pickem_picks_matchup', sql`${t.lowFranchiseId} < ${t.highFranchiseId}
        and ${t.pickedFranchiseId} in (${t.lowFranchiseId}, ${t.highFranchiseId})`),
]);

// Pick'em's own record of each locked week (ADR 0005), written by settle once the lock has passed: the lock and
// the pairings its Pick'em picks count against, keyed by season year, week and franchise
export const pickemWeeks = league.table('pickem_weeks', {
    seasonYear: integer('season_year').notNull(),
    week: integer('week').notNull(),
    lock: timestamp('lock', { withTimezone: true, mode: 'string' }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.seasonYear, t.week] })]);

// One recorded pairing, in the live season's order. Its result is written once, when the week is frozen: the
// winning franchise, or no winner for a tie.
export const pickemPairings = league.table('pickem_pairings', {
    seasonYear: integer('season_year').notNull(),
    week: integer('week').notNull(),
    position: smallint('position').notNull(),
    awayFranchiseId: integer('away_franchise_id').notNull().references(() => franchises.id),
    homeFranchiseId: integer('home_franchise_id').notNull().references(() => franchises.id),
    winnerFranchiseId: integer('winner_franchise_id').references(() => franchises.id),
    // the two clubs' fantasy points, frozen with the result; both or neither, and only once frozen
    awayScore: fpts('away_score'),
    homeScore: fpts('home_score'),
    frozenAt: timestamp('frozen_at', { withTimezone: true, mode: 'string' }),
}, (t) => [
    primaryKey({ columns: [t.seasonYear, t.week, t.position] }),
    foreignKey({ columns: [t.seasonYear, t.week], foreignColumns: [pickemWeeks.seasonYear, pickemWeeks.week] }),
    check('pickem_pairings_matchup', sql`${t.awayFranchiseId} <> ${t.homeFranchiseId}`),
    check('pickem_pairings_result', sql`${t.winnerFranchiseId} is null
        or (${t.frozenAt} is not null and ${t.winnerFranchiseId} in (${t.awayFranchiseId}, ${t.homeFranchiseId}))`),
    check('pickem_pairings_scores', sql`(${t.awayScore} is null) = (${t.homeScore} is null) and (${t.awayScore} is null or ${t.frozenAt} is not null)`),
]);

// A season whose Pick'em is complete: settle writes it once the season's last regular-season week is frozen. It is
// stored because the live season stops describing the season once Fantrax moves on.
export const pickemCompletedSeasons = league.table('pickem_completed_seasons', {
    seasonYear: integer('season_year').primaryKey(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
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

// A player ID is stored bare (02un4), never as Fantrax's CSVs wrap it (*02un4*): docs/adr/0006-player-ids-are-stored-bare.md
export const players = league.table('players', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
}, (t) => [check('players_id_bare', sql`position('*' in ${t.id}) = 0`)]);

// A trade can contain several players/picks and involve more than two franchises.
// Stable source keys make imports repeatable; history references franchise ids, not mutable names.
export const transactionEvents = league.table('transaction_events', {
    id: text('id').primaryKey(),
    seasonYear: integer('season_year').notNull().references(() => seasons.year),
    kind: text('kind', { enum: ['trade', 'free_agent'] }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }).notNull(),
    occurredOn: date('occurred_on').notNull(),
    sourceFile: text('source_file').notNull(),
    sourceTime: text('source_time').notNull(),
}, (t) => [index('transaction_events_date').on(t.occurredAt.desc()), index('transaction_events_season_kind').on(t.seasonYear, t.kind)]);

export const transactionAssets = league.table('transaction_assets', {
    id: text('id').primaryKey(),
    eventId: text('event_id').notNull().references(() => transactionEvents.id, { onDelete: 'cascade' }),
    playerId: text('player_id').references(() => players.id), // null for traded draft picks
    label: text('label').notNull(),
    assetKind: text('asset_kind', { enum: ['player', 'pick'] }).notNull(),
    action: text('action', { enum: ['trade', 'claim', 'drop'] }).notNull(),
    fromFranchiseId: integer('from_franchise_id').references(() => franchises.id),
    toFranchiseId: integer('to_franchise_id').references(() => franchises.id),
    fromName: text('from_name'),
    toName: text('to_name'),
    sourceRow: integer('source_row').notNull(),
}, (t) => [
    index('transaction_assets_event').on(t.eventId),
    index('transaction_assets_player').on(t.playerId, t.eventId),
    index('transaction_assets_from').on(t.fromFranchiseId, t.eventId),
    index('transaction_assets_to').on(t.toFranchiseId, t.eventId),
]);

export const draftPicks = league.table('draft_picks', {
    seasonYear: integer('season_year').notNull().references(() => seasons.year),
    overall: integer('overall').notNull(),
    round: integer('round').notNull(),
    pick: integer('pick').notNull(),
    franchiseId: integer('franchise_id').references(() => franchises.id), // a few empty slots have no team in the export
    teamName: text('team_name'),
    playerId: text('player_id').references(() => players.id), // empty selections remain in the draft ledger
    playerName: text('player_name'),
    positions: text('positions').notNull(),
    draftedOn: date('drafted_on').notNull(),
    developmentFacts: jsonb('development_facts').$type<DraftDevelopmentFacts>(),
    sourceTime: text('source_time').notNull(), // the export omits AM/PM; don't invent an exact instant
    sourceFile: text('source_file').notNull(),
}, (t) => [primaryKey({ columns: [t.seasonYear, t.overall] }), index('draft_picks_player').on(t.playerId), index('draft_picks_franchise').on(t.franchiseId, t.seasonYear)]);

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
        // Skater categories (GLOSSARY.md), written by the season sync. Null when not stored here: goalies, and
        // every season before 2027, whose totals are in lib/records/player-category-history.json.
        goals: integer('goals'),
        assists: integer('assists'),
        shots: integer('shots'),
        hits: integer('hits'),
        blocks: integer('blocks'),
    },
    (t) => [
        primaryKey({ columns: [t.playerId, t.seasonYear] }),
        index('player_seasons_season_fpts').on(t.seasonYear, t.fpts.desc()),
        index('player_seasons_team_season').on(t.teamSeasonId),
    ],
);

// Playoff games, from the season import and the season sync, and regular-season games (stage 'regular', round = the
// week number, bracket 'championship' and slot its place in Fantrax's list) from the season sync, from the 2027
// season on. A game is one pairing in a season, stage and round, so the season sync updates it in place.
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
    (t) => [
        index('matchups_season').on(t.seasonYear, t.stage, t.round),
        unique('matchups_one_game_per_pairing').on(t.seasonYear, t.stage, t.round, t.awayTeamSeasonId, t.homeTeamSeasonId),
    ],
);

// Each season's Fantrax weeks with their start and end times, written by the season sync from the 2027 season on.
// Never written by the season import.
export const weeks = league.table(
    'weeks',
    {
        seasonYear: integer('season_year').notNull().references(() => seasons.year),
        week: smallint('week').notNull(),
        startsAt: timestamp('starts_at', { withTimezone: true, mode: 'string' }).notNull(),
        endsAt: timestamp('ends_at', { withTimezone: true, mode: 'string' }).notNull(),
    },
    (t) => [primaryKey({ columns: [t.seasonYear, t.week] })],
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

// ---- award votes (GLOSSARY.md, "Award vote"): written only by the award vote module (lib/award-vote); the season
// import and the season sync never touch them ----

// One award vote per season year. A rehearsal (the season before the live season) can only ever be prepared.
// prepare_progress is how far the latest prepare has got; prepared_at is set when it finishes, so a snapshot is
// readable only while prepared_at is set. rookie_adjustments are the admin's additions to and removals from the
// computed Teemu Trophy candidates, kept across re-prepares.
export const awardVotes = league.table('award_votes', {
    seasonYear: integer('season_year').primaryKey().references(() => seasons.year),
    state: text('state', { enum: ['prepared', 'open', 'scored', 'published'] }).$type<AwardVoteState>().notNull().default('prepared'),
    rehearsal: boolean('rehearsal').notNull().default(false),
    ballotLock: timestamp('ballot_lock', { withTimezone: true, mode: 'string' }),
    prepareProgress: jsonb('prepare_progress').$type<PrepareProgress>().notNull(),
    preparedAt: timestamp('prepared_at', { withTimezone: true, mode: 'string' }),
    rookieAdjustments: jsonb('rookie_adjustments').$type<RookieAdjustments>().notNull().default({ added: [], removed: [] }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
    check('award_votes_state', sql`${t.state} in ('prepared', 'open', 'scored', 'published')`),
    check('award_votes_rehearsal_prepared', sql`not ${t.rehearsal} or ${t.state} = 'prepared'`),
]);

// The frozen snapshot: every player who is a candidate for some voted award, as Fantrax named them when the vote
// was prepared. Players are not referenced, since Fantrax lists players the archive may not have.
export const awardVotePlayers = league.table('award_vote_players', {
    seasonYear: integer('season_year').notNull().references(() => awardVotes.seasonYear, { onDelete: 'cascade' }),
    playerId: text('player_id').notNull(),
    name: text('name').notNull(),
    positions: text('positions').array().notNull(),
    nhlTeam: text('nhl_team'),
    // age now by Fantrax's age column, as it was when prepared
    age: smallint('age'),
}, (t) => [primaryKey({ columns: [t.seasonYear, t.playerId] })]);

// A snapshot player's totals over one stat set (a named stretch of the season: regularSeason, playoffRounds (every
// playoff round, the Final included) or final), as a skater or goalie line.
export const awardVoteStats = league.table('award_vote_stats', {
    seasonYear: integer('season_year').notNull(),
    playerId: text('player_id').notNull(),
    statSet: text('stat_set').$type<StatSetName>().notNull(),
    line: jsonb('line').$type<StatLine>().notNull(),
}, (t) => [
    primaryKey({ columns: [t.seasonYear, t.playerId, t.statSet] }),
    foreignKey({ name: 'award_vote_stats_player', columns: [t.seasonYear, t.playerId], foreignColumns: [awardVotePlayers.seasonYear, awardVotePlayers.playerId] }).onDelete('cascade'),
]);

// A snapshot player's candidacy for one individual voted award (by its catalogue id in lib/awards.ts), with the team
// season credited with them for it, or none for a player nobody rostered.
export const awardVoteCandidates = league.table('award_vote_candidates', {
    seasonYear: integer('season_year').notNull(),
    award: text('award').$type<PlayerAwardId>().notNull(),
    playerId: text('player_id').notNull(),
    teamSeasonId: integer('team_season_id').references(() => teamSeasons.id),
}, (t) => [
    primaryKey({ columns: [t.seasonYear, t.award, t.playerId] }),
    foreignKey({ name: 'award_vote_candidates_player', columns: [t.seasonYear, t.playerId], foreignColumns: [awardVotePlayers.seasonYear, awardVotePlayers.playerId] }).onDelete('cascade'),
    check('award_vote_candidates_award', sql`${t.award} in ('wayne-gretzky', 'le-magnifique', 'bobby-orr', 'hasek', 'teemu-selanne', 'danny-briere')`),
]);

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

// ---- team identity: plain views, so owner edits show at once (SQL in the team identity migration, ADR 0001) ----

// A franchise's current identity: owner's choice, then the latest team season, then the franchise itself.
export const currentTeams = league.view('current_teams', {
    id: integer('id').notNull(),
    name: text('name').notNull(),
    abbreviation: text('abbreviation').notNull(),
    logo: text('logo'),
    defunct: boolean('defunct').notNull(),
    latestTeamSeasonId: integer('latest_team_season_id'), // for season stats and owner; null before a first season
}).existing();

// A franchise's season identity: what it was called and wore in one team season.
export const seasonTeams = league.view('season_teams', {
    teamSeasonId: integer('team_season_id').notNull(),
    franchiseId: integer('franchise_id').notNull(),
    seasonYear: integer('season_year').notNull(),
    name: text('name').notNull(),
    abbreviation: text('abbreviation').notNull(),
    logo: text('logo'),
}).existing();

// Coach's Corner episodes: screenplay scripts written in the admin (format in docs/coachs-corner.md).
// Drafts have no published_at; the public page shows published episodes, newest first.
export const coachsCornerEpisodes = league.table('coachs_corner_episodes', {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    season: integer('season'),
    week: integer('week'),
    script: text('script').notNull(),
    durationMs: integer('duration_ms').notNull(),
    players: jsonb('players').$type<import('../lib/coachs-corner/teams').StudioPlayer[]>(),
    // the team snapshot (GLOSSARY.md): the studio team list as it was at Publish; null for drafts and older episodes
    teams: jsonb('teams').$type<import('../lib/coachs-corner/teams').StudioTeam[]>(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [index('coachs_corner_published').on(t.publishedAt)]);
