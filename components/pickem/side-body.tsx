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
}

/** A strip side's club: its logo, its name and, when known, its W-L-T record and fantasy points */
export default function SideBody({ franchise, standing, tapeEnd, children }: Props) {
    return <>
        <span className={styles.logo}>
            <TeamBadge logo={franchise.logo} abbreviation={franchise.abbreviation} teamName={franchise.name} size={74} sizeClass={styles.logoMark} />
        </span>
        <span className={styles.who}>
            <span className={styles.name}>{franchise.name}</span>
            {standing && <span className={styles.tape}>
                <span className={styles.tapeRecord}><span className="sr-only">Record </span>{standing.record.replaceAll('-', '–')}</span>
                {tapeEnd}
                <span className={styles.tapePoints}>{formatFpts(standing.points)}<small><abbr title="Fantasy points">FPts</abbr></small></span>
            </span>}
            {children}
        </span>
    </>;
}
