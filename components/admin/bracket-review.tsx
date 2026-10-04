'use client';

import { FC, useState, useTransition } from 'react';
import { saveMatchup } from '@/app/admin/actions';
import SaveBar, { SaveStatus } from '@/components/admin/save-bar';
import type { AdminGame } from '@/lib/admin/data';
import { formatFpts } from '@/lib/league';

type Winner = 'score' | number;

const winnerOf = (game: AdminGame): Winner => game.override?.winnerFranchiseId ?? 'score';

// one playoff game: who advanced (the score, or a correction) and an optional note shown under the bracket
const GameReview: FC<{ year: number; game: AdminGame; roundName: string }> = ({ year, game, roundName }) => {
    const [saved, setSaved] = useState({ winner: winnerOf(game), note: game.override?.note ?? '' });
    const [winner, setWinner] = useState<Winner>(saved.winner);
    const [note, setNote] = useState(saved.note);
    const [pending, startTransition] = useTransition();
    const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' });
    const dirty = winner !== saved.winner || note.trim() !== saved.note;

    const scoreWinner = game.away.score > game.home.score ? game.away.franchiseId : game.home.score > game.away.score ? game.home.franchiseId : null;
    const effective = winner === 'score' ? scoreWinner : winner;
    const corrected = winner !== 'score' && winner !== scoreWinner;

    const save = () =>
        startTransition(async () => {
            try {
                await saveMatchup(year, game.id, winner, note);
                setSaved({ winner, note: note.trim() });
                setStatus({ kind: 'saved', message: 'Saved.' });
            } catch (e) {
                setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Saving failed.' });
            }
        });

    const option = (value: Winner, label: string) => (
        <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${winner === value ? 'border-rink-blue bg-rink-wash text-ink' : 'border-line-strong text-ink-soft hover:border-rink-blue'}`}>
            <input type="radio" name={`winner-${game.id}`} value={String(value)} checked={winner === value} onChange={() => setWinner(value)} aria-label={value === 'score' ? 'Winner decided by the higher score' : `${label} advanced`} className="accent-[#1F6FC2]" />
            {label}
        </label>
    );

    return (
        <li className="rounded-2xl border border-line bg-white p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-[.14em] text-rink-red">{roundName}</span>
                {corrected && <span className="rounded-full bg-award-multi px-2.5 py-0.5 text-xs font-bold text-rink-red">Winner corrected</span>}
            </div>
            <div className="mb-3 space-y-1 text-sm">
                {[game.away, game.home].map((team) => (
                    <div key={team.franchiseId} className={`flex justify-between gap-3 ${effective === team.franchiseId ? 'font-extrabold' : 'text-ink-muted'}`}>
                        <span className="truncate">{team.name}</span>
                        <span className="tabular">{formatFpts(team.score)}</span>
                    </div>
                ))}
            </div>
            {game.scoreNote && <p className="mb-3 text-xs text-ink-muted">Score fix from league.yml: {game.scoreNote}</p>}
            <fieldset className="mb-3">
                <legend className="mb-1.5 text-xs font-bold uppercase tracking-[.12em] text-ink-muted">Who advanced</legend>
                <div className="flex flex-wrap gap-2">
                    {option('score', 'Higher score')}
                    {option(game.away.franchiseId, game.away.name)}
                    {option(game.home.franchiseId, game.home.name)}
                </div>
            </fieldset>
            <label className="mb-3 block text-xs font-bold uppercase tracking-[.12em] text-ink-muted">
                Note (shown under the bracket)
                <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={300}
                    aria-label={`Note for the ${roundName.toLowerCase()}: ${game.away.name} vs ${game.home.name}`}
                    placeholder="Optional"
                    className="mt-1.5 h-11 w-full rounded-xl border border-line-strong px-3 text-sm font-normal normal-case tracking-normal text-ink outline-none focus:border-rink-blue"
                />
            </label>
            <SaveBar dirty={dirty} pending={pending} status={status} onSave={save} onReset={() => { setWinner(saved.winner); setNote(saved.note); }} />
        </li>
    );
};

const roundName = (round: number, lastRound: number, consolation: boolean) => {
    const base = lastRound - round === 0 ? 'Final' : lastRound - round === 1 ? 'Semifinal' : lastRound - round === 2 ? 'Quarterfinal' : `Round ${round}`;
    return consolation ? `Consolation ${base.toLowerCase()}` : base;
};

const BracketReview: FC<{ year: number; games: AdminGame[] }> = ({ year, games }) => {
    if (!games.length) return <p className="text-sm text-ink-faint">No playoff games were imported for this season.</p>;
    const lastRound = (bracket: string) => Math.max(...games.filter((g) => g.bracket === bracket).map((g) => g.round));
    const ordered = [...games].sort((a, b) => (a.bracket === b.bracket ? b.round - a.round || a.slot - b.slot : a.bracket === 'championship' ? -1 : 1));
    return (
        <ul className="grid gap-3 md:grid-cols-2">
            {ordered.map((game) => (
                <GameReview key={game.id} year={year} game={game} roundName={roundName(game.round, lastRound(game.bracket), game.bracket === 'consolation')} />
            ))}
        </ul>
    );
};

export default BracketReview;
