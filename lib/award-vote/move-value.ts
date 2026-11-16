// GM of the Year's transaction summary for each franchise (GLOSSARY.md, "Move value"), from the season's imported
// transactions and draft and the snapshot's daily fantasy points (award_vote_daily_points). Pure: the candidates
// step reads its input and writes what it returns (team-summary.ts).
//
// A player's stints come from their moves in the season, in the order they were made; daily lineups are not read.
// A day's points belong to whoever holds the player after that day's moves: a move counts from the day it was made
// (or the regular season's first day, for a move before it) up to the day before the player's next move away from
// that franchise, or the regular season's last day.
//  - A claim or a trade is worth what the player scored at the franchise receiving them, until they next left it;
//    the franchise that traded them away lost the same.
//  - A drop costs what the player scored from the drop until the regular season ended or that franchise got them back.
import type { DateRange, DraftedPlayer, FreeAgentMove, TradedAsset, TradeSummary, TransactionSummary } from './model';

/** one asset of one of the season's transactions, as imported */
export interface SeasonMove {
    eventId: string;
    kind: 'trade' | 'free_agent';
    occurredAt: string;
    /** the Eastern date, `YYYY-MM-DD` */
    occurredOn: string;
    sourceRow: number;
    /** null for a draft pick */
    playerId: string | null;
    label: string;
    action: 'trade' | 'claim' | 'drop';
    fromFranchiseId: number | null;
    toFranchiseId: number | null;
    /** the franchises' team names that season */
    fromName: string | null;
    toName: string | null;
}

export interface MoveValueInput {
    regularSeason: DateRange;
    moves: SeasonMove[];
    /** each moved player's fantasy points on each regular-season day they scored */
    dailyPoints: { playerId: string; day: string; points: number }[];
    /** the season's draft selections, with each player's regular-season FPts */
    draft: (DraftedPlayer & { franchiseId: number })[];
}

/** how many claims, and how many drops, a franchise's summary shows in full */
export const MOVES_SHOWN = 5;

export const EMPTY_TRANSACTION_SUMMARY: TransactionSummary = { trades: [], claims: [], drops: [], otherMoves: null, draftClass: [] };

const hundredths = (value: number) => Math.round(value * 100) / 100;

/** the day after `day`, `YYYY-MM-DD` */
const dayAfter = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** each franchise's transaction summary, by franchise ID, for every franchise with a move or a draft pick */
export function transactionSummaries({ regularSeason, moves, dailyPoints, draft }: MoveValueInput): Map<number, TransactionSummary> {
    const scored = new Map<string, { day: string; points: number }[]>();
    for (const { playerId, day, points } of dailyPoints) scored.set(playerId, [...scored.get(playerId) ?? [], { day, points }]);
    /** what `playerId` scored from `from` (or the regular season's first day) up to the day before `until` */
    const pointsBetween = (playerId: string, from: string, until: string) => {
        const start = from > regularSeason.startDate ? from : regularSeason.startDate;
        return hundredths((scored.get(playerId) ?? [])
            .filter(({ day }) => day >= start && day < until && day <= regularSeason.endDate)
            .reduce((sum, { points }) => sum + points, 0));
    };

    const ordered = [...moves].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.sourceRow - b.sourceRow);
    const afterSeason = dayAfter(regularSeason.endDate);
    /**
     * the move value of the player move at `index` in `ordered`: until the player next left the receiving franchise,
     * or the dropping one got them back
     */
    const moveValue = (index: number, playerId: string) => {
        const move = ordered[index];
        const later = ordered.slice(index + 1).filter(next => next.playerId === playerId);
        const end = move.action === 'drop'
            ? later.find(next => next.action !== 'drop' && next.toFranchiseId === move.fromFranchiseId)
            : later.find(next => next.fromFranchiseId === move.toFranchiseId);
        return pointsBetween(playerId, move.occurredOn, end?.occurredOn ?? afterSeason);
    };

    const summaries = new Map<number, TransactionSummary>();
    const summaryOf = (franchiseId: number) => {
        if (!summaries.has(franchiseId)) summaries.set(franchiseId, structuredClone(EMPTY_TRANSACTION_SUMMARY));
        return summaries.get(franchiseId)!;
    };
    const claims = new Map<number, FreeAgentMove[]>();
    const drops = new Map<number, FreeAgentMove[]>();
    const trades = new Map<string, Map<number, TradeSummary>>();
    for (const [index, move] of ordered.entries()) {
        const { playerId } = move;
        if (move.action === 'trade') {
            const sides = trades.get(move.eventId) ?? new Map<number, TradeSummary>();
            trades.set(move.eventId, sides);
            const side = (franchiseId: number) => {
                if (!sides.has(franchiseId)) {
                    const trade: TradeSummary = { occurredOn: move.occurredOn, received: [], sent: [] };
                    sides.set(franchiseId, trade);
                    summaryOf(franchiseId).trades.push(trade);
                }
                return sides.get(franchiseId)!;
            };
            const asset = (team: string | null): TradedAsset => playerId !== null
                ? { kind: 'player', playerId, name: move.label, moveValue: moveValue(index, playerId), team: team ?? '' }
                : { kind: 'pick', label: move.label, team: team ?? '' };
            if (move.toFranchiseId !== null) side(move.toFranchiseId).received.push(asset(move.fromName));
            if (move.fromFranchiseId !== null) side(move.fromFranchiseId).sent.push(asset(move.toName));
            continue;
        }
        if (playerId === null) continue;
        const franchiseId = move.action === 'claim' ? move.toFranchiseId : move.fromFranchiseId;
        if (franchiseId === null) continue;
        const list = move.action === 'claim' ? claims : drops;
        list.set(franchiseId, [...list.get(franchiseId) ?? [], { playerId, name: move.label, occurredOn: move.occurredOn, moveValue: moveValue(index, playerId) }]);
    }

    const ranked = (list: FreeAgentMove[] = []) => [...list].sort((a, b) => b.moveValue - a.moveValue || a.occurredOn.localeCompare(b.occurredOn) || a.name.localeCompare(b.name));
    for (const franchiseId of new Set([...claims.keys(), ...drops.keys()])) {
        const summary = summaryOf(franchiseId);
        const [claimed, dropped] = [ranked(claims.get(franchiseId)), ranked(drops.get(franchiseId))];
        summary.claims = claimed.slice(0, MOVES_SHOWN);
        summary.drops = dropped.slice(0, MOVES_SHOWN);
        const [otherClaims, otherDrops] = [claimed.slice(MOVES_SHOWN), dropped.slice(MOVES_SHOWN)];
        const count = otherClaims.length + otherDrops.length;
        const net = otherClaims.reduce((sum, move) => sum + move.moveValue, 0) - otherDrops.reduce((sum, move) => sum + move.moveValue, 0);
        summary.otherMoves = count ? { count, netFpts: hundredths(net) } : null;
    }
    for (const { franchiseId, ...pick } of [...draft].sort((a, b) => a.overall - b.overall)) summaryOf(franchiseId).draftClass.push(pick);
    return summaries;
}
