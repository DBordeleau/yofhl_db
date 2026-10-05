import { sql } from 'drizzle-orm';
import type { TeamColours } from '../team-branding';

export const managedTeamsQuery = sql`
    select f.id, coalesce(m.name, t.name, f.display_name) as name,
           coalesce(m.logo_url, t.logo_url, f.logo_url) as logo,
           coalesce(t.abbreviation, '') as abbreviation,
           f.folded_after_season is not null as defunct,
           m.owner_uid as "ownerUid", m.owner_email as "ownerEmail",
           m.invite_expires_at as "inviteExpiresAt", coalesce(m.version, 0) as version, m.branding
    from league.franchises f
    left join league.team_management m on m.franchise_id = f.id
    left join lateral (select name, logo_url, abbreviation from league.team_seasons
        where franchise_id = f.id order by season_year desc limit 1) t on true
    order by f.folded_after_season is not null, f.id`;

// One atomic update consumes the invitation and binds the team. The unique owner UID
// also prevents two concurrent claims by the same account from claiming two teams.
export const claimTeamQuery = (hash: string, uid: string, email: string) => sql`
    update league.team_management m
    set owner_uid = ${uid}, owner_email = ${email}, invite_hash = null,
        invite_expires_at = null, version = version + 1
    from league.franchises f
    where f.id = m.franchise_id and f.folded_after_season is null
      and m.invite_hash = ${hash} and m.invite_expires_at > now() and m.owner_uid is null
      and not exists (select 1 from league.team_management where owner_uid = ${uid})
    returning m.franchise_id`;

export const issueInviteQuery = (id: number, hash: string) => sql`
    insert into league.team_management (franchise_id, invite_hash, invite_expires_at)
    select id, ${hash}, now() + interval '14 days' from league.franchises
    where id = ${id} and folded_after_season is null
    on conflict (franchise_id) do update
    set invite_hash = excluded.invite_hash, invite_expires_at = excluded.invite_expires_at,
        version = league.team_management.version + 1
    where league.team_management.owner_uid is null
    returning franchise_id`;

// Optimistic version check avoids deleting a logo another edit has just installed.
// Ownership is checked again in this write, not only when rendering the editor.
export const saveTeamQuery = (id: number, version: number, name: string, logo: string | null, admin: boolean) => sql`
    insert into league.team_management (franchise_id, name, logo_url)
    select f.id, ${name}, ${logo} from league.franchises f where f.id = ${id}
      and ${admin} and ${version} = 0
    on conflict (franchise_id) do nothing
    returning franchise_id`;

export const updateTeamQuery = (id: number, version: number, name: string, logo: string | null, uid: string | null, admin: boolean) => sql`
    update league.team_management m set name = ${name}, logo_url = ${logo}, version = version + 1
    from league.franchises f
    where m.franchise_id = ${id} and f.id = m.franchise_id and m.version = ${version}
      and (${admin} or (m.owner_uid = ${uid} and f.folded_after_season is null))
    returning m.franchise_id`;

export const rateLimitQuery = (key: string) => sql`
    insert into league.owner_rate_limits (key, attempts, resets_at)
    values (${key}, 1, now() + interval '15 minutes')
    on conflict (key) do update set
      attempts = case when league.owner_rate_limits.resets_at <= now() then 1 else league.owner_rate_limits.attempts + 1 end,
      resets_at = case when league.owner_rate_limits.resets_at <= now() then now() + interval '15 minutes' else league.owner_rate_limits.resets_at end
    returning attempts`;

// Share the identity version so a colour save cannot silently race a name/logo edit.
export const saveBrandingQuery = (id: number, version: number, branding: TeamColours, uid: string | null, admin: boolean) => sql`
    insert into league.team_management as m (franchise_id, branding)
    select f.id, ${JSON.stringify(branding)}::jsonb from league.franchises f
    where f.id = ${id} and (${admin} or exists (
        select 1 from league.team_management owned
        where owned.franchise_id = f.id and owned.owner_uid = ${uid} and f.folded_after_season is null
    )) and (${version} = 0 or exists (
        select 1 from league.team_management current where current.franchise_id = f.id and current.version = ${version}
    ))
    on conflict (franchise_id) do update set branding = excluded.branding, version = m.version + 1
    where m.version = ${version} and (${admin} or (m.owner_uid = ${uid} and exists (
        select 1 from league.franchises f where f.id = m.franchise_id and f.folded_after_season is null
    )))
    returning m.franchise_id`;
