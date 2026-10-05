import { sql } from 'drizzle-orm';
import { cached, rows } from './db';
import { parseTeamColours, type TeamColours } from '../team-branding';

export const getTeamBranding = cached(async (): Promise<Record<number, TeamColours>> => {
    const teams = await rows<{ id: number; branding: unknown }>(sql`
        select franchise_id as id, branding from league.team_management where branding is not null
    `);
    return Object.fromEntries(teams.flatMap(team => {
        const colours = parseTeamColours(team.branding, team.id);
        return colours ? [[team.id, colours]] : [];
    }));
}, 'team-branding');
