'use server';

import type { MatchupPair, SavePickemPickRejection, YourPickem } from '@/lib/pickem/create-pickem';
import { pickem } from '@/lib/pickem/pickem';
import { PICKEM_LAUNCH } from '@/lib/pickem/settings';

// Thin wrappers: the Pick'em module decides; these map its reasons to what an owner reads.

const messages: Record<SavePickemPickRejection, string> = {
    'session-expired': "Sign in again to play Pick'em.",
    'no-team': "Claim your team to play Pick'em.",
    'not-open': "Pick'em is not open for this week.",
    locked: "This week has locked. Your Pick'em pick was not saved.",
    'no-such-matchup': 'This matchup has changed. Reload the page.',
    'not-in-matchup': 'This matchup has changed. Reload the page.',
    'rate-limited': 'Too many saves in a short time. Try again in 15 minutes.',
};

// where an owner goes to fix a refusal, when the fix is on another page
const fixes: Partial<Record<SavePickemPickRejection, string>> = { 'session-expired': '/owner', 'no-team': '/owner' };

const isWhole = (value: unknown): value is number => Number.isSafeInteger(value);

/** The signed-in owner's part of a week. Never cached. */
export async function readYourPickem(seasonYear: number, week: number): Promise<YourPickem | null> {
    if (!PICKEM_LAUNCH || !isWhole(seasonYear) || !isWhole(week)) return null;
    const read = await pickem.readWeek({ now: Date.now(), seasonYear, week, asker: 'session' });
    return read.status === 'week' ? read.week.yours : null;
}

export async function savePickemPick(input: { seasonYear: number; week: number; matchup: MatchupPair; picked: number | null }):
    Promise<{ ok: true } | { error: string; fix?: string }> {
    if (!PICKEM_LAUNCH) return { error: messages['not-open'] };
    if (!input || !isWhole(input.seasonYear) || !isWhole(input.week) || (input.picked !== null && !isWhole(input.picked))) {
        return { error: 'Reload the page and try again.' };
    }
    try {
        const result = await pickem.savePickemPick({ now: Date.now(), seasonYear: input.seasonYear, week: input.week, matchup: input.matchup, picked: input.picked });
        return result.ok ? result : { error: messages[result.reason], fix: fixes[result.reason] };
    } catch {
        return { error: "Could not save your Pick'em pick. Try again." };
    }
}
