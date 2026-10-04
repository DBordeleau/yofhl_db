import React, { FC } from 'react';
import Link from 'next/link';
import TeamBadge from '@/components/team-badge';
import { CupRow, JagrCupIcon } from '@/components/trophy-icons';
import type { FranchiseCard } from '@/lib/data/league';
import { formatFpts, seasonLabel } from '@/lib/league';

interface TeamCardProps {
    team: FranchiseCard;
    rank: number;
    index: number;
}

// one franchise's all-time record, linking to its profile at /teams/[ID]
const TeamCard: FC<TeamCardProps> = ({ team, rank, index }) => {
    const cups = team.championships;
    const finals = team.finals;
    const games = team.Wins + team.Losses + team.Ties;
    const winPct = games ? (team.Wins + team.Ties / 2) / games : 0;
    const defunct = team.defunct;
    const logo = team.LogoUrl;

    return (
        <Link
            href={`/teams/${team.ID}`}
            className={`animate-rise group flex flex-col overflow-hidden rounded-3xl border border-line bg-white shadow-card transition-transform duration-300 hover:-translate-y-1 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-rink-line ${defunct ? 'opacity-80' : ''}`}
            style={{ animationDelay: `${index * 45}ms` }}
        >
            <div className="navy-spotlight relative flex items-center gap-4 px-5 py-5 text-white">
                <TeamBadge logo={logo} abbreviation={team.Abbreviation} teamName={team.Team} size={64} ring={cups.length ? 'gold' : 'none'} />
                <div className="min-w-0 flex-1">
                    <div className="font-wide text-[17px] font-extrabold uppercase leading-tight group-hover:underline">{team.Team}</div>
                    <div className="mt-1 text-xs font-bold uppercase tracking-[.1em] text-[#B9C6DA]">
                        {team.Abbreviation}{defunct ? <> · <span className="text-[#E2475C]">Defunct</span></> : team.Owner ? ` · ${team.Owner}` : ''}
                    </div>
                </div>
                <span className="font-narrow tabular self-start text-[32px] font-extrabold leading-none text-white/25">{rank}</span>
            </div>
            <div className="banner-stripes h-3.5" />

            <div className="flex flex-1 flex-col gap-4 px-5 pb-5 pt-4">
                <div>
                    <div className="flex items-baseline justify-between gap-3">
                        <span className="font-wide tabular text-[28px] font-extrabold leading-none">
                            {team.Wins}<span className="text-ink-faint">–</span>{team.Losses}{team.Ties > 0 && <><span className="text-ink-faint">–</span>{team.Ties}</>}
                        </span>
                        <span className="tabular text-sm font-bold text-ink-muted">{winPct.toFixed(3).replace(/^0/, '')}</span>
                    </div>
                    <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-[#F6D3D9]" role="img" aria-label={`Won ${Math.round(winPct * 100)}% of games`}>
                        <span className="h-full rounded-full bg-rink-blue" style={{ width: `${winPct * 100}%` }} />
                    </div>
                </div>

                <dl className="grid grid-cols-2 gap-3 border-t border-line-soft pt-3.5">
                    <div>
                        <dt className="text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted">Points For</dt>
                        <dd className="tabular mt-1 font-extrabold">{formatFpts(team.FPF)}</dd>
                    </div>
                    <div>
                        <dt className="text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted">Jagr Cups</dt>
                        <dd className="mt-1 flex min-h-6 items-center">{cups.length ? <CupRow count={cups.length} className="h-8 w-8" /> : <span className="font-extrabold text-ink-faint">—</span>}</dd>
                    </div>
                </dl>

                <div className="mt-auto border-t border-line-soft pt-3.5">
                    <div className="text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted">Finals</div>
                    {finals.length ? (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                            {finals.map((year) => {
                                const won = cups.includes(year);
                                return (
                                    <li
                                        key={year}
                                        className={`tabular inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-extrabold ${won ? 'metal-gold text-[#2B1D00]' : 'border border-line-strong text-ink-soft'}`}
                                        title={won ? `${seasonLabel(year)} Jagr Cup champions` : `${seasonLabel(year)} finalist`}
                                    >
                                        {won && <JagrCupIcon className="h-6 w-6" />}
                                        {seasonLabel(year)}
                                    </li>
                                );
                            })}
                        </ul>
                    ) : (
                        <div className="mt-1 font-extrabold text-ink-faint">—</div>
                    )}
                </div>
            </div>
        </Link>
    );
};

export default TeamCard;
