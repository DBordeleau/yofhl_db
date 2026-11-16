// GM of the Year's candidates, as the ballot and its admin preview show them: each team season under that season's
// name and owner, with its record, FPts for and playoff finish beside the season before, and under it its moves:
// trades, top claims and drops by move value, the rest in one line, and its draft class.
// `action` adds a control to each row (the ballot's rank picker).
import { Fragment } from 'react';
import { formatFpts } from '@/lib/league';
import type { FreeAgentMove, PlayoffFinish, TeamCandidate, TeamSeasonLine, TradedAsset, TradeSummary, TransactionSummary } from '@/lib/award-vote/model';

const FINISHES: Record<PlayoffFinish, string> = {
    champion: 'Champion',
    finalist: 'Finalist',
    semifinalist: 'Semifinalist',
    quarterfinalist: 'Quarterfinalist',
    missed: 'Missed playoffs',
};

const SEASONS = [{ key: 'season', label: 'This season' }, { key: 'previous', label: 'Last season' }] as const;

function SeasonCells({ line }: { line: TeamSeasonLine | null }) {
    if (!line) return <td colSpan={3} className="px-2 py-1.5 text-ink-soft">Didn’t play</td>;
    return <>
        <td className="px-2 py-1.5">{line.wins}-{line.losses}-{line.ties}</td>
        <td className="px-2 py-1.5 text-right">{formatFpts(line.fptsFor)}</td>
        <td className="px-2 py-1.5">{FINISHES[line.playoffFinish]}</td>
    </>;
}

const DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
const day = (date: string) => DAY.format(new Date(`${date}T00:00:00Z`));
/** a move value as gained (+) or lost (−) */
const signed = (value: number) => `${value < 0 ? '−' : '+'}${formatFpts(Math.abs(value))}`;

function assetText(asset: TradedAsset, sign: 1 | -1) {
    return asset.kind === 'pick' ? asset.label : `${asset.name} ${signed(sign * asset.moveValue)}`;
}

function TradeLine({ trade }: { trade: TradeSummary }) {
    const teams = [...new Set([...trade.received, ...trade.sent].map(asset => asset.team))].join(', ');
    return <li>
        <span className="text-ink-soft">{day(trade.occurredOn)}, with {teams}:</span>{' '}
        {trade.received.length > 0 && <>got {trade.received.map(asset => assetText(asset, 1)).join(', ')}</>}
        {trade.received.length > 0 && trade.sent.length > 0 && '; '}
        {trade.sent.length > 0 && <>gave {trade.sent.map(asset => assetText(asset, -1)).join(', ')}</>}
    </li>;
}

function MoveList({ label, moves, sign }: { label: string; moves: FreeAgentMove[]; sign: 1 | -1 }) {
    if (!moves.length) return null;
    return <div>
        <dt className="text-xs uppercase text-ink-soft">{label}</dt>
        <dd>{moves.map(move => `${move.name} ${signed(sign * move.moveValue)}`).join(' · ')}</dd>
    </div>;
}

/** a franchise's trades, top claims and drops, the rest in one line, and its draft class, by move value */
function TransactionLines({ transactions }: { transactions: TransactionSummary }) {
    const { trades, claims, drops, otherMoves, draftClass } = transactions;
    if (!trades.length && !claims.length && !drops.length && !otherMoves && !draftClass.length) return <p className="text-ink-soft">No moves</p>;
    return <dl className="grid gap-2">
        {trades.length > 0 && <div>
            <dt className="text-xs uppercase text-ink-soft">Trades</dt>
            <dd><ul>{trades.map((trade, index) => <TradeLine key={index} trade={trade} />)}</ul></dd>
        </div>}
        <MoveList label="Claims" moves={claims} sign={1} />
        <MoveList label="Drops" moves={drops} sign={-1} />
        {otherMoves && <div>
            <dt className="text-xs uppercase text-ink-soft">Other claims and drops</dt>
            <dd>{otherMoves.count} {otherMoves.count === 1 ? 'move' : 'moves'}, {signed(otherMoves.moveValue)} FPts</dd>
        </div>}
        {draftClass.length > 0 && <div>
            <dt className="text-xs uppercase text-ink-soft">Draft</dt>
            <dd>{draftClass.map(pick => `${pick.overall}. ${pick.name} ${formatFpts(pick.fpts)}`).join(' · ')}</dd>
        </div>}
    </dl>;
}

export default function TeamCandidateList({ candidates, action }: { candidates: TeamCandidate[]; action?: (candidate: TeamCandidate) => React.ReactNode }) {
    const columns = (action ? 2 : 1) + SEASONS.length * 3;
    return <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm tabular-nums">
            <thead>
                <tr className="text-xs uppercase text-ink-soft">
                    <th colSpan={action ? 2 : 1} />
                    {SEASONS.map(season => <th key={season.key} colSpan={3} scope="colgroup" className="px-2 pb-1 text-left">{season.label}</th>)}
                </tr>
                <tr className="border-b border-line text-left text-xs uppercase text-ink-soft">
                    {action && <th className="px-2 py-2"><span className="sr-only">Rank</span></th>}
                    <th scope="col" className="px-2 py-2">Team</th>
                    {SEASONS.map(season => <Fragment key={season.key}>
                        <th scope="col" className="px-2 py-2">W-L-T</th>
                        <th scope="col" className="px-2 py-2 text-right">FPts</th>
                        <th scope="col" className="px-2 py-2">Playoffs</th>
                    </Fragment>)}
                </tr>
            </thead>
            <tbody>
                {candidates.map(candidate => <Fragment key={candidate.teamSeasonId}>
                    <tr>
                        {action && <td className="px-2 py-1.5">{action(candidate)}</td>}
                        <th scope="row" className="px-2 py-1.5 text-left font-semibold">
                            {candidate.name}
                            {candidate.owner && <span className="ml-2 text-xs font-normal text-ink-soft">{candidate.owner}</span>}
                        </th>
                        <SeasonCells line={candidate.summary.season} />
                        <SeasonCells line={candidate.summary.previous} />
                    </tr>
                    <tr className="border-b border-line/60">
                        <td colSpan={columns} className="px-2 pb-2">
                            <details>
                                <summary className="cursor-pointer text-xs text-ink-soft">Moves</summary>
                                <div className="mt-1 whitespace-normal">
                                    <TransactionLines transactions={candidate.summary.transactions} />
                                </div>
                            </details>
                        </td>
                    </tr>
                </Fragment>)}
            </tbody>
        </table>
    </div>;
}
