import { rows } from '@/lib/data/db';
import { getLiveSeason } from '@/lib/fantrax/live-season';
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
export async function getKeeperRoster(franchiseId: number, fresh: boolean) {
    const live = await getLiveSeason({ now: Date.now(), fresh });
    if (live.status === 'unavailable') throw new Error('Your Fantrax roster is unavailable. Try again before submitting.');
    if (live.value.seasonYear !== KEEPER_SEASON) throw new Error('The Fantrax league does not match this keeper season. Contact the admin.');
    const team = live.value.teams.find(team => team.franchiseId === franchiseId);
    if (!team?.players.length) throw new Error('Your Fantrax roster is unavailable. Try again before submitting.');
    return { roster: team.players, fetchedAt: live.value.fetchedAt, fantraxLeagueId: live.value.fantraxLeagueId };
}
