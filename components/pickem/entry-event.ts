// The slate tells the who's-in list when the signed-in owner's entry goes in or out, so their slab lights at once.
export const ENTRY_EVENT = 'pickem:entry';

export interface EntryEvent {
    seasonYear: number;
    week: number;
    franchiseId: number;
    /** whether the entry now has a Pick'em pick on every matchup */
    in: boolean;
}

export function announceEntry(detail: EntryEvent) {
    window.dispatchEvent(new CustomEvent<EntryEvent>(ENTRY_EVENT, { detail }));
}

// The slate tells the Pick'em tabs which entry is the signed-in owner's once their picks load, so the Leaderboard tab can
// show the owner's place (pickem-views.tsx).
export const OWNER_EVENT = 'pickem:owner';

export interface OwnerEvent {
    franchiseId: number;
}

export function announceOwner(franchiseId: number) {
    window.dispatchEvent(new CustomEvent<OwnerEvent>(OWNER_EVENT, { detail: { franchiseId } }));
}
