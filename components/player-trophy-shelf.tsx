import Link from 'next/link';
import { TrophyArt } from '@/components/trophy-icons';
import TrophySparkles from '@/components/trophy-sparkles';
import { awardHref, catalogueOrder } from '@/lib/awards';
import type { PlayerHonors } from '@/lib/data/award-archive';
import { seasonLabel } from '@/lib/league';
import styles from './player-page.module.css';

export interface ShelfTrophy {
    award: string;
    label: string;
    note: string; // the team for Jagr Cups, the honour for awards
    years: number[]; // season end years, newest first
}

// Jagr Cups first, then each award in catalogue order, with every season it was won
export function shelfTrophies({ championships, awards }: PlayerHonors): ShelfTrophy[] {
    const shelf: ShelfTrophy[] = [];
    const cups = [...championships].sort((a, b) => b.season - a.season);
    if (cups.length) shelf.push({
        award: 'Jagr Cup',
        label: 'Jagr Cup',
        note: Array.from(new Set(cups.map((c) => c.team))).join(' · '),
        years: cups.map((c) => c.season),
    });
    const grouped = new Map<string, ShelfTrophy>();
    for (const award of [...awards].sort((a, b) => catalogueOrder(a.id) - catalogueOrder(b.id))) {
        const entry = grouped.get(award.id) ?? { award: award.name, label: award.label, note: award.honor, years: [] };
        entry.years.push(award.year);
        grouped.set(award.id, entry);
    }
    return [...shelf, ...Array.from(grouped.values()).map((trophy) => ({ ...trophy, years: trophy.years.sort((a, b) => b - a) }))];
}

// One navy band under the stage: a column per trophy, split by hairlines
export default function PlayerTrophyShelf({ trophies, seed }: { trophies: ShelfTrophy[]; seed: string }) {
    if (!trophies.length) return null;
    return (
        <section className={styles.shelf} aria-label="Trophy case">
            <div className={styles.wrap}>
                <ul className={styles.shelfGrid}>
                    {trophies.map((trophy) => {
                        const cup = trophy.award === 'Jagr Cup';
                        return (
                            <li key={trophy.award} className={styles.trophy}>
                                <span className={styles.artWrap}>
                                    <TrophyArt award={trophy.award} className={styles.art} sizes="(min-width: 1800px) 116px, 92px" />
                                    {cup && <TrophySparkles seed={`${seed}-shelf`} />}
                                </span>
                                <div className={styles.trophyText}>
                                    <span className={styles.count}>{trophy.years.length}</span>
                                    <Link href={awardHref(trophy.award)} className={styles.trophyName}>{trophy.label}</Link>
                                    {trophy.note && <span className={styles.honor}>{trophy.note}</span>}
                                    <span className={styles.years}>
                                        {trophy.years.map((year) => (
                                            <Link key={year} href={cup ? `/season/${year}#championship-roster` : `/season/${year}`} className={styles.year}>{seasonLabel(year)}</Link>
                                        ))}
                                    </span>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </section>
    );
}
