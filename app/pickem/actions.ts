'use server';

import type { SavePickRejection, YourPickem } from '@/lib/pickem/create-pickem';
import { pickem } from '@/lib/pickem/pickem';
import { PICKEM_LAUNCH } from '@/lib/pickem/settings';

// Thin wrappers: the Pick'em module decides; these map its reasons to what an owner reads.

const messages: Record<SavePickRejection, string> = {
    'session-expired': 'Sign in again to make picks.',
    'no-team': 'Claim your team to make picks.',
    'not-open': 'This week is not open for picks.',
    locked: 'This week has locked. Your pick was not saved.',
    'no-such-matchup': 'This matchup has changed. Reload the page.',
    'not-in-matchup': 'This matchup has changed. Reload the page.',
    'rate-limited': 'Too many picks in a short time. Try again in 15 minutes.',
};

const isWhole = (value: unknown): value is number => Number.isSafeInteger(value);

/** The signed-in owner's part of a week. Never cached. */
export async function readYourPickem(seasonYear: number, week: number): Promise<YourPickem | null> {
    if (!PICKEM_LAUNCH || !isWhole(seasonYear) || !isWhole(week)) return null;
    const read = await pickem.readWeek({ now: Date.now(), seasonYear, week, asker: 'session' });
    return read.status === 'week' ? read.week.yours : null;
}

export async function savePickemPick(input: { seasonYear: number; week: number; matchup: [number, number]; picked: number | null }):
    Promise<{ ok: true } | { error: string }> {
    if (!PICKEM_LAUNCH) return { error: messages['not-open'] };
    if (!input || !isWhole(input.seasonYear) || !isWhole(input.week) || (input.picked !== null && !isWhole(input.picked))) {
        return { error: 'Reload the page and try again.' };
    }
    try {
        const result = await pickem.savePick({ now: Date.now(), seasonYear: input.seasonYear, week: input.week, matchup: input.matchup, picked: input.picked });
        return result.ok ? result : { error: messages[result.reason] };
    } catch {
        return { error: 'Could not save your pick. Try again.' };
    }
}
