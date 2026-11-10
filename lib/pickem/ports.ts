// What the Pick'em module needs from outside it. Production binds these in pickem.ts; tests use the stand-ins in
// testing/pickem-league.ts.
import type { getLiveSeason, getWeekScores } from '@/lib/fantrax/live-season';
import type { OwnerSession } from '@/lib/owner/create-owner-session';
import type { PickemLaunch } from './model';

export interface PickemPorts {
    /** the live season module: weeks, pairings, scores and final weeks */
    liveSeason: { getLiveSeason: typeof getLiveSeason; getWeekScores: typeof getWeekScores };
    /** who is signed in, and the owner preamble every save starts with */
    ownerSession: Pick<OwnerSession, 'currentOwner' | 'ownerPreamble'>;
    /** the launch setting; null while Pick'em is switched off */
    launch: PickemLaunch | null;
}
