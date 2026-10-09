import type { SnapshotPlayer } from '../fantrax/model';
import type { PlayerDetails } from './player-details';

// Re-enable after updating the season, deadline and Fantrax mapping for the next submission window.
export const KEEPERS_ENABLED = false;

// Seasons in the archive use their ending year. This submission window is 2026–27.
export const KEEPER_SEASON = 2027;
export const KEEPER_SEASON_LABEL = '2026–27';
export const KEEPER_DEADLINE = '2026-10-09T23:00:00.000Z';
export const KEEPER_DEADLINE_LABEL = 'Friday, Oct 9, 2026 · 7:00 p.m. Eastern';
export const KEEPER_LIMITS = { F: 5, D: 3, G: 2 } as const;
export const KEEPER_TOTAL_LIMIT = 8;
export const CALDER_SEASON = 2026;
export const CALDER_SEASON_LABEL = '2025–2026';
export const POSITION_LABELS = { F: 'Forwards', D: 'Defence', G: 'Goalies', OTHER: 'Other positions' };
export type KeeperPosition = keyof typeof KEEPER_LIMITS | 'OTHER';
export type KeeperPlayer = Pick<SnapshotPlayer, 'id' | 'name' | 'position' | 'lineupPosition' | 'nhlTeam' | 'status'> & { details?: PlayerDetails };
export interface RookieReview { status: 'approved' | 'rejected'; note: string; reviewedAt: string; calderSeason?: number }
export interface KeeperSubmission {
    franchiseId: number; seasonYear: number; roster: KeeperPlayer[]; keptIds: string[];
    rookieId: string | null; rookieDeclared: boolean; rookieReviews: Partial<Record<string, RookieReview>>;
    version: number; submittedAt: string; submittedBy: string;
    rookieSeason?: number | null;
}
export interface KeeperSelection { keptIds: string[]; rookieId: string | null; rookieDeclared: boolean; rookieSeason?: number | null }
export interface KeeperInput extends KeeperSelection { version: number; rosterFingerprint: string }
export type KeeperSaveResult = { submission: KeeperSubmission; error?: never } | { error: string; submission?: never };
export const keepersOpen = (now = Date.now()) => now < Date.parse(KEEPER_DEADLINE);
export const isMinor = (player: KeeperPlayer) => player.status === 'MINORS';
export const currentRookieReview = (review?: RookieReview) => review?.calderSeason === CALDER_SEASON ? review : undefined;

export function keeperPosition(player: KeeperPlayer): KeeperPosition {
    const positions = player.position.toUpperCase().split(/[^A-Z]+/);
    const groups = new Set<KeeperPosition>();
    for (const position of positions) {
        if (['C', 'LW', 'RW', 'F'].includes(position)) groups.add('F');
        if (position === 'D' || position === 'G') groups.add(position);
    }
    if (groups.size === 1) return Array.from(groups)[0];
    const lineup = player.lineupPosition.toUpperCase();
    const assigned = ['C', 'LW', 'RW', 'F'].includes(lineup) ? 'F' : lineup;
    return groups.has(assigned as KeeperPosition) ? assigned as KeeperPosition : 'OTHER';
}

// Ignore NHL affiliations/names: only roster membership, position and minor status affect the rules.
export function rosterFingerprint(roster: KeeperPlayer[]) {
    return JSON.stringify(roster.map(player => [player.id, keeperPosition(player), isMinor(player)])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

export function validateKeepers(roster: KeeperPlayer[], selection: KeeperSelection, reviews: Partial<Record<string, RookieReview>> = {}) {
    const errors: string[] = [];
    const players = new Map(roster.map(player => [player.id, player]));
    const kept = new Set(selection.keptIds);
    const counts = { F: 0, D: 0, G: 0 };
    let regularCount = 0;
    if (!roster.length || players.size !== roster.length) errors.push('A complete team roster is required. Reload the page.');
    if (kept.size !== selection.keptIds.length) errors.push('A player cannot be selected twice.');
    if (selection.keptIds.some(id => !players.has(id))) errors.push('A selected player is no longer on this roster. Reload the page.');
    for (const player of roster) if (isMinor(player)) kept.add(player.id);
    if (selection.rookieId) {
        const rookie = players.get(selection.rookieId);
        if (!rookie || !kept.has(selection.rookieId)) errors.push('The free rookie must be a kept player on your roster.');
        else if (isMinor(rookie)) errors.push('Minor-bench players are already free. Choose a different rookie.');
        if (!selection.rookieDeclared || selection.rookieSeason !== CALDER_SEASON) errors.push(`Confirm that your free rookie was eligible for the ${CALDER_SEASON_LABEL} Calder Memorial Trophy.`);
        if (currentRookieReview(reviews[selection.rookieId])?.status === 'rejected') errors.push('The admin has rejected this rookie declaration. Keep this player in a regular slot or choose another rookie.');
    }
    for (const id of kept) {
        const player = players.get(id);
        if (!player || isMinor(player) || id === selection.rookieId) continue;
        regularCount++;
        const position = keeperPosition(player);
        if (position === 'OTHER') errors.push(`The position for ${player.name} needs admin review before they can be kept.`);
        else counts[position]++;
    }
    for (const position of ['F', 'D', 'G'] as const) {
        if (counts[position] > KEEPER_LIMITS[position]) errors.push(`Keep no more than ${KEEPER_LIMITS[position]} ${POSITION_LABELS[position].toLowerCase()} in regular slots.`);
    }
    if (regularCount > KEEPER_TOTAL_LIMIT) errors.push(`Keep no more than ${KEEPER_TOTAL_LIMIT} regular players total, including goalies. Minors and the free rookie do not count.`);
    return { valid: errors.length === 0, errors, counts, regularCount, keptIds: [...kept], minorCount: roster.filter(isMinor).length };
}

export function remainingKeeperAllowance(validation: Pick<ReturnType<typeof validateKeepers>, 'regularCount' | 'counts'>, rookieId: string | null) {
    const regular = Math.max(0, KEEPER_TOTAL_LIMIT - validation.regularCount);
    const positions = {
        F: Math.min(regular, Math.max(0, KEEPER_LIMITS.F - validation.counts.F)),
        D: Math.min(regular, Math.max(0, KEEPER_LIMITS.D - validation.counts.D)),
        G: Math.min(regular, Math.max(0, KEEPER_LIMITS.G - validation.counts.G)),
    };
    return { regular, positions, rookie: rookieId === null };
}

// Keep the owner's unsubmitted choices across a refresh, except for players who left
// or a free rookie who is now already kept automatically on the minor bench.
export function refreshedSelection(roster: KeeperPlayer[], selection: KeeperSelection): KeeperSelection {
    const keptIds = new Set(selection.keptIds.filter(id => roster.some(player => player.id === id)));
    for (const player of roster) if (isMinor(player)) keptIds.add(player.id);
    const rookieId = roster.some(player => player.id === selection.rookieId && !isMinor(player)) ? selection.rookieId : null;
    return { keptIds: [...keptIds], rookieId, rookieDeclared: Boolean(rookieId && selection.rookieDeclared), rookieSeason: rookieId ? selection.rookieSeason : null };
}

export function submissionStatus(submission: KeeperSubmission | null, currentRoster?: KeeperPlayer[]) {
    if (!submission) return 'missing' as const;
    if (!validateKeepers(submission.roster, submission, submission.rookieReviews).valid) return 'invalid' as const;
    if (currentRoster && rosterFingerprint(currentRoster) !== rosterFingerprint(submission.roster)) return 'roster_changed' as const;
    return 'submitted' as const;
}
