'use client';

import type { PositionDepth } from '../lib/forecast';
import type { Player, Position } from '../lib/model';
import { STARTERS } from '../lib/order';
import type { Tier } from '../lib/tiers';
import { Odds, Star, points } from './ui';

// Expected tier players left at the pick we are deciding for; under one means the tier is likely gone.
export function TierSummary({ tier, slot, useNext, showDrop = true }: { tier: Tier; slot: number | null; useNext: boolean; showDrop?: boolean }) {
    const expected = tier.expected && (useNext ? tier.expected.atNext : tier.expected.atPick);
    return <><span className="tier-badge">T{tier.number}</span>
        <span className="tier-left">{tier.left}/{tier.members.length} left</span>
        {expected != null && slot !== null && tier.left > 0 && <span className={`tier-expected ${expected < 1 ? 'warn' : ''}`} title={`Expected still available at #${slot + 1}, from 64 simulated drafts`}>~{expected.toFixed(1)} at #{slot + 1}</span>}
        {showDrop && tier.strongBreak && <span className="tier-drop" title="Drop from the tier above">▼ {points(tier.gapAbove)}</span>}</>;
}

export default function TierBoard({ tiers, depth, counts, first, next, slot, useNext, odds, unknownTeams, targets, onDetails, onTarget }: {
    tiers: Map<Position, Tier[]>; depth: PositionDepth[]; counts: Record<Position, number>; first: number | null; next: number | null;
    slot: number | null; useNext: boolean; odds: (id: string) => number | null; unknownTeams: string[]; targets: Set<string>;
    onDetails: (player: Player, position: Position) => void; onTarget: (id: string) => void;
}) {
    return <div className="tier-panel">
        <div className="tier-board">{[...tiers].map(([position, list]) => <section key={position} className="tier-col">
            <header><strong>{position}</strong><span className={counts[position] < STARTERS[position] ? 'need' : ''} title="Your starters at this position">{Math.min(counts[position], STARTERS[position])}/{STARTERS[position]}</span></header>
            {list.map(tier => <div key={tier.number} className="tier-group">
                {/* Strong breaks get a labelled divider; width-only splits just get space. */}
                {tier.number > 1 && <div className={`tier-gap ${tier.strongBreak ? 'strong' : ''}`} title={tier.strongBreak ? 'Drop from the tier above' : undefined}>{tier.strongBreak && <span>▼ {points(tier.gapAbove)}</span>}</div>}
                <div className={`tier ${tier.left ? '' : 'tier-empty'}`}>
                    <div className="tier-head"><TierSummary tier={tier} slot={slot} useNext={useNext} showDrop={false} /></div>
                    {tier.left > 0 && tier.members.map(m => <div key={m.player.id} className={`tier-player ${m.takenBy ? 'taken' : ''}`} title={m.takenBy ? `${m.player.name} → ${m.takenBy}` : undefined}>
                        {m.takenBy ? <span className="tier-name">{m.player.name}</span> : <><Star on={targets.has(m.player.id)} name={m.player.name} onClick={() => onTarget(m.player.id)} /><button className="tier-name" onClick={() => onDetails(m.player, position)}>{m.player.name}</button></>}
                        <span className="num">{points(m.points)}</span>
                        {!m.takenBy && slot !== null && <Odds value={odds(m.player.id)} />}
                    </div>)}
                </div>
            </div>)}
        </section>)}</div>
        {first !== null && <div className="forecast-strip">
            <table className="data-table compact-table"><thead><tr><th>Best left</th>{depth.map(d => <th key={d.position} className="num">{d.position}</th>)}</tr></thead><tbody>
                <tr><td>Now</td>{depth.map(d => <td key={d.position} className="num">{points(d.players[0]?.value.points)}</td>)}</tr>
                <tr><td>At #{first + 1}</td>{depth.map(d => <td key={d.position} className="num">{points(d.atPick)}</td>)}</tr>
                {next !== null && <tr><td>At #{next + 1}</td>{depth.map(d => <td key={d.position} className={`num ${d.atPick !== null && d.atNext !== null && d.atPick - d.atNext >= 40 ? 'warn' : ''}`}>{points(d.atNext)}</td>)}</tr>}
            </tbody></table>
            {unknownTeams.length > 0 && <p className="caption">No keeper counts: {unknownTeams.join(', ')}</p>}
        </div>}
    </div>;
}
