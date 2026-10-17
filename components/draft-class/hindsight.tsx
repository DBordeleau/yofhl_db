import StealsCountdown from './steals-countdown';
import WhatIfBoard from './what-if-board';
import { topSteals, type rankDraft } from '@/lib/draft/hindsight';
import type { SeasonDraftSelection } from '@/lib/history/model';
import styles from './draft-class.module.css';

export default function Hindsight({ year, picks, ranked, initialPick }: {
    year: number; picks: SeasonDraftSelection[]; ranked: ReturnType<typeof rankDraft>; initialPick?: number;
}) {
    const steals = topSteals(ranked);
    const rounds = new Set(picks.map(pick => pick.round)).size;
    return <div className={styles.view} style={{ gap: 44 }}>
        {steals.length ? <StealsCountdown year={year} steals={steals} totalPicks={picks.length} rounds={rounds} /> : <p className={styles.empty}>No selection outperformed its draft slot.</p>}
        <WhatIfBoard picks={picks} ranked={ranked} initialPick={initialPick} />
    </div>;
}
