import { getFranchiseCards } from '@/lib/data/league';

/** Each franchise's current owner, by franchise id: the strips name them for the season being played */
export const currentOwners = async (): Promise<Record<number, string>> =>
    Object.fromEntries((await getFranchiseCards()).flatMap(card => card.Owner ? [[card.ID, card.Owner] as const] : []));
