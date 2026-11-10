// The league's materialized views in refresh order: each reads only views before it.
// Kept free of Next imports so the import scripts and test helpers can share it.
export const MATERIALIZED_VIEWS = ['season_results', 'player_careers', 'franchise_records'] as const;
export type MaterializedView = typeof MATERIALIZED_VIEWS[number];

export const inRefreshOrder = (views: readonly MaterializedView[]) => MATERIALIZED_VIEWS.filter(view => views.includes(view));
