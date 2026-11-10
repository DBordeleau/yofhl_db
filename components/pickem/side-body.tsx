import type { ReactNode } from 'react';
import TeamBadge from '@/components/team-badge';
import type { PickemFranchise } from '@/lib/pickem/create-pickem';
import styles from './pickem.module.css';

/** A strip side's club: its logo, name and, when known, its owner, then anything the side adds (the pick stamp) */
export default function SideBody({ franchise, owner, children }: { franchise: PickemFranchise; owner?: string | null; children?: ReactNode }) {
    return <>
        <span className={styles.logo}>
            <TeamBadge logo={franchise.logo} abbreviation={franchise.abbreviation} teamName={franchise.name} size={74} sizeClass={styles.logoMark} />
        </span>
        <span className={styles.who}>
            <span className={styles.name}>{franchise.name}</span>
            {owner && <span className={styles.owner}>{owner}</span>}
            {children}
        </span>
    </>;
}
