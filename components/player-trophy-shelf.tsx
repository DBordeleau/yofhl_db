import Link from 'next/link';
import { TrophyArt } from '@/components/trophy-icons';
import TrophySparkles from '@/components/trophy-sparkles';
import { AWARDS, awardHref, getAwardDefinition } from '@/lib/awards';
import { seasonLabel } from '@/lib/league';
import styles from './player-page.module.css';

export interface ShelfTrophy {
    award: string;
    label: string;
    note: string; // the team for Jagr Cups, the honour for awards
    years: number[]; // season end years, oldest first
}

// Jagr Cups first, then each award in league order, with every season it was won
export function shelfTrophies(championships: { season: number; team: string }[], awards: { Award: string; label: string; Year: number }[]): ShelfTrophy[] {
    const shelf: ShelfTrophy[] = [];
    if (championships.length) shelf.push({
        award: 'Jagr Cup',
        label: 'Jagr Cup',
        note: Array.from(new Set(championships.map((c) => c.team))).join(' · '),
        years: championships.map((c) => c.season).sort((a, b) => a - b),
    });
    const grouped = new Map<string, ShelfTrophy>();
    for (const award of awards) {
        const definition = getAwardDefinition(award.Award);
        const key = definition?.id ?? award.Award;
        const entry = grouped.get(key) ?? { award: award.Award, label: definition?.label ?? award.label, note: definition?.honor ?? '', years: [] };
        entry.years.push(award.Year);
        grouped.set(key, entry);
    }
    const order = (trophy: ShelfTrophy) => {
        const index = AWARDS.findIndex((definition) => definition.id === getAwardDefinition(trophy.award)?.id);
        return index < 0 ? AWARDS.length : index;
    };
    return [...shelf, ...Array.from(grouped.values()).sort((a, b) => order(a) - order(b)).map((trophy) => ({ ...trophy, years: trophy.years.sort((a, b) => a - b) }))];
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
