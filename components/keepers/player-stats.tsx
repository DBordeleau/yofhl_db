import { keeperPosition, type KeeperPlayer } from '@/lib/keepers/model';
import styles from './keepers.module.css';

const number = (value: number | null | undefined, digits = 0) => value == null ? '—' : value.toLocaleString('en-CA', { maximumFractionDigits: digits });
export default function PlayerStats({ player }: { player: KeeperPlayer }) {
    const details = player.details;
    const stats = details?.stats;
    return <span className={styles.statsLine}>
        <span className={styles.statsYear}>25–26</span>
        {!stats ? <span>NHL stats unavailable</span> : stats.games === 0 ? <span>No NHL games</span> : <>
            <span><b>{number(stats.games)}</b> GP</span>
            {keeperPosition(player) === 'G' ? <><span><b>{number(stats.wins)}</b> W</span><span><b>{stats.gaa == null ? '—' : stats.gaa.toFixed(2)}</b> GAA</span><span><b>{stats.savePct == null ? '—' : stats.savePct.toFixed(3).replace(/^0/, '')}</b> SV%</span></>
                : <><span><b>{number(stats.goals)}</b> G</span><span><b>{number(stats.assists)}</b> A</span><span><b>{number(stats.points)}</b> P</span></>}
        </>}
        <span className={styles.fantasyStat}><b>{number(details?.fantasyPoints, 2)}</b> FP</span><span className={styles.fantasyStat}><b>{number(details?.fantasyPerGame, 2)}</b> FP/G</span>
    </span>;
}
