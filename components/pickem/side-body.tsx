import type { ReactNode } from 'react';
import TeamBadge from '@/components/team-badge';
import { formatFpts } from '@/lib/league';
import type { LeagueStanding, PickemFranchise } from '@/lib/pickem/create-pickem';
import styles from './pickem.module.css';

interface Props {
    franchise: PickemFranchise;
    /** the club's league standing, shown under its name while the week can be picked */
    standing?: LeagueStanding | null;
    /** a slab butted onto the standing, toward the seam (the open week's pick) */
    tapeEnd?: ReactNode;
    /** anything else the side adds under its name (a pick stamp where there is no standing to butt it onto) */
    children?: ReactNode;
    /** keep room for the name at the narrowest the side gets (an open week, where picks move the seam) */
    holdRoom?: boolean;
}

/** A strip side's club: its logo, its name and, when known, its W-L-T record and fantasy points */
export default function SideBody({ franchise, standing, tapeEnd, children, holdRoom = false }: Props) {
    const name = <span className={styles.name}>{franchise.name}</span>;
    return <>
        <span className={styles.logo}>
            <TeamBadge logo={franchise.logo} abbreviation={franchise.abbreviation} teamName={franchise.name} size={74} sizeClass={styles.logoMark} />
        </span>
        <span className={styles.who}>
            {holdRoom ? <span className={styles.nameRoom}>
                {name}
                <span className={`${styles.name} ${styles.nameGhost}`} aria-hidden="true">{franchise.name}</span>
            </span> : name}
            {standing && <span className={styles.tape}>
                <span className={styles.tapeRecord}><span className="sr-only">Record </span>{standing.record.replaceAll('-', '–')}</span>
                {tapeEnd}
                <span className={styles.tapePoints}>{formatFpts(standing.points)}<small><abbr title="Fantasy points">FPts</abbr></small></span>
            </span>}
            {children}
        </span>
    </>;
}
