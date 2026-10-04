import React, { FC } from 'react';
import Link from 'next/link';
import TeamBadge from '@/components/team-badge';
import { JagrCupIcon } from '@/components/trophy-icons';
import type { BracketGame, BracketTeam } from '@/lib/data/league';
import { formatFpts } from '@/lib/league';

const roundName = (round: number, lastRound: number) => {
    const fromEnd = lastRound - round;
    if (fromEnd === 0) return 'Final';
    if (fromEnd === 1) return 'Semifinals';
    if (fromEnd === 2) return 'Quarterfinals';
    return `Round ${round}`;
};

interface Footnote {
    mark: string;
    note: string;
}

const TeamLine: FC<{ team: BracketTeam; won: boolean; decided: boolean; champion: boolean; mark?: string }> = ({ team, won, decided, champion, mark }) => (
    <div className={`flex min-h-12 items-center gap-2.5 px-3 ${decided && !won ? 'text-ink-faint' : 'text-ink'}`}>
        <span className={decided && !won ? 'opacity-60' : ''}>
            <TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={28} ring="none" />
        </span>
        <Link href={`/teams/${team.franchiseId}`} className={`min-w-0 flex-1 truncate text-sm hover:text-rink-blue hover:underline ${won ? 'font-extrabold' : 'font-semibold'}`} title={team.name}>
            {team.name}
        </Link>
        {champion && <JagrCupIcon className="h-[19px] w-[14px] flex-none" title="Jagr Cup champion" />}
        <span className={`tabular flex-none text-sm ${won ? 'font-extrabold' : 'font-semibold'}`}>
            {formatFpts(team.score)}
            {mark && <sup className="ml-0.5 text-rink-red" title="Score adjusted, see note below">{mark}</sup>}
        </span>
    </div>
);

const GameCard: FC<{ game: BracketGame; isFinal: boolean; marks: Map<number, string>; showConnectors: { left: boolean; right: boolean } }> = ({ game, isFinal, marks, showConnectors }) => {
    const decided = game.winnerFranchiseId !== null;
    const mark = marks.get(game.id);
    // the adjusted side is whichever team the note lifted; mark the winner's line, where corrections were applied
    const markAway = mark && game.winnerFranchiseId === game.away.franchiseId ? mark : undefined;
    const markHome = mark && game.winnerFranchiseId === game.home.franchiseId ? mark : undefined;
    return (
        <div className="relative">
            {showConnectors.left && <span className="absolute -left-4 top-1/2 hidden h-px w-4 bg-line-strong md:block" aria-hidden="true" />}
            {showConnectors.right && <span className="absolute -right-4 top-1/2 hidden h-px w-4 bg-line-strong md:block" aria-hidden="true" />}
            <div className={`divide-y divide-line-soft overflow-hidden rounded-2xl border bg-white ${isFinal ? 'border-gold-light/80 shadow-[0_0_0_1px_rgba(240,199,94,.35),0_16px_32px_-20px_rgba(184,134,11,.55)]' : 'border-line shadow-card'}`}>
                <TeamLine team={game.away} won={game.winnerFranchiseId === game.away.franchiseId} decided={decided} champion={isFinal && game.winnerFranchiseId === game.away.franchiseId} mark={markAway} />
                <TeamLine team={game.home} won={game.winnerFranchiseId === game.home.franchiseId} decided={decided} champion={isFinal && game.winnerFranchiseId === game.home.franchiseId} mark={markHome} />
            </div>
        </div>
    );
};

const Bracket: FC<{ games: BracketGame[]; title: string; isConsolation: boolean; marks: Map<number, string> }> = ({ games, title, isConsolation, marks }) => {
    const rounds = Array.from(new Set(games.map((g) => g.round))).sort((a, b) => a - b);
    const lastRound = rounds[rounds.length - 1];
    return (
        <div>
            <h3 className="mb-4 text-xs font-bold uppercase tracking-[.14em] text-ink-muted">{title}</h3>
            {/* rounds side by side from tablets up; stacked on phones */}
            <div
                className="flex flex-col gap-6 md:grid md:gap-8 md:[grid-template-columns:repeat(var(--rounds),minmax(0,1fr))]"
                style={{ '--rounds': rounds.length } as React.CSSProperties}
            >
                {rounds.map((round, i) => {
                    const inRound = games.filter((g) => g.round === round).sort((a, b) => a.slot - b.slot);
                    return (
                        <div key={round} className="flex min-w-0 flex-col">
                            <div className="mb-3 text-[11px] font-extrabold uppercase tracking-[.16em] text-rink-red">
                                {isConsolation ? `Consolation ${roundName(round, lastRound).toLowerCase()}` : roundName(round, lastRound)}
                            </div>
                            {/* later rounds spread out so each game sits between the games that fed it */}
                            <div className="flex flex-1 flex-col justify-around gap-4">
                                {inRound.map((game) => (
                                    <GameCard
                                        key={game.id}
                                        game={game}
                                        isFinal={!isConsolation && round === lastRound}
                                        marks={marks}
                                        showConnectors={{ left: i > 0, right: i < rounds.length - 1 }}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// championship bracket (plus any consolation bracket) for /champions/[year]
const PlayoffBracket: FC<{ games: BracketGame[] }> = ({ games }) => {
    if (!games.length) return null;
    const marks = new Map<number, string>();
    const footnotes: Footnote[] = [];
    games
        .filter((g) => g.note)
        .sort((a, b) => a.round - b.round || a.slot - b.slot)
        .forEach((g) => {
            const existing = footnotes.find((f) => f.note === g.note);
            const mark = existing?.mark ?? '*'.repeat(footnotes.length + 1);
            if (!existing) footnotes.push({ mark, note: g.note! });
            marks.set(g.id, mark);
        });
    const championship = games.filter((g) => g.bracket === 'championship');
    const consolation = games.filter((g) => g.bracket === 'consolation');

    return (
        <section className="rounded-3xl border border-line bg-white/60 p-4 shadow-card md:p-6" aria-label="Playoff bracket">
            <h2 className="font-wide mb-5 text-lg font-extrabold uppercase md:text-xl">Playoffs</h2>
            <div className="flex flex-col gap-10">
                {championship.length > 0 && <Bracket games={championship} title="Championship bracket" isConsolation={false} marks={marks} />}
                {consolation.length > 0 && <Bracket games={consolation} title="Consolation bracket" isConsolation marks={marks} />}
            </div>
            {footnotes.length > 0 && (
                <ul className="mt-5 space-y-1 border-t border-line-soft pt-4 text-xs text-ink-muted">
                    {footnotes.map((f) => (
                        <li key={f.mark}><span className="mr-1 font-bold text-rink-red">{f.mark}</span>{f.note}</li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default PlayoffBracket;
