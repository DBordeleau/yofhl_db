// The two views a phone or tablet switches between with the Pick'em tabs (pickem-views.tsx), and the ids that tie each
// tab to its panel. A plain module, so the server-rendered page and the client tabs share them.

export type PickemView = 'picks' | 'leaderboard';

export const VIEW_PANEL: Record<PickemView, string> = { picks: 'pickem-picks', leaderboard: 'pickem-board' };
export const VIEW_TAB: Record<PickemView, string> = { picks: 'pickem-tab-picks', leaderboard: 'pickem-tab-board' };
