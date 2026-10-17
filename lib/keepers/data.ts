import { rows } from '@/lib/data/db';
import { getLeagueSnapshot } from '@/lib/fantrax/data';
import { ownedTeamQuery } from '@/lib/owner/queries';
import type { ManagedTeam } from '@/lib/owner/model';
import { keeperSubmissionQuery } from './queries';
import { KEEPER_SEASON, type KeeperSubmission } from './model';

export async function ownedKeeperTeam(uid: string) {
    return (await rows<ManagedTeam>(ownedTeamQuery(uid)))[0] ?? null;
}
export async function getKeeperSubmission(franchiseId: number) {
    return (await rows<KeeperSubmission>(keeperSubmissionQuery(franchiseId)))[0] ?? null;
}
export async function getKeeperRoster(franchiseId: number, fresh = false) {
    const snapshot = await getLeagueSnapshot({ fresh });
    if (snapshot.seasonYear + 1 !== KEEPER_SEASON) throw new Error('The Fantrax league does not match this keeper season. Contact the admin.');
    const team = snapshot.teams.find(team => team.franchiseId === franchiseId);
    if (!team?.players.length) throw new Error('Your Fantrax roster is unavailable. Try again before submitting.');
    return { roster: team.players, fetchedAt: snapshot.fetchedAt };
}
