import React, { FC } from 'react';
import Link from 'next/link';
import TeamBadge from '@/components/team-badge';
import { JagrCupIcon } from '@/components/trophy-icons';
import type { BracketGame, BracketTeam } from '@/lib/data/league';
import { formatFpts, playoffTeamId } from '@/lib/league';

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

const TeamLine: FC<{ id: string; team: BracketTeam; won: boolean; decided: boolean; champion: boolean; mark?: string }> = ({ id, team, won, decided, champion, mark }) => (
    <div id={id} className={`arrival-target flex min-h-12 items-center gap-2.5 px-3 first:rounded-t-[15px] last:rounded-b-[15px] ${decided && !won ? 'text-ink-faint' : 'text-ink'}`}>
        <span className={decided && !won ? 'opacity-60' : ''}>
            <TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={28} ring="none" />
        </span>
        <Link href={`/teams/${team.franchiseId}`} className={`min-w-0 flex-1 truncate text-sm hover:text-rink-blue hover:underline ${won ? 'font-extrabold' : 'font-semibold'}`} title={team.name}>
            {team.name}
        </Link>
        {champion && <JagrCupIcon className="h-7 w-7 flex-none" title="Jagr Cup champion" />}
        <span className={`tabular flex-none text-sm ${won ? 'font-extrabold' : 'font-semibold'}`}>
            {formatFpts(team.score)}
            {mark && <sup className="ml-0.5 text-rink-red" title="Score adjusted, see note below">{mark}</sup>}
        </span>
    </div>
);

const GameCard: FC<{ game: BracketGame; isFinal: boolean; marks: Map<number, string> }> = ({ game, isFinal, marks }) => {
    const decided = game.winnerFranchiseId !== null;
    const mark = marks.get(game.id);
    // the adjusted side is whichever team the note lifted; mark the winner's line, where corrections were applied
    const markAway = mark && game.winnerFranchiseId === game.away.franchiseId ? mark : undefined;
    const markHome = mark && game.winnerFranchiseId === game.home.franchiseId ? mark : undefined;
    return (
        <div className="relative w-full self-center" data-bracket-game={game.id}>
            <div className={`divide-y divide-line-soft overflow-hidden rounded-2xl border bg-white ${isFinal ? 'border-gold-light/80 shadow-[0_0_0_1px_rgba(240,199,94,.35),0_16px_32px_-20px_rgba(184,134,11,.55)]' : 'border-line shadow-card'}`}>
                <TeamLine id={playoffTeamId(game.away.franchiseId, game.round, game.bracket)} team={game.away} won={game.winnerFranchiseId === game.away.franchiseId} decided={decided} champion={isFinal && game.winnerFranchiseId === game.away.franchiseId} mark={markAway} />
                <TeamLine id={playoffTeamId(game.home.franchiseId, game.round, game.bracket)} team={game.home} won={game.winnerFranchiseId === game.home.franchiseId} decided={decided} champion={isFinal && game.winnerFranchiseId === game.home.franchiseId} mark={markHome} />
            </div>
        </div>
    );
};

const Bracket: FC<{ games: BracketGame[]; title: string; isConsolation: boolean; marks: Map<number, string> }> = ({ games, title, isConsolation, marks }) => {
    const rounds = Array.from(new Set(games.map((g) => g.round))).sort((a, b) => a - b);
    const lastRound = rounds[rounds.length - 1];
    const columns = rounds.map((round) => games.filter((g) => g.round === round).sort((a, b) => a.slot - b.slot));
    const slots = Math.max(...columns.map((column) => column.length));
    return (
        <div>
            <h3 className="mb-4 text-xs font-bold uppercase tracking-[.14em] text-ink-muted">{title}</h3>
            {/* Equal-height round tracks keep the cards and SVG endpoints aligned. */}
            <div
                className="flex flex-col gap-6 lg:grid lg:gap-8 lg:[grid-template-columns:repeat(var(--rounds),minmax(0,1fr))]"
                style={{ '--rounds': rounds.length, '--slots': slots } as React.CSSProperties}
            >
                {rounds.map((round, i) => {
                    const inRound = columns[i];
                    const nextRound = columns[i + 1];
                    return (
                        <div key={round} className="flex min-w-0 flex-col">
                            <div className="mb-3 text-[11px] font-extrabold uppercase tracking-[.16em] text-rink-red">
                                {isConsolation ? `Consolation ${roundName(round, lastRound).toLowerCase()}` : roundName(round, lastRound)}
                            </div>
                            <div
                                className="relative grid flex-1 gap-4 lg:gap-0 lg:[grid-template-rows:repeat(var(--games),minmax(0,1fr))] lg:[min-height:calc(var(--slots)*114px)]"
                                style={{ '--games': inRound.length } as React.CSSProperties}
                            >
                                {nextRound && (
                                    <svg className="pointer-events-none absolute left-full top-0 hidden h-full w-8 overflow-visible lg:block" viewBox="0 0 32 100" preserveAspectRatio="none" fill="none" aria-hidden="true">
                                        {inRound.map((game, gameIndex) => {
                                            // Follow the team that advances, including brackets with byes.
                                            const nextIndex = nextRound.findIndex((next) => [next.away.franchiseId, next.home.franchiseId].some((id) =>
                                                game.winnerFranchiseId !== null ? id === game.winnerFranchiseId : id === game.away.franchiseId || id === game.home.franchiseId,
                                            ));
                                            if (nextIndex < 0) return null;
                                            const from = (gameIndex + 0.5) / inRound.length * 100;
                                            const to = (nextIndex + 0.5) / nextRound.length * 100;
                                            return <path key={game.id} data-from-game={game.id} data-to-game={nextRound[nextIndex].id} d={`M 0 ${from} H 16 V ${to} H 32`} stroke="#9FB0C8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />;
                                        })}
                                    </svg>
                                )}
                                {inRound.map((game) => (
                                    <GameCard
                                        key={game.id}
                                        game={game}
                                        isFinal={!isConsolation && round === lastRound}
                                        marks={marks}
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
        <section id="playoffs" className="scroll-mt-6 rounded-3xl border border-line bg-white/60 p-4 shadow-card md:p-6" aria-label="Playoff bracket">
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
