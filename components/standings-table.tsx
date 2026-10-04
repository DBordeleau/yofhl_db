import { FC } from 'react';
import Link from 'next/link';
import TeamBadge from '@/components/team-badge';
import { JagrCupIcon } from '@/components/trophy-icons';
import type { StandingRow } from '@/lib/data/league';
import { formatFpts, standingsTeamId } from '@/lib/league';

const GRID = 'grid grid-cols-[28px_minmax(0,1fr)_72px_76px] items-center gap-2.5 px-3.5 md:grid-cols-[40px_minmax(0,1fr)_96px_110px_110px] md:gap-4 md:px-6';

// regular-season standings for /champions/[year], one table per division
const StandingsTable: FC<{ standings: StandingRow[]; championFranchiseId: number | null; playoffFranchiseIds: number[] }> = ({ standings, championFranchiseId, playoffFranchiseIds }) => {
    const divisions = Array.from(new Set(standings.map((s) => s.division))).sort((a, b) => a - b);
    return (
        <section id="standings" className="scroll-mt-6" aria-label="Standings">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-wide text-lg font-extrabold uppercase md:text-xl">Regular Season</h2>
                {playoffFranchiseIds.length > 0 && (
                    <span className="inline-flex items-center gap-2 text-sm text-ink-soft"><span className="h-2.5 w-2.5 rounded-full bg-rink-line" />Made the playoffs</span>
                )}
            </div>
            <div className={`grid gap-5 ${divisions.length > 1 ? '3xl:grid-cols-2' : ''}`}>
                {divisions.map((division) => (
                    <div key={division} className="overflow-hidden rounded-3xl border border-line bg-white shadow-card" role="table" aria-label={divisions.length > 1 ? `Division ${division}` : 'Standings'}>
                        {divisions.length > 1 && <div className="px-4 pt-4 text-xs font-bold uppercase tracking-[.14em] text-ink-muted md:px-6">Division {division}</div>}
                        <div className={`${GRID} min-h-12 border-b-2 border-ink text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted md:text-xs`} role="row">
                            <span role="columnheader">#</span>
                            <span role="columnheader">Team</span>
                            <span role="columnheader" className="text-right">Record</span>
                            <span role="columnheader" className="text-right">PF</span>
                            <span role="columnheader" className="hidden text-right md:block">PA</span>
                        </div>
                        {standings.filter((s) => s.division === division).map((team) => (
                            <div key={team.teamSeasonId} id={standingsTeamId(team.franchiseId)} role="row" className={`${GRID} arrival-target row-hover min-h-[60px] border-b border-line-soft last:border-b-0`}>
                                <span role="cell" className="tabular flex items-center gap-1.5 font-bold text-ink-muted">
                                    {team.divisionRank}
                                </span>
                                <span role="cell" className="flex min-w-0 items-center gap-3 py-2">
                                    <TeamBadge logo={team.logo} abbreviation={team.abbreviation} teamName={team.name} size={32} ring="none" />
                                    <span className="flex min-w-0 flex-col">
                                        <span className="flex items-center gap-1.5">
                                            <Link href={`/teams/${team.franchiseId}`} className="truncate text-[15px] font-bold text-ink hover:text-rink-blue hover:underline">{team.name}</Link>
                                            {team.franchiseId === championFranchiseId && <JagrCupIcon className="h-7 w-7 flex-none" title="Jagr Cup champion" />}
                                            {playoffFranchiseIds.includes(team.franchiseId) && <span className="h-2 w-2 flex-none rounded-full bg-rink-line" title="Made the playoffs" />}
                                        </span>
                                        {team.owner && <span className="truncate text-xs font-semibold text-ink-faint">{team.owner}</span>}
                                    </span>
                                </span>
                                <span role="cell" className="tabular text-right font-extrabold">
                                    {team.wins}-{team.losses}{team.ties > 0 ? `-${team.ties}` : ''}
                                </span>
                                <span role="cell" className="tabular text-right text-sm font-semibold">{formatFpts(team.fptsFor)}</span>
                                <span role="cell" className="tabular hidden text-right text-sm text-ink-muted md:block">{formatFpts(team.fptsAgainst)}</span>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </section>
    );
};

export default StandingsTable;
