import { sql } from 'drizzle-orm';
import { rows } from '../data/db';
import { fallbackColours, parseTeamColours } from '../team-branding';
import type { StudioTeam } from './teams';

// The studio team list (GLOSSARY.md): every active franchise's current identity (ADR 0001) with its owner
// and saved team colours. The one loader for it: the site reads it through a cached wrapper, Publish freezes
// it on the episode as its team snapshot, and the production scripts write it into the fact packet. It reads
// the database directly, without Next's cache, so the scripts can call it.

interface Row { id: number; name: string; abbreviation: string; owner: string | null; logo: string | null; branding: unknown }

export async function loadStudioTeams(): Promise<StudioTeam[]> {
    const found = await rows<Row>(sql`
        select c.id, c.name, c.abbreviation, o.name as owner, c.logo, m.branding
        from league.current_teams c
        left join league.team_seasons t on t.id = c.latest_team_season_id
        left join league.owners o on o.id = t.owner_id
        left join league.team_management m on m.franchise_id = c.id
        where not c.defunct
        order by c.id`);
    return found.map(row => {
        const colours = parseTeamColours(row.branding, row.id) ?? fallbackColours;
        return {
            id: row.id, name: row.name, abbreviation: row.abbreviation, owner: row.owner, ownerFirst: row.owner?.split(/\s+/)[0] ?? null,
            logo: row.logo, primary: colours.primary, secondary: colours.secondary,
        };
    });
}
