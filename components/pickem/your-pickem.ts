'use client';

import { useEffect, useState } from 'react';
import { readYourPickem } from '@/app/pickem/actions';
import type { YourPickem } from '@/lib/pickem/create-pickem';
import { hasSessionHint } from '@/lib/owner/navigation';

// The signed-in owner's part of a week, for the slate. Choosing a week starts the read (week-switcher.tsx) alongside the
// page's own load, and the slate takes that read when it mounts rather than starting another, so the owner's picks are
// usually in hand by the time its strips open. A read is handed over once and only while it is fresh, since a save
// would leave it stale. Reads go out only with the session hint (ADR 0003).

const FRESH = 10_000;
const started = new Map<string, { at: number; read: Promise<YourPickem | null> }>();
const keyOf = (seasonYear: number, week: number) => `${seasonYear}-${week}`;

/** Starts reading the owner's part of a week the slate is about to show */
export function prefetchYours(seasonYear: number, week: number) {
    if (!hasSessionHint()) return;
    // a refused read reads as nobody signed in, as the slate's own read does
    started.set(keyOf(seasonYear, week), { at: Date.now(), read: readYourPickem(seasonYear, week).catch(() => null) });
}

/** The owner's part of a week: the read a week change started, or a new one */
export function readYours(seasonYear: number, week: number): Promise<YourPickem | null> {
    const key = keyOf(seasonYear, week);
    const prefetched = started.get(key);
    started.delete(key);
    return prefetched && Date.now() - prefetched.at < FRESH ? prefetched.read : readYourPickem(seasonYear, week);
}

// the page has hydrated: a slate mounted from here on comes from a week change
let hydrated = false;
// the longest a slate holds its strips closed waiting on the owner's picks before opening them anyway
const HOLD_FOR = 1500;

/**
 * Whether the slate holds its strips closed, their entrance paused at its start (pickem.module.css), until the owner's
 * picks are in, so the strips open already picked rather than opening level and then swinging to the picks. Only a
 * slate a week change mounts holds, and only for a visitor who may be signed in: the page's first slate has started
 * opening before it hydrates. `release` opens it; it opens by itself after HOLD_FOR.
 */
export function useEntranceHold(wanted: boolean) {
    const [held, setHeld] = useState(() => hydrated && wanted && hasSessionHint());
    useEffect(() => { hydrated = true; }, []);
    useEffect(() => {
        if (!held) return;
        const timer = window.setTimeout(() => setHeld(false), HOLD_FOR);
        return () => window.clearTimeout(timer);
    }, [held]);
    return { held, release: () => setHeld(false) };
}
