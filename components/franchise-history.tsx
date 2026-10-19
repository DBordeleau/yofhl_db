import Link from 'next/link';
import { JagrCupIcon } from '@/components/trophy-icons';
import FranchisePerformance from '@/components/franchise-performance';
import type { FranchiseDetail, FranchiseSeason } from '@/lib/data/league';
import { formatFpts, seasonLabel, teamSeasonHref, winPercentage } from '@/lib/league';
import Arrow from '@/components/arrow';
import styles from './franchise.module.css';

const seasonResult = (season: FranchiseSeason, team: FranchiseDetail) => {
    if (season.playoffStatus === 'cancelled') return 'Playoffs cancelled';
    if (team.championships.includes(season.year)) return 'Jagr Cup champion';
    if (team.finals.includes(season.year)) return 'Finalist';
    if (season.playoffRound === null) return 'Missed playoffs';
    const fromFinal = (season.finalRound ?? season.playoffRound) - season.playoffRound;
    return fromFinal === 1 ? 'Semifinals' : fromFinal === 2 ? 'Quarterfinals' : `Round ${season.playoffRound}`;
};

// The owner column only earns its width when the franchise changed hands or names.
const GRID_DETAIL = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 md:grid-cols-[96px_minmax(0,1fr)_76px_92px_118px_80px_150px] md:gap-y-0';
const GRID = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 md:grid-cols-[minmax(96px,1fr)_76px_92px_118px_80px_150px] md:gap-y-0';

export default function FranchiseHistory({ team }: { team: FranchiseDetail }) {
    const played = team.seasons.filter((s) => s.wins + s.losses + s.ties > 0);
    const bestRecord = [...played].sort((a, b) => winPercentage(b) - winPercentage(a) || b.wins - a.wins)[0]?.year;
    const bestScoring = [...team.seasons].sort((a, b) => b.fptsFor - a.fptsFor)[0]?.year;
    const showDetail = new Set(team.seasons.map((s) => s.owner)).size > 1 || team.seasons.some((s) => s.name !== team.name);
    const grid = showDetail ? GRID_DETAIL : GRID;

    return (
        <section id="season-history" className={styles.section} aria-labelledby="history-title">
            <div className={styles.head}><h2 id="history-title">Seasons</h2></div>
            <div className={`${styles.panel} grid ${showDetail ? '' : 'xl:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]'}`}>
                <FranchisePerformance seasons={team.seasons} championships={team.championships} beside={!showDetail} />
                <div className="min-w-0">
                    <div className={`${grid} ${styles.tableHead} ${styles.label} hidden px-5 py-2.5 md:grid`} aria-hidden="true">
                        <span>Season</span>{showDetail && <span>Owner</span>}<span className="text-right">W–L–T</span><span className="text-right">Win %</span><span className="text-right">PF</span><span className="text-right">PA</span><span className="text-right">Playoffs</span>
                    </div>
                    <ol>
                        {team.seasons.map((season) => {
                            const champion = team.championships.includes(season.year);
                            const made = season.playoffStatus !== 'cancelled' && season.playoffRound !== null;
                            const renamed = season.name !== team.name;
                            return (
                                <li key={season.year} className="border-b border-line-soft last:border-0">
                                    <Link href={teamSeasonHref(season.year, team.id, season.playoffStatus === 'cancelled' ? null : season.playoffRound)}
                                        className={`group ${grid} row-hover min-h-[52px] px-4 py-2.5 md:px-5 md:py-1.5 ${champion ? 'bg-gold-tint/50' : ''}`}>
                                        <span className="flex items-center gap-1.5 whitespace-nowrap font-extrabold tabular group-hover:text-rink-blue group-hover:underline">
                                            {seasonLabel(season.year)}{champion && <JagrCupIcon className="h-6 w-6" />}
                                        </span>
                                        {showDetail
                                            ? <span className="order-3 col-span-2 min-w-0 truncate text-xs text-ink-muted md:order-none md:col-span-1 md:text-sm">{season.owner ?? 'Owner not recorded'}{renamed && <span className="text-ink-soft"> · {season.name}</span>}</span>
                                            : null}
                                        <span className="tabular text-right font-extrabold"><span className="sr-only">Record: </span>{season.wins}–{season.losses}–{season.ties}</span>
                                        <span className="tabular hidden whitespace-nowrap text-right text-sm text-ink-muted md:block">{season.year === bestRecord && <span className={styles.best}>Best</span>}{winPercentage(season).toFixed(1)}%<span className="sr-only"> win percentage{season.year === bestRecord ? ', franchise best' : ''}</span></span>
                                        <span className="tabular order-4 whitespace-nowrap text-xs font-semibold md:order-none md:text-right md:text-sm">
                                            <span className="mr-1 text-ink-muted md:sr-only">PF</span>{season.year === bestScoring && <span className={styles.best}>Best</span>}{formatFpts(season.fptsFor)}<span className="sr-only">{season.year === bestScoring ? ', franchise best' : ''}</span>
                                            <span className="text-ink-muted md:hidden"> · PA {formatFpts(season.fptsAgainst)}</span>
                                        </span>
                                        <span className="tabular hidden text-right text-sm text-ink-muted md:block"><span className="sr-only">Points against </span>{formatFpts(season.fptsAgainst)}</span>
                                        <span className="order-5 flex items-center justify-end gap-2 md:order-none">
                                            <span className={`text-xs font-bold md:text-[13px] ${champion ? 'text-gold-deep' : made ? 'text-rink-blue' : 'text-ink-muted'}`}>{seasonResult(season, team)}</span>
                                            <Arrow className="text-sm text-ink-faint" />
                                        </span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ol>
                </div>
            </div>
        </section>
    );
}
