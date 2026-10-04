'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import * as schema from '@/db/schema';
import { checkCredentials, endSession, requireAdmin, startSession } from '@/lib/admin/auth';
import { searchSeasonPlayers } from '@/lib/admin/data';
import { getDb, LEAGUE_TAG, rows } from '@/lib/data/db';

// after any curated edit: recompute the derived views and drop every cached public page
const afterWrite = async () => {
    const db = getDb();
    await db.execute(sql`REFRESH MATERIALIZED VIEW league.season_results`);
    await db.execute(sql`REFRESH MATERIALIZED VIEW league.player_careers`);
    await db.execute(sql`REFRESH MATERIALIZED VIEW league.franchise_records`);
    revalidateTag(LEAGUE_TAG);
    revalidatePath('/admin', 'layout');
};

const assertSeason = async (year: number) => {
    const [season] = await rows<{ playoff_status: string }>(sql`select playoff_status from league.seasons where year = ${year}`);
    if (!season) throw new Error(`There's no ${year} season.`);
    return season;
};

export async function login(formData: FormData): Promise<{ error: string } | void> {
    const username = String(formData.get('username') ?? '');
    const password = String(formData.get('password') ?? '');
    const next = String(formData.get('next') ?? '/admin');
    if (!checkCredentials(username, password)) {
        // slow down guessing
        await new Promise((resolve) => setTimeout(resolve, 800));
        return { error: 'That username and password combination is incorrect.' };
    }
    await startSession();
    redirect(next.startsWith('/admin') ? next : '/admin');
}

export async function logout() {
    await endSession();
    redirect('/admin');
}

export async function findSeasonPlayers(year: number, q: string) {
    await requireAdmin();
    return searchSeasonPlayers(year, String(q).slice(0, 60));
}

// replaces the season's championship roster with exactly these players
export async function saveRoster(year: number, playerIds: string[]) {
    await requireAdmin();
    const season = await assertSeason(year);
    if (season.playoff_status !== 'complete') throw new Error('This season has no playoffs, so it has no championship roster.');

    const ids = Array.from(new Set(playerIds.map(String)));
    if (ids.length) {
        const found = await rows<{ id: string }>(sql`select id from league.players where id in ${ids}`);
        if (found.length !== ids.length) throw new Error('Some of those players are not in the database.');
    }
    const db = getDb();
    const deleteOld = db.delete(schema.championshipRosters).where(eq(schema.championshipRosters.seasonYear, year));
    if (ids.length) {
        await db.batch([deleteOld, db.insert(schema.championshipRosters).values(ids.map((playerId) => ({ seasonYear: year, playerId })))]);
    } else {
        await deleteOld;
    }
    await afterWrite();
    return { saved: ids.length };
}

// one winner per award; a null player clears the award for the season
export async function saveAwards(year: number, picks: { award: string; playerId: string | null }[]) {
    await requireAdmin();
    await assertSeason(year);
    const db = getDb();
    const types = await db.select().from(schema.awardTypes).where(inArray(schema.awardTypes.name, picks.map((p) => p.award)));

    const winners = picks.filter((p) => p.playerId).map((p) => String(p.playerId));
    const teams = winners.length
        ? await rows<{ player_id: string; team_season_id: number | null }>(sql`
            select player_id, team_season_id from league.player_seasons where season_year = ${year} and player_id in ${winners}`)
        : [];

    const statements = [];
    for (const pick of picks) {
        const type = types.find((t) => t.name === pick.award);
        if (!type) throw new Error(`Unknown award "${pick.award}".`);
        statements.push(db.delete(schema.awards).where(and(eq(schema.awards.seasonYear, year), eq(schema.awards.awardTypeId, type.id))));
        if (pick.playerId) {
            const team = teams.find((t) => t.player_id === pick.playerId);
            if (!team) throw new Error(`${pick.award}: that player has no stats in this season.`);
            statements.push(db.insert(schema.awards).values({ seasonYear: year, awardTypeId: type.id, playerId: String(pick.playerId), teamSeasonId: team.team_season_id }));
        }
    }
    if (statements.length) await db.batch(statements as [typeof statements[number], ...typeof statements]);
    await afterWrite();
    return { saved: winners.length };
}

// winner: 'score' follows the score, or a franchise id to override it; an empty note with 'score' removes the correction
export async function saveMatchup(year: number, matchupId: number, winner: 'score' | number, note: string) {
    await requireAdmin();
    const [game] = await rows<{ round: number; a_ts: number; a_f: number; a_score: number; h_ts: number; h_f: number; h_score: number }>(sql`
        select m.round, a.id as a_ts, a.franchise_id as a_f, m.away_score::float8 as a_score,
               h.id as h_ts, h.franchise_id as h_f, m.home_score::float8 as h_score
        from league.matchups m
        join league.team_seasons a on a.id = m.away_team_season_id
        join league.team_seasons h on h.id = m.home_team_season_id
        where m.id = ${matchupId} and m.season_year = ${year}`);
    if (!game) throw new Error('That playoff game no longer exists. Reload the page.');
    if (winner !== 'score' && winner !== game.a_f && winner !== game.h_f) throw new Error('The winner has to be one of the two teams.');

    const cleanNote = String(note ?? '').trim().slice(0, 300);
    const winnerTeamSeason =
        winner === game.a_f ? game.a_ts
            : winner === game.h_f ? game.h_ts
                : game.a_score > game.h_score ? game.a_ts : game.h_score > game.a_score ? game.h_ts : null;

    const db = getDb();
    const key = { seasonYear: year, round: game.round, franchiseA: Math.min(game.a_f, game.h_f), franchiseB: Math.max(game.a_f, game.h_f) };
    const where = and(
        eq(schema.matchupOverrides.seasonYear, key.seasonYear),
        eq(schema.matchupOverrides.round, key.round),
        eq(schema.matchupOverrides.franchiseA, key.franchiseA),
        eq(schema.matchupOverrides.franchiseB, key.franchiseB),
    );
    const updateGame = db.update(schema.matchups).set({ winnerTeamSeasonId: winnerTeamSeason }).where(eq(schema.matchups.id, matchupId));

    if (winner === 'score' && !cleanNote) {
        await db.batch([db.delete(schema.matchupOverrides).where(where), updateGame]);
    } else {
        const values = { ...key, winnerFranchiseId: winner === 'score' ? null : winner, note: cleanNote || null };
        await db.batch([
            db.insert(schema.matchupOverrides).values(values).onConflictDoUpdate({
                target: [schema.matchupOverrides.seasonYear, schema.matchupOverrides.round, schema.matchupOverrides.franchiseA, schema.matchupOverrides.franchiseB],
                set: { winnerFranchiseId: values.winnerFranchiseId, note: values.note },
            }),
            updateGame,
        ]);
    }
    await afterWrite();
    return { saved: true };
}
