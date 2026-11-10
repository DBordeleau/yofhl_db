import { sql } from 'drizzle-orm';

type TeamFilter = { ownerUid: string } | { franchiseId: number };

const teamsQuery = (filter?: TeamFilter) => sql`
    select c.id, c.name, c.logo, c.abbreviation, c.defunct,
           m.owner_uid as "ownerUid", m.owner_email as "ownerEmail",
           m.invite_expires_at as "inviteExpiresAt", coalesce(m.version, 0) as version, m.branding
    from league.current_teams c
    left join league.team_management m on m.franchise_id = c.id
    ${filter === undefined ? sql``
        : 'ownerUid' in filter ? sql`where m.owner_uid = ${filter.ownerUid} and not c.defunct`
        : sql`where c.id = ${filter.franchiseId}`}
    order by c.defunct, c.id`;

export const managedTeamsQuery = teamsQuery();
export const ownedTeamQuery = (uid: string) => teamsQuery({ ownerUid: uid });
export const managedTeamQuery = (franchiseId: number) => teamsQuery({ franchiseId });

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

export const rateLimitQuery = (key: string) => sql`
    insert into league.owner_rate_limits (key, attempts, resets_at)
    values (${key}, 1, now() + interval '15 minutes')
    on conflict (key) do update set
      attempts = case when league.owner_rate_limits.resets_at <= now() then 1 else league.owner_rate_limits.attempts + 1 end,
      resets_at = case when league.owner_rate_limits.resets_at <= now() then now() + interval '15 minutes' else league.owner_rate_limits.resets_at end
    returning attempts`;

// Forget limits that reset more than a day ago, so the table holds only recent attempts.
export const rateLimitCleanupQuery = sql`delete from league.owner_rate_limits where resets_at < now() - interval '1 day'`;
