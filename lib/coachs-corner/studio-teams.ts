import { sql, type SQL } from 'drizzle-orm';
import { fallbackColours, parseTeamColours } from '../team-branding';
import type { StudioTeam } from './teams';

// The studio team list (GLOSSARY.md: team snapshot): every active franchise's current identity (ADR 0001)
// with its owner and saved team colours. The one loader for it: the site reads it through a cached wrapper,
// Publish freezes it on the episode, and the production scripts write it into the fact packet. Needs neither
// Next nor its cache, so the scripts can call it.

type Query = (query: SQL) => Promise<Record<string, unknown>[]>;
const defaultQuery: Query = async query => {
    const { rows } = await import('../data/db');
    return rows<Record<string, unknown>>(query);
};

interface Row { id: number; name: string; abbreviation: string; owner: string | null; logo: string | null; branding: unknown }

export async function loadStudioTeams(query: Query = defaultQuery): Promise<StudioTeam[]> {
    const found = await query(sql`
        select c.id, c.name, c.abbreviation, o.name as owner, c.logo, m.branding
        from league.current_teams c
        left join league.team_seasons t on t.id = c.latest_team_season_id
        left join league.owners o on o.id = t.owner_id
        left join league.team_management m on m.franchise_id = c.id
        where not c.defunct
        order by c.id`) as unknown as Row[];
    return found.map(row => {
        const colours = parseTeamColours(row.branding, row.id) ?? fallbackColours;
        return {
            id: row.id, name: row.name, abbreviation: row.abbreviation, owner: row.owner, ownerFirst: row.owner?.split(/\s+/)[0] ?? null,
            logo: row.logo, primary: colours.primary, secondary: colours.secondary,
        };
    });
}
