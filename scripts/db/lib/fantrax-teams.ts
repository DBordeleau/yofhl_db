import * as schema from '@/db/schema';
import { seasonLabel } from '@/lib/seasons';
import type { Db } from './connect';
import type { LeagueConfig } from './league-config';

// Each season's Fantrax league and team IDs come from its `fantrax` block in league.yml. They are
// loaded on every import, whether or not the season has CSV exports yet, so the live season can
// map Fantrax teams to franchises before it is archived.

export type FantraxTeam = typeof schema.fantraxTeams.$inferInsert;

export const prepareFantraxTeams = (config: LeagueConfig) => {
    const errors: string[] = [];
    const rows: FantraxTeam[] = [];
    const franchises = new Set(config.franchises.map((franchise) => franchise.id));
    for (const [key, settings] of Object.entries(config.seasons)) {
        const fantrax = settings.fantrax;
        if (!fantrax) continue;
        const seasonYear = Number(key);
        const fail = (message: string) => errors.push(`${seasonLabel(seasonYear)}: ${message}`);
        const teamFor = new Map<number, string>();
        for (const [fantraxTeamId, franchiseId] of Object.entries(fantrax.teams ?? {})) {
            if (!franchises.has(franchiseId)) {
                fail(`Fantrax team ${fantraxTeamId} is mapped to franchise ${franchiseId}, which isn't in league.yml's franchises`);
                continue;
            }
            const other = teamFor.get(franchiseId);
            if (other) {
                fail(`Fantrax teams ${other} and ${fantraxTeamId} are both mapped to franchise ${franchiseId}`);
                continue;
            }
            teamFor.set(franchiseId, fantraxTeamId);
            rows.push({ seasonYear, fantraxLeagueId: fantrax.league, fantraxTeamId, franchiseId });
        }
    }
    return { rows, errors };
};

// league.yml is the whole list, so the table is replaced rather than merged
export const writeFantraxTeams = async (db: Db, rows: FantraxTeam[]) => {
    await db.transaction(async (tx) => {
        await tx.delete(schema.fantraxTeams);
        if (rows.length) await tx.insert(schema.fantraxTeams).values(rows);
    });
};
