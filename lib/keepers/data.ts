import { rows } from '@/lib/data/db';
import { getLiveSeason } from '@/lib/fantrax/live-season';
import type { KeeperReminderState } from '@/components/keepers/reminder';
import { keeperSubmissionQuery } from './queries';
import { KEEPER_SEASON, KEEPERS_ENABLED, keepersOpen, submissionStatus, type KeeperSubmission } from './model';

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

/** The header's keeper reminder for a team while submissions are open, or null. */
export async function getKeeperReminder(franchiseId: number): Promise<KeeperReminderState | null> {
    if (!KEEPERS_ENABLED || !keepersOpen()) return null;
    const submission = await getKeeperSubmission(franchiseId);
    // An API outage must not make an existing submission look missing. Only the submission status is
    // reported, so the cached live season is enough.
    const current = submission ? await getKeeperRoster(franchiseId, false).catch(() => null) : null;
    const newerRoster = current && submission && Date.parse(current.fetchedAt) > Date.parse(submission.submittedAt) ? current.roster : undefined;
    return { status: submissionStatus(submission, newerRoster), serverNow: new Date().toISOString() };
}
