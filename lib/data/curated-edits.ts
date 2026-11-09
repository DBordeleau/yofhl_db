import { sql, type SQL } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import type { TeamColours } from '../team-branding';
import { curatedEditEffects, leagueTags, teamIdentityTags, type CuratedEdit } from './cache-tags';
import { rows } from './db';

// Curated edits: changes an admin or owner makes through the site. Each one checks the edit,
// writes it in one statement, refreshes the views it affects and expires the pages that show it
// (ADR 0002). Callers keep authentication, file uploads and their own page paths.

export type Invalidate = (tag: string) => void;
export interface EditOptions { invalidate?: Invalidate }

type Rejected<Reason> = { ok: false; reason: Reason };

const expire = (tags: readonly string[], { invalidate = revalidateTag }: EditOptions) => {
    for (const tag of tags) invalidate(tag);
};

const writeAndRefresh = async (kind: CuratedEdit, year: number, write: SQL, options: EditOptions) => {
    await rows(write);
    const { views, tags } = curatedEditEffects(kind, year);
    // A refresh failure comes after the write has committed, so expire the pages before rethrowing.
    try {
        for (const view of views) await rows(sql`refresh materialized view league.${sql.identifier(view)}`);
    } finally {
        expire(tags, options);
    }
};

const valueRows = (list: SQL[]) => sql.join(list, sql`, `);

const allPlayedIn = async (year: number, playerIds: string[]) => !playerIds.length ||
    (await rows(sql`select 1 from league.player_seasons where season_year = ${year} and player_id in ${playerIds}`)).length === playerIds.length;

// Replaces the season's championship roster with exactly these players.
export async function saveRoster(year: number, playerIds: string[], options: EditOptions = {}):
    Promise<{ ok: true; saved: number } | Rejected<'unknown-season' | 'no-playoffs' | 'unknown-player'>> {
    const [season] = await rows<{ playoff_status: string }>(sql`select playoff_status from league.seasons where year = ${year}`);
    if (!season) return { ok: false, reason: 'unknown-season' };
    if (season.playoff_status !== 'complete') return { ok: false, reason: 'no-playoffs' };
    const ids = Array.from(new Set(playerIds.map(String)));
    if (!await allPlayedIn(year, ids)) return { ok: false, reason: 'unknown-player' };
    // The delete and insert touch disjoint rows, so their order inside the statement doesn't matter.
    await writeAndRefresh('roster', year, ids.length
        ? sql`with kept (player_id) as (values ${valueRows(ids.map(id => sql`(${id}::text)`))}),
                   removed as (delete from league.championship_rosters
                               where season_year = ${year} and player_id not in (select player_id from kept))
              insert into league.championship_rosters (season_year, player_id)
              select ${year}::int, player_id from kept
              on conflict do nothing`
        : sql`delete from league.championship_rosters where season_year = ${year}`, options);
    return { ok: true, saved: ids.length };
}

// One winner per picked award; a null player clears that award for the season. Awards not picked are untouched.
export async function saveAwards(year: number, picks: { award: string; playerId: string | null }[], options: EditOptions = {}):
    Promise<{ ok: true; saved: number } | Rejected<'unknown-season' | 'unknown-award' | 'unknown-player'>> {
    const [season] = await rows(sql`select 1 from league.seasons where year = ${year}`);
    if (!season) return { ok: false, reason: 'unknown-season' };
    // The last pick for an award wins.
    const byAward = new Map(picks.map(pick => [String(pick.award), pick.playerId === null ? null : String(pick.playerId)]));
    if (!byAward.size) return { ok: true, saved: 0 };
    const names = [...byAward.keys()];
    const types = await rows<{ id: number; name: string }>(sql`select id, name from league.award_types where name in ${names}`);
    if (types.length !== names.length) return { ok: false, reason: 'unknown-award' };
    const winners = [...byAward.values()].filter((id): id is string => id !== null);
    if (!await allPlayedIn(year, [...new Set(winners)])) return { ok: false, reason: 'unknown-player' };
    const chosen = types.map(type => sql`(${type.id}::int, ${byAward.get(type.name)}::text)`);
    // Clear other winners of the picked awards, then upsert the new ones: disjoint rows, so order doesn't matter.
    await writeAndRefresh('awards', year, sql`
        with picks (award_type_id, player_id) as (values ${valueRows(chosen)}),
             cleared as (delete from league.awards a using picks
                         where a.season_year = ${year} and a.award_type_id = picks.award_type_id
                           and a.player_id is distinct from picks.player_id)
        insert into league.awards (season_year, award_type_id, player_id, team_season_id)
        select ${year}::int, picks.award_type_id, picks.player_id, ps.team_season_id
        from picks join league.player_seasons ps on ps.player_id = picks.player_id and ps.season_year = ${year}
        on conflict (season_year, award_type_id, player_id) do update set team_season_id = excluded.team_season_id`, options);
    return { ok: true, saved: winners.length };
}

// winner: 'score' follows the score, or a franchise id overrides it. Following the score with
// an empty note removes the correction. A game is keyed by season, round and its two franchises.
export async function saveMatchup(year: number, matchupId: number, winner: 'score' | number, note: string, options: EditOptions = {}):
    Promise<{ ok: true } | Rejected<'unknown-matchup' | 'not-in-matchup'>> {
    const [game] = await rows<{ round: number; a_ts: number; a_f: number; a_score: number; h_ts: number; h_f: number; h_score: number }>(sql`
        select m.round, a.id as a_ts, a.franchise_id as a_f, m.away_score::float8 as a_score,
               h.id as h_ts, h.franchise_id as h_f, m.home_score::float8 as h_score
        from league.matchups m
        join league.team_seasons a on a.id = m.away_team_season_id
        join league.team_seasons h on h.id = m.home_team_season_id
        where m.id = ${matchupId} and m.season_year = ${year}`);
    if (!game) return { ok: false, reason: 'unknown-matchup' };
    if (winner !== 'score' && winner !== game.a_f && winner !== game.h_f) return { ok: false, reason: 'not-in-matchup' };

    const cleanNote = String(note ?? '').trim().slice(0, 300) || null;
    const winnerTeamSeason =
        winner === game.a_f ? game.a_ts
            : winner === game.h_f ? game.h_ts
                : game.a_score > game.h_score ? game.a_ts : game.h_score > game.a_score ? game.h_ts : null;
    const [low, high] = [Math.min(game.a_f, game.h_f), Math.max(game.a_f, game.h_f)];
    const override = winner === 'score' && !cleanNote
        ? sql`delete from league.matchup_overrides
              where season_year = ${year} and round = ${game.round} and franchise_a = ${low} and franchise_b = ${high}`
        : sql`insert into league.matchup_overrides (season_year, round, franchise_a, franchise_b, winner_franchise_id, note)
              values (${year}, ${game.round}, ${low}, ${high}, ${winner === 'score' ? null : winner}::int, ${cleanNote}::text)
              on conflict (season_year, round, franchise_a, franchise_b)
              do update set winner_franchise_id = excluded.winner_franchise_id, note = excluded.note`;
    await writeAndRefresh('matchup', year, sql`
        with override as (${override})
        update league.matchups set winner_team_season_id = ${winnerTeamSeason}::int where id = ${matchupId}`, options);
    return { ok: true };
}

// The module trusts its caller to have authenticated the actor.
export type Actor = { admin: true } | { uid: string };
type TeamRejection = 'unknown-team' | 'not-owner' | 'defunct' | 'stale-version';

const actorIsAdmin = (actor: Actor) => 'admin' in actor && actor.admin === true;
const uidOf = (actor: Actor) => ('uid' in actor ? actor.uid : null);

// Ownership and version are checked inside each team write; an empty result means it was
// rejected, and this reads the team to say why.
const teamRejection = async (actor: Actor, franchiseId: number): Promise<Rejected<TeamRejection>> => {
    const [team] = await rows<{ defunct: boolean; owner_uid: string | null }>(sql`
        select f.folded_after_season is not null as defunct, m.owner_uid
        from league.franchises f left join league.team_management m on m.franchise_id = f.id
        where f.id = ${franchiseId}`);
    if (!team) return { ok: false, reason: 'unknown-team' };
    if (!actorIsAdmin(actor) && team.owner_uid !== uidOf(actor)) return { ok: false, reason: 'not-owner' };
    if (!actorIsAdmin(actor) && team.defunct) return { ok: false, reason: 'defunct' };
    return { ok: false, reason: 'stale-version' };
};

// A franchise's current identity. A missing logo keeps the current one. Version 0 creates the
// franchise's first managed identity, which only an admin may do. Season identities never change.
// orphanedLogoUrl is the replaced logo, set only when no team season still shows it.
export async function saveTeamIdentity(actor: Actor, changes: { franchiseId: number; version: number; name: string; logoUrl?: string | null }, options: EditOptions = {}):
    Promise<{ ok: true; orphanedLogoUrl: string | null } | Rejected<TeamRejection>> {
    const { franchiseId: id, version, name } = changes;
    const logo = changes.logoUrl ?? null;
    const admin = actorIsAdmin(actor);
    const [saved] = await rows<{ orphaned: string | null }>(version === 0
        ? sql`insert into league.team_management (franchise_id, name, logo_url)
              select f.id, ${name}, ${logo}::text from league.franchises f where f.id = ${id} and ${admin}
              on conflict (franchise_id) do nothing
              returning null::text as orphaned`
        // "before" is read from the statement's snapshot, so it holds the logo being replaced.
        : sql`update league.team_management m
              set name = ${name}, logo_url = coalesce(${logo}::text, m.logo_url), version = m.version + 1
              from league.franchises f, league.team_management before
              where m.franchise_id = ${id} and f.id = m.franchise_id and before.franchise_id = m.franchise_id
                and m.version = ${version}
                and (${admin} or (m.owner_uid = ${uidOf(actor)} and f.folded_after_season is null))
              returning case when before.logo_url is distinct from m.logo_url
                              and not exists (select 1 from league.team_seasons s where s.logo_url = before.logo_url)
                             then before.logo_url end as orphaned`);
    if (!saved) return teamRejection(actor, id);
    expire(teamIdentityTags(id), options);
    return { ok: true, orphanedLogoUrl: saved.orphaned };
}

// Team colours share the identity version, so a colour save can't silently race a name or logo edit.
export async function saveTeamBranding(actor: Actor, franchiseId: number, version: number, colours: TeamColours, options: EditOptions = {}):
    Promise<{ ok: true } | Rejected<TeamRejection>> {
    const admin = actorIsAdmin(actor);
    const uid = uidOf(actor);
    const saved = await rows(sql`
        insert into league.team_management as m (franchise_id, branding)
        select f.id, ${JSON.stringify(colours)}::jsonb from league.franchises f
        where f.id = ${franchiseId} and (${admin} or exists (
            select 1 from league.team_management owned
            where owned.franchise_id = f.id and owned.owner_uid = ${uid} and f.folded_after_season is null
        )) and (${version} = 0 or exists (
            select 1 from league.team_management current where current.franchise_id = f.id and current.version = ${version}
        ))
        on conflict (franchise_id) do update set branding = excluded.branding, version = m.version + 1
        where m.version = ${version} and (${admin} or (m.owner_uid = ${uid} and exists (
            select 1 from league.franchises f where f.id = m.franchise_id and f.folded_after_season is null
        )))
        returning m.franchise_id`);
    if (!saved.length) return teamRejection(actor, franchiseId);
    expire([leagueTags.branding], options);
    return { ok: true };
}
