import { sql, type SQL } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import type { TeamColours } from '../team-branding';
import { curatedEditEffects, leagueTags, teamIdentityTags, type CuratedEdit } from './cache-tags';
import { rows } from './db';
import pilotTeams from '../coachs-corner/pilot-teams.json';
import { inRefreshOrder } from './materialized-views';
import { matchupWinner } from './matchup-winner';
import { STORED_AWARD_IDS, isStoredAwardId } from '../awards';

// Curated edits: changes an admin or owner makes through the site. Each one checks the edit,
// writes it in one statement, refreshes the views it affects and expires the pages that show it
// (ADR 0002). Callers keep authentication, file uploads and their own page paths.

export type Invalidate = (tag: string) => void;
export interface EditOptions { invalidate?: Invalidate }

// the bundled pilot's team snapshot lives in the repository, not on an episode row
const pilotLogos = [...new Set(pilotTeams.flatMap(team => (team.logo ? [team.logo] : [])))];

type Rejected<Reason> = { ok: false; reason: Reason };

const expire = (tags: readonly string[], { invalidate = revalidateTag }: EditOptions) => {
    for (const tag of tags) invalidate(tag);
};

// Refreshes the views a kind of edit affects, in order, and expires its pages. A refresh failure comes after the
// write has committed, so the pages are expired before rethrowing.
const refreshAndExpire = async (kind: CuratedEdit, year: number, options: EditOptions) => {
    const { views, tags } = curatedEditEffects(kind, year);
    try {
        for (const view of inRefreshOrder(views)) await rows(sql`refresh materialized view league.${sql.identifier(view)}`);
    } finally {
        expire(tags, options);
    }
};

// `wrote` says from the statement's rows whether it changed anything; when it didn't (its own check refused it),
// nothing is refreshed or expired.
const writeAndRefresh = async <T = Record<string, unknown>>(kind: CuratedEdit, year: number, write: SQL, options: EditOptions,
    wrote: (result: T[]) => boolean = () => true) => {
    const result = await rows<T>(write);
    if (wrote(result)) await refreshAndExpire(kind, year, options);
    return result;
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
    // The roster is now the league owner's: the season sync's record of an automatic roster is cleared, and the
    // champion it was saved for is recorded, so the season sync never replaces it (lib/season-sync/championship-roster.ts).
    const saved = sql`saved as (update league.season_sync_status
        set auto_roster_franchise_id = null,
            saved_roster_franchise_id = (select t.franchise_id from league.season_results r
                                         join league.team_seasons t on t.id = r.champion_team_season_id where r.season_year = ${year})
        where season_year = ${year})`;
    // The delete, insert and status update touch disjoint rows, so their order inside the statement doesn't matter.
    await writeAndRefresh('roster', year, ids.length
        ? sql`with kept (player_id) as (values ${valueRows(ids.map(id => sql`(${id}::text)`))}),
                   removed as (delete from league.championship_rosters
                               where season_year = ${year} and player_id not in (select player_id from kept)),
                   ${saved}
              insert into league.championship_rosters (season_year, player_id)
              select ${year}::int, player_id from kept
              on conflict do nothing`
        : sql`with ${saved} delete from league.championship_rosters where season_year = ${year}`, options);
    return { ok: true, saved: ids.length };
}

/** whether `year`'s award vote is published: its winners are the vote's, and no hand entry changes them */
const awardVotePublished = (year: number) =>
    sql`exists (select 1 from league.award_votes v where v.season_year = ${year} and v.state = 'published')`;

// One winner per picked award, each picked by its catalogue ID ('hasek'); a null player clears that award for the
// season. Awards not picked are untouched. Refused for an ID the catalogue doesn't store winners under (ADR 0009), and
// for a season whose award vote is published (lib/award-vote/publish.ts), by the statement as well.
export async function saveAwards(year: number, picks: { award: string; playerId: string | null }[], options: EditOptions = {}):
    Promise<{ ok: true; saved: number } | Rejected<'unknown-season' | 'award-vote-published' | 'unknown-award' | 'unknown-player'>> {
    const [season] = await rows<{ published: boolean }>(sql`select ${awardVotePublished(year)} as published from league.seasons where year = ${year}`);
    if (!season) return { ok: false, reason: 'unknown-season' };
    if (season.published) return { ok: false, reason: 'award-vote-published' };
    // The last pick for an award wins.
    const byAward = new Map(picks.map(pick => [String(pick.award), pick.playerId === null ? null : String(pick.playerId)]));
    if (!byAward.size) return { ok: true, saved: 0 };
    if (![...byAward.keys()].every(isStoredAwardId)) return { ok: false, reason: 'unknown-award' };
    const winners = [...byAward.values()].filter((id): id is string => id !== null);
    if (!await allPlayedIn(year, [...new Set(winners)])) return { ok: false, reason: 'unknown-player' };
    const chosen = [...byAward].map(([award, playerId]) => sql`(${award}::text, ${playerId}::text)`);
    // Clear other winners of the picked awards, then upsert the new ones: disjoint rows, so order doesn't matter. Both
    // only while the season's award vote isn't published, in case it was published since the check above.
    const [{ allowed }] = await writeAndRefresh<{ allowed: boolean }>('awards', year, sql`
        with allowed as (select where not ${awardVotePublished(year)}),
             picks (award, player_id) as (select v.* from (values ${valueRows(chosen)}) as v
                                          where exists (select from allowed)),
             cleared as (delete from league.awards a using picks
                         where a.season_year = ${year} and a.award = picks.award
                           and a.player_id is distinct from picks.player_id),
             saved as (insert into league.awards (season_year, award, player_id, team_season_id)
                       select ${year}::int, picks.award, picks.player_id, ps.team_season_id
                       from picks join league.player_seasons ps on ps.player_id = picks.player_id and ps.season_year = ${year}
                       on conflict (season_year, award, player_id) do update set team_season_id = excluded.team_season_id)
        select exists (select from allowed) as allowed`, options, result => result[0].allowed);
    if (!allowed) return { ok: false, reason: 'award-vote-published' };
    return { ok: true, saved: winners.length };
}

/** where an award vote's winners come from: the statement that publishes the vote, and the winners it publishes */
export interface PublishedWinners {
    /** a statement run as the CTE `gate` that returns a row only when the winners may be written (publishing the vote) */
    gate: SQL;
    /**
     * a select of every winner as (award text, player_id text, name text, team_season_id int), co-winners each
     * their own row, under the award's catalogue ID, with the team season credited with them or null and the name they go by
     */
    winners: SQL;
}

// An award vote's winners (lib/award-vote/publish.ts), written in the same statement as the change that publishes
// the vote: they replace every winner of each award they win, hand-entered ones included. An award with no winner
// keeps whatever it had. Unlike a hand entry, each winner's team season is the one given, not their end-of-season one.
//
// A winner the archive has no player for (one Fantrax lists but the season sync never wrote: no fantasy points and
// no roster spot at the end of the season) is added as a player under the name given, so publishing never stalls on
// the archive and every award page shows them; the season sync keeps award players like any other from then on.
//
// A winner under an ID the catalogue doesn't store winners under (ADR 0009) is a bug in the vote, so it throws
// before anything is written or published.
//
// Publishing can't be repeated, so if a view refresh fails after the commit, refreshPublishedWinners finishes it.
export async function savePublishedWinners(year: number, { gate, winners }: PublishedWinners, options: EditOptions = {}):
    Promise<{ published: boolean }> {
    const unknown = await rows<{ award: string }>(sql`select distinct w.award from (${winners}) w
                                                      where w.award not in ${STORED_AWARD_IDS} order by 1`);
    if (unknown.length) throw new Error(`Award vote winners under awards the catalogue doesn't store: ${unknown.map(row => row.award).join(', ')}`);
    const [{ published }] = await writeAndRefresh<{ published: boolean }>('awardVotePublished', year, sql`
        with gate as (${gate}),
             winners as (select w.award, w.player_id, w.name, w.team_season_id from (${winners}) w
                         where exists (select 1 from gate)),
             added as (insert into league.players (id, name)
                       select distinct on (player_id) player_id, name from winners order by player_id
                       on conflict (id) do nothing),
             cleared as (delete from league.awards a
                         where a.season_year = ${year} and a.award in (select award from winners)
                           and not exists (select 1 from winners w where w.award = a.award and w.player_id = a.player_id)),
             saved as (insert into league.awards (season_year, award, player_id, team_season_id)
                       select ${year}::int, award, player_id, team_season_id from winners
                       on conflict (season_year, award, player_id) do update set team_season_id = excluded.team_season_id)
        select exists (select 1 from gate) as published`, options, result => result[0].published);
    return { published };
}

// Runs a published award vote's refresh and expiry again (lib/award-vote/refresh-archive.ts): the recovery when a
// view refresh failed after publishing committed (ADR 0002), since publishing itself can't be repeated. The caller
// checks the season's award vote is published.
export async function refreshPublishedWinners(year: number, options: EditOptions = {}): Promise<void> {
    await refreshAndExpire('awardVotePublished', year, options);
}

// Corrects a playoff game. winner: 'score' follows the score, or a franchise id overrides it.
// Following the score with an empty note removes the correction. A game is keyed by season, round and its two franchises.
export async function saveMatchup(year: number, matchupId: number, winner: 'score' | number, note: string, options: EditOptions = {}):
    Promise<{ ok: true } | Rejected<'unknown-matchup' | 'not-playoff' | 'not-in-matchup'>> {
    const [game] = await rows<{ stage: 'playoff' | 'regular'; round: number; a_ts: number; a_f: number; a_score: number; h_ts: number; h_f: number; h_score: number }>(sql`
        select m.stage, m.round, a.id as a_ts, a.franchise_id as a_f, m.away_score::float8 as a_score,
               h.id as h_ts, h.franchise_id as h_f, m.home_score::float8 as h_score
        from league.matchups m
        join league.team_seasons a on a.id = m.away_team_season_id
        join league.team_seasons h on h.id = m.home_team_season_id
        where m.id = ${matchupId} and m.season_year = ${year}`);
    if (!game) return { ok: false, reason: 'unknown-matchup' };
    // Bracket review is the only caller; a regular-season game has no curated path.
    if (game.stage !== 'playoff') return { ok: false, reason: 'not-playoff' };
    if (winner !== 'score' && winner !== game.a_f && winner !== game.h_f) return { ok: false, reason: 'not-in-matchup' };

    const cleanNote = String(note ?? '').trim().slice(0, 300) || null;
    // The override names a franchise; the matchup stores the winning team season.
    const away = { franchise: game.a_f, id: game.a_ts, score: game.a_score };
    const home = { franchise: game.h_f, id: game.h_ts, score: game.h_score };
    const overriddenBy = [away, home].find(side => side.franchise === winner);
    const winnerTeamSeason = matchupWinner(away, home, overriddenBy?.id);
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
// orphanedLogoUrl is the replaced logo, set only when no team season and no episode's team snapshot
// (the bundled pilot's included) still shows it. A logo a team snapshot uses is kept for good.
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
                              and not exists (select 1 from league.coachs_corner_episodes e, jsonb_array_elements(e.teams) t
                                              where t->>'logo' = before.logo_url)
                              ${pilotLogos.length ? sql`and before.logo_url not in ${pilotLogos}` : sql``}
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
