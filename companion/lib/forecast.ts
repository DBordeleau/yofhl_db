import { assignRoster, goalieBaseline, POSITIONS, SKATER_GAMES, rankPlayers, rosterPlayers, valuePlayer, type Draft, type Player, type Position, type RankedPlayer, type Snapshot } from './model';
import { draftTurn, TARGETS } from './order';
import { buildTiers, isStrongBreak, TIER_DEPTH, typicalGap, type Tier } from './tiers';

export interface PickTiming {
    atPick: number; atNext: number | null;
}
export interface Alternative {
    player: Player; points: number; perGame: number | null; gap: number; perGameGap: number; tierBreak?: boolean;
}
// Recommendation context from the simulated rest of the draft, in projected-games points.
export interface Outlook {
    replacement: number; overReplacement: number;
    wait: number; waitCost: number; waitSlot: number | null;
}
export interface DraftCandidate extends RankedPlayer {
    alternative?: Alternative;
    nextByPosition?: Partial<Record<Position, Alternative>>;
    timing?: PickTiming;
    outlook?: Outlook;
}
interface DepthCandidate extends RankedPlayer {
    next?: Alternative;
    lossFromBest: number;
    perGameLossFromBest: number;
}
export interface PositionDepth {
    position: Position; players: DepthCandidate[]; nearTop: number;
    cliff: { after: Player; drop: number } | null;
    atPick: number | null; atNext: number | null;
}

const TRIALS = 64;

function alternativeTo(from: RankedPlayer, to: RankedPlayer, valuation: 'value' | 'recommendationValue' = 'value'): Alternative {
    const gap = Math.max(0, from[valuation].points! - to[valuation].points!);
    return { player: to.player, points: to[valuation].points!, perGame: to[valuation].perGame,
        gap, perGameGap: gap / SKATER_GAMES };
}

function random(seed: number) {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// Tiers cover the whole draft pool, including players already picked, so groups stay fixed as the draft goes on.
function positionTiers(snapshot: Snapshot, draft: Draft, ranked: RankedPlayer[]) {
    const takenBy = new Map(draft.picks.map(p => [p.id, p.team ?? (p.mine ? 'Varrock' : 'Taken')]));
    const pool = new Set(draft.poolIds), keepers = new Set(draft.keeperIds), board = new Map(ranked.map(r => [r.player.id, r.value.points]));
    const baseline = goalieBaseline(snapshot.players);
    const members = snapshot.players.filter(p => pool.has(p.id) && !keepers.has(p.id) && (board.has(p.id) || takenBy.has(p.id)))
        .map(player => ({ player, points: (board.has(player.id) ? board.get(player.id) : valuePlayer(player, baseline).points) ?? 0, takenBy: takenBy.get(player.id) ?? null }))
        .filter(m => m.points > 0).sort((a, b) => b.points - a.points || a.player.name.localeCompare(b.player.name));
    const tiers = new Map(POSITIONS.map(position => [position, buildTiers(position, members.filter(m => m.player.positions.includes(position)).slice(0, TIER_DEPTH))]));
    const tierOf = new Map<string, Tier>();
    for (const list of tiers.values()) for (const tier of list) for (const m of tier.members) tierOf.set(`${tier.position}:${m.player.id}`, tier);
    return { tiers, tierOf };
}

export function evaluateDraft(snapshot: Snapshot, draft: Draft) {
    const ranked: DraftCandidate[] = rankPlayers(snapshot, draft);
    const rated = ranked.filter(r => (r.value.points ?? 0) > 0);
    const byPosition = new Map(POSITIONS.map(p => [p, rated.filter(r => r.player.positions.includes(p))]));
    const recommendationPool = ranked.filter(r => !r.doNotDraft && (r.recommendationValue.points ?? 0) > 0)
        .sort((a, b) => b.recommendationValue.points! - a.recommendationValue.points! || a.player.name.localeCompare(b.player.name));
    const recommendationByPosition = new Map(POSITIONS.map(p => [p, recommendationPool.filter(r => r.player.positions.includes(p))]));
    for (const row of recommendationPool) {
        if (!row.role) continue;
        const alternative = recommendationByPosition.get(row.role)!.find(other => other.player.id !== row.player.id);
        if (alternative) row.alternative = alternativeTo(row, alternative, 'recommendationValue');
        // Without a simulated draft, the next eligible player stands in for the cost of waiting.
        if (row.fitScore !== null) row.fitScore = row.slotWeight! * (row.recommendationValue.points! + (row.alternative?.gap ?? 0));
    }
    const depth: PositionDepth[] = POSITIONS.map(position => {
        const players = byPosition.get(position)!;
        const typical = typicalGap(players.map(row => row.value.points!));
        for (let i = 0; i < players.length - 1; i++) {
            const alternative = alternativeTo(players[i], players[i + 1]);
            players[i].nextByPosition ??= {};
            players[i].nextByPosition![position] = { ...alternative, tierBreak: isStrongBreak(alternative.gap, typical) };
        }
        let cliff: PositionDepth['cliff'] = null;
        for (let i = 0; i < Math.min(players.length - 1, 19); i++) {
            const drop = players[i].value.points! - players[i + 1].value.points!;
            if (drop > (cliff?.drop ?? 0)) cliff = { after: players[i].player, drop };
        }
        return { position, players: players.slice(0, 20).map(row => ({ ...row,
            next: row.nextByPosition?.[position],
            lossFromBest: players[0].value.points! - row.value.points!, perGameLossFromBest: (players[0].value.points! - row.value.points!) / SKATER_GAMES })),
            nearTop: players.filter(r => r.value.points! >= (players[0]?.value.points ?? 0) * 0.9).length,
            cliff, atPick: null, atNext: null };
    });
    const { tiers, tierOf } = positionTiers(snapshot, draft, ranked);
    const turn = draftTurn(draft);
    const bestAvailable = ranked.find(r => !r.doNotDraft && (r.value.points ?? 0) > 0);
    const plan = draft.plan;
    if (!plan || turn.first === null) return { ranked, bestAvailable, depth, tiers, tierOf, turn, trials: 0, unknownTeams: [] as string[] };

    const byId = new Map(snapshot.players.map(p => [p.id, p]));
    const teams = [...new Set(plan.order)].filter(team => team !== plan.myTeam);
    const baseRosters = new Map(teams.map(team => {
        const counts = Object.hasOwn(plan.keepers, team) ? plan.keepers[team] : null;
        const roster: Player[] = [];
        // Counts represent active keepers already assigned once to a position, not Fantrax's pre-cut roster.
        if (counts) for (const position of POSITIONS) for (let i = 0; i < counts[position]; i++) {
            roster.push({ id: `keeper-${position}-${i}`, name: '', positions: [position], team: '', available: false, age: null, note: '', previous: null, projected: null });
        }
        roster.push(...draft.picks.filter(p => p.team === team).map(p => byId.get(p.id)!));
        return [team, roster] as const;
    }));
    baseRosters.set(plan.myTeam, rosterPlayers(snapshot, draft));
    // Match each roster once; simulated picks then update counts incrementally, which keeps 64 full drafts fast.
    const baseCounts = new Map([...baseRosters].map(([team, roster]) => [team, assignRoster(roster).counts]));
    const unknownTeams = [...new Set(turn.remaining.filter(p => p.slot < (turn.next ?? turn.first!)).map(p => p.team))]
        .filter(team => team !== plan.myTeam && !Object.hasOwn(plan.keepers, team));
    const totals = new Map(rated.map(r => [r.player.id, { first: 0, next: 0 }]));
    const pointSums = new Map(POSITIONS.map(p => [p, { first: 0, next: 0 }]));
    const outlookSums = new Map(recommendationPool.filter(r => r.role).map(r => [r.player.id, { replacement: 0, wait: 0 }]));

    for (let trial = 0; trial < TRIALS; trial++) {
        const rng = random(104729 + trial * 7919), taken = new Set<string>();
        const teamCounts = new Map([...baseCounts].map(([team, counts]) => [team, { ...counts }]));
        function simulatePick(team: string) {
            const counts = teamCounts.get(team)!;
            const mine = team === plan!.myTeam, known = mine || Object.hasOwn(plan!.keepers, team);
            const candidates = new Map<string, DraftCandidate>();
            for (const list of byPosition.values()) {
                let found = 0;
                for (const row of list) if (!taken.has(row.player.id) && !(mine && row.doNotDraft)) {
                    candidates.set(row.player.id, row);
                    if (++found === 8) break;
                }
            }
            const choices = [...candidates.values()].map(row => {
                const preference = Math.max(...row.player.positions.map(p => {
                    if (p === 'G' && counts.G >= 2) return 0;
                    if (!known) return 1;
                    if (counts[p] >= TARGETS[p]) return 0.35;
                    if (p === 'D' && counts.D < 4 && counts.LW >= 2 && counts.C >= 2 && counts.RW >= 2) return 1.35;
                    return p === 'G' ? 1.1 : 1.15;
                }));
                return { row, score: row.value.points! * preference };
            }).filter(c => c.score > 0).sort((a, b) => b.score - a.score);
            if (!choices.length) return;
            // shortcut: draft choices vary around estimated points; calibrate this spread when real draft/ADP data is available.
            const temperature = Math.max(15, choices[0].score * 0.08);
            const weights = choices.map(c => Math.exp((c.score - choices[0].score) / temperature));
            let ticket = rng() * weights.reduce((a, b) => a + b, 0), selected = choices.at(-1)!;
            for (let i = 0; i < choices.length; i++) { ticket -= weights[i]; if (ticket <= 0) { selected = choices[i]; break; } }
            taken.add(selected.row.player.id);
            const role = selected.row.player.positions.reduce((a, b) => counts[b] / TARGETS[b] < counts[a] / TARGETS[a] ? b : a);
            counts[role]++;
        }
        // Add the best player we could still take at each candidate's role. The candidate is ours in this scenario:
        // if a simulated team took him, assume it took the next player at that role instead.
        function addBestRemaining(key: 'replacement' | 'wait') {
            const state = new Map(POSITIONS.map(p => {
                const [best, second] = recommendationByPosition.get(p)!.filter(r => !taken.has(r.player.id)).slice(0, 2);
                return [p, { id: best?.player.id ?? null, best: best?.recommendationValue.points ?? 0, second: second?.recommendationValue.points ?? 0 }];
            }));
            for (const row of recommendationPool) {
                if (!row.role) continue;
                const c = state.get(row.role)!;
                outlookSums.get(row.player.id)![key] += taken.has(row.player.id) || c.id === row.player.id ? c.second : c.best;
            }
        }
        for (const pick of turn.remaining) {
            if (pick.slot >= turn.first) break;
            simulatePick(pick.team);
        }
        const atFirst = new Set(rated.filter(r => !taken.has(r.player.id)).map(r => r.player.id));
        for (const p of POSITIONS) pointSums.get(p)!.first += byPosition.get(p)!.find(r => !taken.has(r.player.id))?.value.points ?? 0;
        if (turn.next !== null) {
            // These forecasts show what may remain if we choose elsewhere.
            for (const pick of turn.remaining) if (pick.slot > turn.first && pick.slot < turn.next) simulatePick(pick.team);
        }
        if (turn.next !== null) addBestRemaining('wait');
        const laterBest = new Map(POSITIONS.map(p => [p, byPosition.get(p)!.find(r => !taken.has(r.player.id))?.value.points ?? 0]));
        for (const p of POSITIONS) pointSums.get(p)!.next += laterBest.get(p)!;
        for (const row of rated) {
            const total = totals.get(row.player.id)!;
            if (!atFirst.has(row.player.id)) continue;
            total.first++;
            if (!taken.has(row.player.id)) total.next++;
        }
        // Finish the draft, including our own picks, to estimate the best player left for waivers at each position.
        for (const pick of turn.remaining) {
            if (pick.slot < turn.first || (turn.next !== null && pick.slot > turn.first && pick.slot < turn.next)) continue;
            simulatePick(pick.team);
        }
        addBestRemaining('replacement');
    }
    for (const row of rated) {
        const total = totals.get(row.player.id)!;
        row.timing = { atPick: total.first / TRIALS, atNext: turn.next === null ? null : total.next / TRIALS };
    }
    for (const d of depth) {
        d.atPick = pointSums.get(d.position)!.first / TRIALS;
        d.atNext = turn.next === null ? null : pointSums.get(d.position)!.next / TRIALS;
    }
    for (const row of recommendationPool) {
        if (!row.role || row.fitScore === null) continue;
        const sums = outlookSums.get(row.player.id)!, points = row.recommendationValue.points!;
        // Without another pick, waiting means taking the waiver option.
        const replacement = sums.replacement / TRIALS, wait = turn.next === null ? replacement : sums.wait / TRIALS;
        row.outlook = { replacement, overReplacement: points - replacement, wait, waitCost: Math.max(0, points - wait), waitSlot: turn.next };
        // Value over the post-draft waiver option, plus what this position loses if we wait until our next pick.
        row.fitScore = row.slotWeight! * (row.outlook.overReplacement + row.outlook.waitCost);
    }
    const timingById = new Map(rated.map(r => [r.player.id, r.timing!]));
    for (const list of tiers.values()) for (const tier of list) {
        const timings = tier.members.filter(m => !m.takenBy).map(m => timingById.get(m.player.id)).filter(t => !!t);
        tier.expected = { atPick: timings.reduce((sum, t) => sum + t.atPick, 0), atNext: turn.next === null ? null : timings.reduce((sum, t) => sum + t.atNext!, 0) };
    }
    return { ranked, bestAvailable, depth, tiers, tierOf, turn, trials: TRIALS, unknownTeams };
}
