import Link from 'next/link';
import { JagrCupIcon } from '@/components/trophy-icons';
import type { FranchiseDetail, FranchiseSeason } from '@/lib/data/league';
import { formatFpts, seasonLabel, teamSeasonHref, winPercentage } from '@/lib/league';
import Arrow from '@/components/arrow';

const seasonResult = (season: FranchiseSeason, team: FranchiseDetail) => {
    if (season.playoffStatus === 'cancelled') return 'Playoffs cancelled';
    if (team.championships.includes(season.year)) return 'Jagr Cup champion';
    if (team.finals.includes(season.year)) return 'Finalist';
    if (season.playoffRound === null) return 'Missed playoffs';
    const fromFinal = (season.finalRound ?? season.playoffRound) - season.playoffRound;
    return fromFinal === 1 ? 'Semifinals' : fromFinal === 2 ? 'Quarterfinals' : `Round ${season.playoffRound}`;
};

const labelClass = 'text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted';

export default function FranchiseHistory({ team }: { team: FranchiseDetail }) {
    const playoffSeasons = team.seasons.filter((s) => s.playoffStatus !== 'cancelled' && s.playoffRound !== null).length;
    const eligibleSeasons = team.seasons.filter((s) => s.playoffStatus !== 'cancelled').length;
    const differential = team.fptsFor - team.fptsAgainst;

    return (
        <section id="season-history" className="mt-9 scroll-mt-6" aria-labelledby="history-title">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="history-title" className="font-wide text-xl font-extrabold uppercase">Season history</h2>
                <p className="text-sm text-ink-muted">Playoffs in {playoffSeasons} of {eligibleSeasons} seasons</p>
            </div>
            <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
                <div className={`hidden gap-4 border-b border-ink bg-line-soft px-5 py-3 lg:grid lg:grid-cols-[minmax(0,1fr)_110px_100px_100px_165px] ${labelClass}`} aria-hidden="true">
                    <span>Season / Owner</span><span className="text-right">W–L–T / Win %</span><span className="text-right">Points for</span><span className="text-right">Points against</span><span className="text-right">Playoffs</span>
                </div>
                {team.seasons.map((season) => {
                    const champion = team.championships.includes(season.year);
                    const result = seasonResult(season, team);
                    return (
                        <Link key={season.year} href={teamSeasonHref(season.year, team.id, season.playoffStatus === 'cancelled' ? null : season.playoffRound)} className={`group grid grid-cols-2 items-center gap-x-4 gap-y-3 border-b border-line-soft px-5 py-5 last:border-0 hover:bg-rink-wash lg:grid-cols-[minmax(0,1fr)_110px_100px_100px_165px] ${champion ? 'bg-gold-tint/40' : ''}`}>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 font-extrabold group-hover:text-rink-blue group-hover:underline">{seasonLabel(season.year)}{champion && <JagrCupIcon className="h-7 w-7" />}</div>
                                {season.name !== team.name && <p className="mt-1 text-xs font-semibold text-ink-soft">{season.name}</p>}
                                <p className="mt-1 text-xs text-ink-muted">{season.owner ?? 'Owner not recorded'}</p>
                            </div>
                            <div className="text-right">
                                <span className="sr-only">Record: </span><div className="tabular font-extrabold">{season.wins}–{season.losses}–{season.ties}</div>
                                <div className="tabular mt-1 text-xs text-ink-muted">{winPercentage(season).toFixed(1)}%<span className="sr-only"> win percentage</span></div>
                            </div>
                            <div className="tabular text-sm font-semibold lg:text-right"><span className="mr-1.5 text-xs text-ink-muted lg:sr-only">PF</span>{formatFpts(season.fptsFor)}</div>
                            <div className="tabular text-right text-sm text-ink-muted"><span className="mr-1.5 text-xs lg:sr-only">PA</span>{formatFpts(season.fptsAgainst)}</div>
                            <div className="col-span-2 flex items-center justify-between gap-2 border-t border-line-soft pt-2 lg:col-span-1 lg:justify-end lg:border-0 lg:pt-0">
                                <span className={`text-xs font-bold ${champion ? 'text-gold-deep' : season.playoffStatus !== 'cancelled' && season.playoffRound !== null ? 'text-rink-blue' : 'text-ink-muted'}`}>{result}</span>
                                <Arrow className="text-sm text-ink-faint" />
                            </div>
                        </Link>
                    );
                })}
                <dl className="grid grid-cols-2 gap-3 bg-line-soft px-5 py-4 md:grid-cols-3">
                    <div><dt className={labelClass}>All-time points for</dt><dd className="tabular mt-1 font-extrabold">{formatFpts(team.fptsFor)}</dd></div>
                    <div><dt className={labelClass}>All-time points against</dt><dd className="tabular mt-1 font-extrabold">{formatFpts(team.fptsAgainst)}</dd></div>
                    <div className="col-span-2 md:col-span-1"><dt className={labelClass}>Point differential</dt><dd className={`tabular mt-1 font-extrabold ${differential >= 0 ? 'text-rink-blue' : 'text-rink-red'}`}>{differential >= 0 ? '+' : ''}{formatFpts(differential)}</dd></div>
                </dl>
            </div>
        </section>
    );
}
