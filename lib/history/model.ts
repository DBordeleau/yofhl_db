export type HistoryKind = 'all' | 'trade' | 'free_agent' | 'draft';
export interface HistoryScope { franchiseId?: number; playerId?: string }
export interface HistoryTeam { id: number; name: string; abbreviation: string; logo: string | null }
export interface HistoryAsset {
    id: string;
    playerId: string | null;
    label: string;
    assetKind: 'player' | 'pick';
    action: 'trade' | 'claim' | 'drop' | 'draft';
    from: HistoryTeam | null;
    to: HistoryTeam | null;
}
export interface HistoryEvent {
    id: string;
    kind: 'trade' | 'free_agent' | 'draft';
    season: number;
    date: string;
    assets: HistoryAsset[];
    round: number | null;
    overall: number | null;
}
export interface HistoryPage { events: HistoryEvent[]; total: number; page: number; pages: number }
export interface DraftSelection {
    year: number;
    overall: number;
    round: number;
    pick: number;
    playerId: string | null;
    player: string | null;
    positions: string;
    points: number | null;
    fpg: number | null;
}
export interface SeasonDraftSelection extends DraftSelection {
    franchiseId: number | null;
    teamName: string | null;
    teamAbbreviation: string | null;
    teamLogo: string | null;
}
export interface FranchiseHonors {
    primeMinisters: { year: number; points: number }[];
    awards: { year: number; name: string; label: string; description: string; playerId: string; player: string }[];
}
