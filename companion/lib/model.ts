import { draftTurn, STARTERS, validatePlan, type DraftPlan } from './order';

export const POSITIONS = ['LW', 'C', 'RW', 'D', 'G'] as const;
export const SKATER_GAMES = 84;
export type Position = typeof POSITIONS[number];
export interface Stats {
    games: number | null;
    points: number | null;
    perGame: number | null;
    categories: Record<string, number | null>;
}
export interface Player {
    id: string; name: string; team: string; positions: Position[];
    available: boolean; age: number | null; note: string;
    previous: Stats | null; projected: Stats | null;
    gamesPlayed?: { '2024-25': number | null; '2025-26': number | null };
    nhlBefore2024?: boolean;
}
export interface Snapshot {
    version: 1; season: string; fetchedAt: string;
    players: Player[]; keeperIds: string[]; minorIds: string[];
    keeperSavedAt: string; warnings: string[];
}
export interface Pick { id: string; mine: boolean; slot?: number; team?: string }
export interface Draft {
    version: 1; keeperIds: string[]; minorIds: string[]; picks: Pick[];
    poolIds: string[]; poolLabel: string; importedAt: string | null; plan?: DraftPlan;
    doNotDraftIds?: string[]; targetIds?: string[];
}
export interface Workspace { snapshot: Snapshot; draft: Draft }
export interface Valuation {
    points: number | null; perGame: number | null; games: number | null;
    projectedPoints: number | null; confidence: string; explanation: string;
}
export const cleanId = (id: string) => id.replace(/\*/g, '').trim();
export const normalizeName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const positionsFrom = (value: string): Position[] => [...new Set(value.toUpperCase().split(/[^A-Z]+/).filter((p): p is Position => POSITIONS.includes(p as Position)))];

export function initialDraft(snapshot: Snapshot): Draft {
    return { version: 1, keeperIds: [...snapshot.keeperIds], minorIds: [...snapshot.minorIds], picks: [],
        poolIds: snapshot.players.filter(p => p.available).map(p => p.id), poolLabel: 'Fantrax free agents', importedAt: null };
}

export function mergeSnapshot(current: Workspace | null, snapshot: Snapshot): Workspace {
    parseWorkspace({ snapshot, draft: initialDraft(snapshot) });
    if (!current) return { snapshot, draft: initialDraft(snapshot) };
    const ids = new Set(snapshot.players.map(p => p.id));
    return parseWorkspace({ snapshot: { ...snapshot, players: [...snapshot.players, ...current.snapshot.players.filter(p => !ids.has(p.id))] },
        draft: { ...current.draft, poolIds: current.draft.importedAt ? current.draft.poolIds : snapshot.players.filter(p => p.available).map(p => p.id) } });
}

function observedGoalieBonus(stats: Stats): number | null {
    const { W, 'OL+ShL': overtime, SHO } = stats.categories;
    if (!stats.games || stats.points === null || W == null || overtime == null || SHO == null) return null;
    return Math.max(0, Math.min(10, (stats.points - 6 * W - 2 * overtime - 4 * SHO) / stats.games));
}

export function goalieBaseline(players: Player[]): number {
    let bonus = 0, games = 0;
    for (const player of players) {
        if (!player.positions.includes('G') || !player.previous || (player.previous.games ?? 0) < 10) continue;
        const rate = observedGoalieBonus(player.previous);
        if (rate !== null) { bonus += rate * player.previous.games!; games += player.previous.games!; }
    }
    return games ? bonus / games : 0;
}

export function valuePlayer(player: Player, baseline: number, workload: 'board' | 'projected' = 'board'): Valuation {
    const prev = player.previous, proj = player.projected;
    const goalie = player.positions.includes('G');
    // shortcut: Recent 40-game seasons stand in for an established NHL role; use roster-role data if available.
    const establishedSkater = !goalie && Math.max(player.gamesPlayed?.['2024-25'] ?? 0, player.gamesPlayed?.['2025-26'] ?? prev?.games ?? 0) >= 40;
    const fullSeason = establishedSkater && workload === 'board';
    const lastRate = prev?.perGame ?? (prev?.games && prev.points !== null ? prev.points / prev.games : null);
    let projectedPoints = proj?.points ?? null;
    let explanation = goalie ? '60% projected scoring rate + 40% previous scoring rate, multiplied by projected appearances.'
        : `60% projected scoring rate + 40% previous scoring rate, multiplied by ${fullSeason ? '84 games for the board comparison' : "Fantrax's projected NHL games"}. Small historical samples receive less weight. Games-missed flags do not add a penalty.`;
    if (goalie && proj?.games && proj.categories.W != null && proj.categories.SHO != null) {
        const observed = prev ? observedGoalieBonus(prev) : null;
        const reliability = observed === null ? 0 : Math.min(1, (prev?.games ?? 0) / 25);
        const bonus = reliability * (observed ?? baseline) + (1 - reliability) * baseline;
        const overtime = proj.categories['OL+ShL'] || (prev?.games && prev.categories['OL+ShL'] != null ? prev.categories['OL+ShL'] / prev.games * proj.games : 0);
        // Fantrax applies a season-average SV% band to every projected game; use observed per-game bonuses instead.
        projectedPoints = 6 * proj.categories.W + 4 * proj.categories.SHO + 2 * overtime + bonus * proj.games;
        explanation = 'Goalie estimate uses projected wins/shutouts, historical per-game SV% bonuses and overtime losses, then blends scoring rates 60/40. Small bonus samples shrink toward the league average. No games-limit adjustment.';
    }
    if (!fullSeason && proj?.games === 0) return { points: 0, perGame: null, games: 0, projectedPoints, confidence: 'No projected games', explanation: 'Fantrax projects no NHL games. Previous production is shown for reference.' };
    if (proj?.games && projectedPoints !== null) {
        const historyWeight = lastRate === null ? 0 : 0.4 * Math.min(1, (prev?.games ?? 25) / 25);
        const perGame = (1 - historyWeight) * projectedPoints / proj.games + historyWeight * (lastRate ?? 0);
        const games = fullSeason ? SKATER_GAMES : proj.games;
        if (fullSeason) projectedPoints = projectedPoints / proj.games * SKATER_GAMES;
        return { points: perGame * games, perGame, games, projectedPoints,
            confidence: !goalie && !establishedSkater ? 'Limited NHL history' : historyWeight === 0 ? 'No past stats' : (prev?.games ?? 0) < 25 ? 'Limited history' : '', explanation };
    }
    if (fullSeason && lastRate !== null) return { points: lastRate * SKATER_GAMES, perGame: lastRate, games: SKATER_GAMES, projectedPoints: null,
        confidence: 'History only', explanation: 'No usable projected scoring rate. At least 40 NHL games in either recent season qualifies for last season’s points per game × 84 games. Games-missed flags do not reduce value.' };
    if (workload === 'projected' && !goalie && proj?.games && lastRate !== null) return { points: lastRate * proj.games, perGame: lastRate, games: proj.games, projectedPoints: null,
        confidence: 'History only', explanation: 'No projected scoring rate. Last season’s points per game multiplied by projected NHL games.' };
    if (!fullSeason && prev?.points !== null && prev?.points !== undefined) return { points: prev.points, perGame: lastRate, games: prev.games, projectedPoints,
        confidence: 'No projection', explanation: 'No usable projection. Using last season’s total and workload.' };
    return { points: null, perGame: null, games: null, projectedPoints, confidence: 'No scoring data', explanation: 'No usable history or projection. This player remains searchable and draftable.' };
}

// League rule of thumb for a free rookie keep: fewer than 25 NHL games across the last two seasons. Unknown history never qualifies.
export const PROSPECT_GAMES = 25;
export function recentGames(player: Player): number | null {
    const history = player.gamesPlayed;
    return history && history['2024-25'] !== null && history['2025-26'] !== null ? history['2024-25'] + history['2025-26'] : null;
}
export const isProspect = (player: Player) => { const games = recentGames(player); return games !== null && games < PROSPECT_GAMES; };

export function averageMissedGames(player: Player): number | null {
    const history = player.gamesPlayed;
    if (player.positions.includes('G') || !history || history['2024-25'] === null || history['2025-26'] === null) return null;
    if (history['2024-25'] === 0 && player.nhlBefore2024 !== true) return null;
    return (Math.max(0, 82 - history['2024-25']) + Math.max(0, 82 - history['2025-26'])) / 2;
}

export function isInjuryProne(player: Player): boolean {
    const missed = averageMissedGames(player);
    return missed !== null && missed > 10;
}

// Fill starting roles before depth. The final slot accepts a fifth D or an extra forward.
const SLOTS: { label: Position | 'FLEX'; eligible: readonly Position[] }[] = [
    ...(['LW', 'C', 'RW', 'LW', 'C', 'RW', 'D', 'D', 'D', 'D', 'G', 'G', 'LW', 'C', 'RW'] as Position[])
        .map(label => ({ label, eligible: [label] })),
    { label: 'FLEX', eligible: ['LW', 'C', 'RW', 'D'] },
];
export function assignRoster(players: Player[]) {
    const assigned = new Map<string, number>();
    function fill(slot: number, visited: Set<string>): boolean {
        const eligible = players.filter(p => p.positions.some(pos => SLOTS[slot].eligible.includes(pos)))
            .sort((a, b) => Number(assigned.has(a.id)) - Number(assigned.has(b.id)) || a.positions.length - b.positions.length);
        for (const player of eligible) {
            if (visited.has(player.id)) continue;
            visited.add(player.id);
            const previous = assigned.get(player.id);
            if (previous === undefined || fill(previous, visited)) { assigned.set(player.id, slot); return true; }
        }
        return false;
    }
    for (let slot = 0; slot < SLOTS.length; slot++) fill(slot, new Set());
    const roles = new Map<string, Position>();
    for (const player of players) {
        const slot = assigned.get(player.id);
        if (slot !== undefined) roles.set(player.id, SLOTS[slot].label === 'FLEX' ? player.positions.find(p => p !== 'G')! : SLOTS[slot].label as Position);
    }
    const counts = Object.fromEntries(POSITIONS.map(p => [p, [...roles.values()].filter(v => v === p).length])) as Record<Position, number>;
    return { roles, counts, filled: assigned.size };
}

export function rosterPlayers(snapshot: Snapshot, draft: Draft) {
    const ids = new Set([...draft.keeperIds, ...draft.picks.filter(p => p.mine).map(p => p.id)]);
    const minors = new Set(draft.minorIds);
    return snapshot.players.filter(p => ids.has(p.id) && !minors.has(p.id));
}
export function availablePlayers(snapshot: Snapshot, draft: Draft) {
    const pool = new Set(draft.poolIds), taken = new Set([...draft.keeperIds, ...draft.picks.map(p => p.id)]);
    return snapshot.players.filter(p => pool.has(p.id) && !taken.has(p.id));
}
// shortcut: one share of a bench player's points reaches a daily lineup when a starter is idle; replace with lineup-usage data if available.
export const BENCH_WEIGHT = 0.35;
export const startersFilled = (counts: Record<Position, number>) => POSITIONS.reduce((total, p) => total + Math.min(counts[p], STARTERS[p]), 0);
export interface RankedPlayer { player: Player; value: Valuation; recommendationValue: Valuation; doNotDraft: boolean; fitScore: number | null; slotWeight: number | null; reason: string; role: Position | null }
export function rankPlayers(snapshot: Snapshot, draft: Draft): RankedPlayer[] {
    const roster = rosterPlayers(snapshot, draft), before = assignRoster(roster), baseline = goalieBaseline(snapshot.players);
    const avoided = new Set(draft.doNotDraftIds ?? []);
    const rated = availablePlayers(snapshot, draft).map(player => ({ player, value: valuePlayer(player, baseline), recommendationValue: valuePlayer(player, baseline, 'projected') }));
    return rated.map(({ player, value, recommendationValue }) => {
        const result = { player, value, recommendationValue, doNotDraft: avoided.has(player.id), fitScore: null as number | null, slotWeight: null as number | null, reason: '', role: null as Position | null };
        if (result.doNotDraft) return { ...result, reason: 'Do not draft' };
        if (recommendationValue.points === null || recommendationValue.points <= 0) return { ...result, reason: recommendationValue.games === 0 ? 'No projected games' : 'No rating' };
        if (roster.length >= 16) return { ...result, reason: 'Roster full' };
        if (player.positions.includes('G') && roster.filter(p => p.positions.includes('G')).length >= 2) return { ...result, reason: 'Goalies full' };
        const after = assignRoster([...roster, player]);
        if (after.filled <= before.filled) return { ...result, reason: 'Reserve other positions' };
        const position = after.roles.get(player.id)!;
        // A multi-position player can open a starting role by moving a teammate, so compare total starters filled.
        const starter = startersFilled(after.counts) > startersFilled(before.counts);
        const slotWeight = starter ? 1 : BENCH_WEIGHT;
        const reason = starter ? `Starter ${position} ${Math.min(after.counts[position], STARTERS[position])}/${STARTERS[position]}` : `Bench ${position}`;
        // evaluateDraft replaces this with value over replacement and the cost of waiting.
        return { ...result, fitScore: recommendationValue.points * slotWeight, slotWeight, reason, role: position };
    }).sort((a, b) => (b.value.points ?? -1) - (a.value.points ?? -1) || a.player.name.localeCompare(b.player.name));
}

export function recordPick(draft: Draft, player: Player, mine?: boolean, toMinors = false): Draft {
    const turn = draftTurn(draft).current;
    if (draft.plan) {
        if (!turn) throw new Error('The entered draft order is complete. Add more picks to continue.');
        if (mine !== undefined && mine !== (turn.team === draft.plan.myTeam)) throw new Error(`It is ${turn.team}’s pick. Record the current turn or edit the order.`);
        mine = turn.team === draft.plan.myTeam;
    }
    if (mine === undefined) throw new Error('Choose Mine or Taken to record a manual pick.');
    if (!draft.poolIds.includes(player.id) || draft.keeperIds.includes(player.id) || draft.picks.some(p => p.id === player.id)) throw new Error('This player is not available.');
    if (toMinors && !mine) throw new Error('Only your own picks can go to minors.');
    if (toMinors && draft.minorIds.length >= 2) throw new Error('Both minor slots are full.');
    if (mine && !toMinors && draft.keeperIds.filter(id => !draft.minorIds.includes(id)).length + draft.picks.filter(p => p.mine && !draft.minorIds.includes(p.id)).length >= 16) throw new Error('Your playing roster has 16 players. Move a player to minors before adding another.');
    return { ...draft, picks: [...draft.picks, { id: player.id, mine, ...(draft.plan && turn ? { slot: turn.slot, team: turn.team } : {}) }],
        ...(toMinors ? { minorIds: [...draft.minorIds, player.id] } : {}) };
}

// Validate both browser storage and imported backups before replacing a working draft.
export function parseWorkspace(input: unknown): Workspace {
    const fail = () => { throw new Error('This is not a valid draft companion backup. Your current draft has not changed.'); };
    if (!input || typeof input !== 'object') return fail();
    const { snapshot, draft } = input as Workspace;
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.players) || !snapshot.players.length || snapshot.players.length > 20000 ||
        !Array.isArray(snapshot.warnings) || !snapshot.warnings.every(x => typeof x === 'string') || typeof snapshot.season !== 'string' ||
        !Number.isFinite(Date.parse(snapshot.fetchedAt)) || typeof snapshot.keeperSavedAt !== 'string' || !draft || draft.version !== 1) return fail();
    const validNumber = (v: unknown) => v === null || typeof v === 'number' && Number.isFinite(v) && v >= 0;
    const validStats = (s: Stats | null) => s === null || !!s && validNumber(s.games) && validNumber(s.points) && validNumber(s.perGame) &&
        !!s.categories && typeof s.categories === 'object' && !Array.isArray(s.categories) && Object.values(s.categories).every(validNumber);
    const validHistory = (history: Player['gamesPlayed']) => history === undefined || !!history && typeof history === 'object' && !Array.isArray(history) &&
        ['2024-25', '2025-26'].every(season => {
            const games = history[season as keyof NonNullable<Player['gamesPlayed']>];
            return games === null || Number.isInteger(games) && games >= 0 && games <= 100;
        });
    for (const p of snapshot.players) if (!p || typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(p.id) || typeof p.name !== 'string' || !p.name.trim() ||
        typeof p.team !== 'string' || typeof p.note !== 'string' || typeof p.available !== 'boolean' || !validNumber(p.age) ||
        !Array.isArray(p.positions) || !p.positions.length || new Set(p.positions).size !== p.positions.length || !p.positions.every(v => POSITIONS.includes(v)) || !validStats(p.previous) || !validStats(p.projected) || !validHistory(p.gamesPlayed) ||
        (p.nhlBefore2024 !== undefined && typeof p.nhlBefore2024 !== 'boolean')) return fail();
    const ids = new Set(snapshot.players.map(p => p.id));
    const validIds = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string' && ids.has(v)) && new Set(value).size === value.length;
    if (ids.size !== snapshot.players.length || !validIds(snapshot.keeperIds) || !validIds(snapshot.minorIds) || !snapshot.minorIds.every(id => snapshot.keeperIds.includes(id)) ||
        !validIds(draft.keeperIds) || !validIds(draft.minorIds) || !validIds(draft.poolIds) || (draft.doNotDraftIds !== undefined && !validIds(draft.doNotDraftIds)) || (draft.targetIds !== undefined && !validIds(draft.targetIds)) || typeof draft.poolLabel !== 'string' ||
        !(draft.importedAt === null || typeof draft.importedAt === 'string' && Number.isFinite(Date.parse(draft.importedAt))) ||
        !Array.isArray(draft.picks) || !draft.picks.every(p => p && ids.has(p.id) && typeof p.mine === 'boolean') ||
        new Set(draft.picks.map(p => p.id)).size !== draft.picks.length || draft.picks.some(p => draft.keeperIds.includes(p.id)) ||
        !draft.minorIds.every(id => draft.keeperIds.includes(id) || draft.picks.some(p => p.id === id && p.mine)) || draft.minorIds.length > 2 ||
        draft.keeperIds.length + draft.picks.filter(p => p.mine).length - draft.minorIds.length > 16) return fail();
    if (draft.plan !== undefined) {
        validatePlan(draft.plan);
        if (draft.picks.some(p => !Number.isInteger(p.slot) || p.slot! < 0 || p.slot! >= draft.plan!.order.length ||
            p.team !== draft.plan!.order[p.slot!] || p.mine !== (p.team === draft.plan!.myTeam)) ||
            new Set(draft.picks.map(p => p.slot)).size !== draft.picks.length) return fail();
    } else if (draft.picks.some(p => p.slot !== undefined || p.team !== undefined)) return fail();
    return { snapshot, draft };
}
