import { playerHref } from '@/lib/player-url';
import Link from 'next/link';
import { TrophyArt, JagrCupIcon } from '@/components/trophy-icons';
import TrophySparkles from '@/components/trophy-sparkles';
import { awardHref, getAwardDefinition } from '@/lib/awards';
import type { FranchiseHonors } from '@/lib/history/model';
import type { FranchiseSeason } from '@/lib/data/league';
import { formatFpts, seasonLabel, teamSeasonHref } from '@/lib/league';
import Arrow from '@/components/arrow';
import styles from './franchise.module.css';
import css from './franchise-trophy-case.module.css';

// Deepest playoff run for a franchise without a title, with every season it happened.
const FINISHES = ['Finalist', 'Semifinalist', 'Quarterfinalist'];
function bestFinish(seasons: FranchiseSeason[]) {
    const runs = seasons.flatMap((s) => s.playoffStatus === 'cancelled' || s.playoffRound === null ? [] : [{ year: s.year, depth: (s.finalRound ?? s.playoffRound) - s.playoffRound, round: s.playoffRound }]);
    if (!runs.length) return null;
    const depth = Math.min(...runs.map((r) => r.depth));
    const best = runs.filter((r) => r.depth === depth).sort((a, b) => a.year - b.year);
    return { label: FINISHES[depth] ?? `Round ${best[0].round}`, runs: best };
}

export default function FranchiseTrophyCase({ franchiseId, championships, finals, seasons, honors, defunct }: {
    franchiseId: number; championships: number[]; finals: number[]; seasons: FranchiseSeason[]; honors: FranchiseHonors; defunct: boolean;
}) {
    const awards = [...new Set(honors.awards.map((a) => a.name))].map((name) => ({
        name,
        wins: honors.awards.filter((a) => a.name === name),
    }));
    const cups = [...championships].sort((a, b) => b - a);
    const finalYears = [...finals].sort((a, b) => b - a);
    // A finals row that only repeats the cups adds nothing, so it shows only once a final was lost.
    const lostFinal = finalYears.some((year) => !championships.includes(year));
    const finish = cups.length ? null : bestFinish(seasons);

    return (
        <section id="trophy-case" className={css.shelf} aria-labelledby="trophy-case-title">
            <div className={`${styles.wrap} ${css.inner}`}>
                <h2 id="trophy-case-title" className={css.title}>Trophy case</h2>
                <div className={css.grid}>
                    <div className={css.major}>
                        <span className={css.artWrap}>
                            {cups.length > 0 && <TrophySparkles seed={`${franchiseId}-shelf`} />}
                            <JagrCupIcon sizes="120px" className={`${css.art} ${cups.length ? '' : css.dim}`} />
                        </span>
                        <div className="min-w-0">
                            <p className={`${css.count} ${cups.length ? 'champion-count' : css.none}`}>{cups.length}</p>
                            <h3 className={css.name}><Link href={awardHref('Jagr Cup')} className="hover:underline">Jagr Cups</Link></h3>
                            {cups.length > 0 ? <div className={css.slabs}>
                                {cups.map((year) => <Link key={year} href={`/season/${year}#championship-roster`} className={`${styles.slab} ${styles.slabGold}`}>{seasonLabel(year)}</Link>)}
                            </div> : <p className={css.empty}>
                                {finish ? <>Best finish: {finish.label},{' '}{finish.runs.map((run, index) => <span key={run.year}>{index > 0 && ', '}<Link href={teamSeasonHref(run.year, franchiseId, run.round)} className={css.inline}>{seasonLabel(run.year)}</Link></span>)}</>
                                    : defunct ? 'None' : 'None yet'}
                            </p>}
                        </div>
                    </div>
                    <div className={css.major}>
                        <span className={css.artWrap}><TrophyArt award="prime-minister" className={`${css.art} ${honors.primeMinisters.length ? '' : css.dim}`} sizes="120px" /></span>
                        <div className="min-w-0">
                            <p className={`${css.count} ${honors.primeMinisters.length ? 'champion-count' : css.none}`}>{honors.primeMinisters.length}</p>
                            <h3 className={css.name}><Link href={awardHref('prime-minister')} className="hover:underline">Prime Minister’s Trophies</Link></h3>
                            <p className={css.honor}>Most regular-season fantasy points</p>
                            {honors.primeMinisters.length > 0 && <div className={css.slabs}>
                                {honors.primeMinisters.map((win) => <Link key={win.year} href={teamSeasonHref(win.year, franchiseId)} title={`${formatFpts(win.points)} fantasy points`} className={`${styles.slab} ${styles.slabGold}`}>{seasonLabel(win.year)}</Link>)}
                            </div>}
                        </div>
                    </div>

                    {lostFinal && (
                        <div id="finals-history" className={css.finals}>
                            <h3 className={css.rowLabel}>Finals</h3>
                            <ul className={css.slabs}>
                                {finalYears.map((year) => {
                                    const won = championships.includes(year);
                                    const season = seasons.find((s) => s.year === year);
                                    return <li key={year}>
                                        <Link href={won ? `/season/${year}#championship-roster` : teamSeasonHref(year, franchiseId, season?.finalRound ?? null)}
                                            className={`${styles.slab} ${won ? styles.slabGold : styles.slabSteel}`} title={season?.owner ?? undefined}>
                                            {seasonLabel(year)}<span className={css.result}>{won ? 'Won' : 'Runner-up'}</span>
                                        </Link>
                                    </li>;
                                })}
                            </ul>
                        </div>
                    )}

                    <div className={css.awards}>
                        <h3 className={css.rowLabel}>Individual awards</h3>
                        {awards.length ? <div className={css.awardList}>
                            {awards.map(({ name, wins }) => <details key={name} className={css.award}>
                                <summary>
                                    <TrophyArt award={name} className={css.awardArt} sizes="48px" />
                                    <span className="min-w-0 flex-1">
                                        <span className={css.awardName}>{getAwardDefinition(name)?.label ?? wins[0].label}</span>
                                        <span className={css.honor}>{getAwardDefinition(name)?.honor ?? wins[0].description}</span>
                                    </span>
                                    <span className={css.awardCount}>{wins.length}</span>
                                    <svg viewBox="0 0 20 20" fill="none" className={css.chevron} aria-hidden="true"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                </summary>
                                <ul className={css.winners}>
                                    {wins.map((win) => <li key={`${win.year}-${win.playerId}`}><Link href={playerHref(win.playerId)}>{win.player}</Link><span>{seasonLabel(win.year)}</span></li>)}
                                </ul>
                                <Link href={awardHref(name)} className={css.history}>Award history <Arrow /></Link>
                            </details>)}
                        </div> : <p className={css.empty}>No individual awards recorded for this franchise.</p>}
                    </div>
                </div>
            </div>
        </section>
    );
}
