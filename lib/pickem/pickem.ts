// The Pick'em module wired to production: the live season, the owner session and the launch setting.
import { getLiveSeason, getWeekScores, liveSeasonYear } from '@/lib/fantrax/live-season';
import { ownerSession } from '@/lib/owner/owner-session';
import { createPickem } from './create-pickem';
import { PICKEM_LAUNCH } from './settings';

export const pickem = createPickem({ liveSeason: { getLiveSeason, getWeekScores, liveSeasonYear }, ownerSession, launch: PICKEM_LAUNCH });
