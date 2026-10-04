'use client';

import { useEffect, useRef } from 'react';
import { CALDER_SEASON_LABEL, KEEPER_TOTAL_LIMIT, POSITION_LABELS, type remainingKeeperAllowance } from '@/lib/keepers/model';
import styles from './keepers.module.css';

interface Props {
    allowance: ReturnType<typeof remainingKeeperAllowance>;
    minorCount: number;
    onReview: () => void;
    onConfirm: () => void;
}

export default function UnusedAllowanceDialog({ allowance, minorCount, onReview, onConfirm }: Props) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const reviewRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        const dialog = dialogRef.current!;
        dialog.showModal();
        reviewRef.current?.focus();
        return () => dialog.close();
    }, []);
    function review() {
        dialogRef.current?.close();
        onReview();
    }
    function confirm() {
        dialogRef.current?.close();
        onConfirm();
    }

    return <dialog ref={dialogRef} className={styles.confirmDialog} aria-labelledby="unused-keepers-title" aria-describedby="unused-keepers-description"
        onCancel={event => { event.preventDefault(); review(); }}>
        <h2 id="unused-keepers-title">You have unused keeper spots</h2>
        <p id="unused-keepers-description">Your list is valid. You can submit it now or go back to use the remaining allowance.</p>
        {allowance.regular > 0 && <section className={styles.unusedRegular} aria-label="Unused regular keeper spots">
            <h3>{allowance.regular} regular {allowance.regular === 1 ? 'spot' : 'spots'} unused <span>{KEEPER_TOTAL_LIMIT - allowance.regular}/{KEEPER_TOTAL_LIMIT} selected</span></h3>
            <p>You can keep {allowance.regular} more {allowance.regular === 1 ? 'player' : 'players'} total, within these position limits:</p>
            <dl>{(['F', 'D', 'G'] as const).filter(position => allowance.positions[position] > 0).map(position => <div key={position}><dt>{POSITION_LABELS[position]}</dt><dd>Up to {allowance.positions[position]} more</dd></div>)}</dl>
            <p className={styles.dialogNote}>All positions share the same {allowance.regular} remaining {allowance.regular === 1 ? 'spot' : 'spots'}.</p>
        </section>}
        {allowance.rookie && <section className={styles.unusedRookie} aria-label="Unused free rookie keeper">
            <h3>1 free rookie spot unused</h3>
            <p>If you have a player who was eligible for the <strong>{CALDER_SEASON_LABEL} Calder Memorial Trophy</strong>, you can keep them outside the {KEEPER_TOTAL_LIMIT}-player and position limits. Eligibility is subject to admin review.</p>
        </section>}
        <p className={styles.dialogNote}>{minorCount > 0 ? `All ${minorCount} minor-bench ${minorCount === 1 ? 'player is' : 'players are'} automatically kept for free.` : 'Minor-bench players are automatically kept for free.'}</p>
        <div className={styles.dialogActions}><button ref={reviewRef} type="button" onClick={review}>Review selections</button><button type="button" onClick={confirm}>Submit anyway</button></div>
    </dialog>;
}
