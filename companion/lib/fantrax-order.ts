import { assignRoster, type Player } from './model';
import { validatePlan, type DraftPlan, type PositionCounts } from './order';

const VARROCK_TEAM_ID = '7jmn4yymmutybt24';

// Opponents' current Fantrax playing rosters (minors excluded), keyed by team name. Varrock uses its own saved roster.
export function parseFantraxRosters(infoInput: unknown, rostersInput: unknown): Record<string, string[]> {
    const teams = (infoInput as { teamInfo?: Record<string, { name: string }> })?.teamInfo;
    const rosters = (rostersInput as { rosters?: Record<string, { rosterItems?: { id: string; status: string }[] }> })?.rosters;
    if (!teams || !rosters || typeof rosters !== 'object') throw new Error('Fantrax returned invalid rosters.');
    return Object.fromEntries(Object.entries(rosters).filter(([id]) => id !== VARROCK_TEAM_ID && typeof teams[id]?.name === 'string').map(([id, roster]) => {
        if (!Array.isArray(roster.rosterItems)) throw new Error('Fantrax returned invalid rosters.');
        return [teams[id].name.trim(), roster.rosterItems.filter(item => item && typeof item.id === 'string' && item.status !== 'MINORS').map(item => item.id.replace(/\*/g, ''))];
    }));
}

// Assign each rostered player once, like the forecast does. Players already recorded as draft picks are counted by the draft log instead.
export function keeperCounts(players: Player[], rosters: Record<string, string[]>, drafted: Set<string>): Record<string, PositionCounts> {
    const byId = new Map(players.map(p => [p.id, p]));
    return Object.fromEntries(Object.entries(rosters).map(([team, ids]) => [team,
        assignRoster(ids.filter(id => !drafted.has(id)).map(id => byId.get(id)).filter((p): p is Player => !!p)).counts]));
}

export function parseFantraxOrder(infoInput: unknown, resultsInput: unknown, fetchedAt = new Date().toISOString()): DraftPlan {
    const fail = () => { throw new Error('Fantrax returned an incomplete or invalid draft order. Your current order has been kept.'); };
    if (!infoInput || typeof infoInput !== 'object' || !resultsInput || typeof resultsInput !== 'object') return fail();
    const info = infoInput as { seasonYear?: number; teamInfo?: Record<string, { name: string }> };
    const results = resultsInput as { draftPicks?: { pick: number; round: number; pickInRound: number; teamId: string }[] };
    if (info.seasonYear !== 2026 || !info.teamInfo || typeof info.teamInfo !== 'object' || !Object.hasOwn(info.teamInfo, VARROCK_TEAM_ID) ||
        !Array.isArray(results.draftPicks) || !results.draftPicks.length || results.draftPicks.length > 500) return fail();
    const teams = info.teamInfo;
    for (const pick of results.draftPicks) {
        if (!pick || !Number.isInteger(pick.pick) || pick.pick < 1 || !Number.isInteger(pick.round) || pick.round < 1 ||
            !Number.isInteger(pick.pickInRound) || pick.pickInRound < 1 || typeof pick.teamId !== 'string' ||
            !Object.hasOwn(teams, pick.teamId) || typeof teams[pick.teamId]?.name !== 'string') return fail();
    }
    // Explicit overall pick numbers include lottery changes and trades; draftType/base draftOrder do not.
    const picks = [...results.draftPicks].sort((a, b) => a.pick - b.pick);
    if (picks.some((pick, index) => pick.pick !== index + 1)) return fail();
    const names = [...new Set(picks.map(p => p.teamId))].map(id => teams[id].name.trim());
    if (new Set(names).size !== names.length || typeof teams[VARROCK_TEAM_ID].name !== 'string') return fail();
    return validatePlan({ order: picks.map(p => teams[p.teamId].name.trim()), myTeam: teams[VARROCK_TEAM_ID].name.trim(), keepers: {}, fantraxFetchedAt: fetchedAt });
}
