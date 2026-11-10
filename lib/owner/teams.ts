import { rows } from '@/lib/data/db';
import type { ManagedTeam } from './model';
import { managedTeamQuery, managedTeamsQuery, ownedTeamQuery } from './queries';

// The one way pages, routes and actions read managed teams. Never cached: owners and the admin
// must see their own edits at once.

/** The active team an owner's account manages, or null (no team, or its franchise folded). */
export async function getOwnedTeam(uid: string): Promise<ManagedTeam | null> {
    return (await rows<ManagedTeam>(ownedTeamQuery(uid)))[0] ?? null;
}

/** Every managed team for the admin, active teams first. */
export function getManagedTeams(): Promise<ManagedTeam[]> {
    return rows<ManagedTeam>(managedTeamsQuery);
}

/** One managed team by franchise id, folded or not, or null for an unknown id. */
export async function getManagedTeam(franchiseId: number): Promise<ManagedTeam | null> {
    return (await rows<ManagedTeam>(managedTeamQuery(franchiseId)))[0] ?? null;
}
