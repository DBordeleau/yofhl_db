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
