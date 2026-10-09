import { KEEPER_TOTAL_LIMIT } from '@/lib/keepers/model';
import styles from './keepers.module.css';
import Arrow from '@/components/arrow';

interface Props {
    minorCount: number;
    fantraxUrl: string;
    checkedAt: string;
    disabled: boolean;
    refreshing: boolean;
    error: string;
    message: string;
    onRefresh: () => void;
}

export default function RosterRefresh({ minorCount, fantraxUrl, checkedAt, disabled, refreshing, error, message, onRefresh }: Props) {
    const openSpots = Math.max(0, 2 - minorCount);
    const steps = <ol className={styles.refreshSteps}>
        <li><strong>Put the players you want to keep for free on your minor bench.</strong><p>Open your team’s roster in Fantrax and check who is on your minor bench. {openSpots
            ? 'Fill any empty minor spots with eligible players you want to keep from your active lineup or regular bench.'
            : 'If you want different players as your free minor keeps, swap your chosen eligible players onto the minor bench.'} Save your roster changes in Fantrax.</p></li>
        <li><strong>Come back here and refresh.</strong><p>Select <b>Refresh from Fantrax</b> below. Check that the players you want as free minor keeps appear in the <b>Minor bench</b> section of this form.</p></li>
        <li><strong>Submit your updated keeper list.</strong><p>Review your selections, then use the submit button below the keeper allowance. Refreshing alone does not submit your keepers.</p></li>
    </ol>;

    return <section className={styles.refreshPanel} aria-labelledby="minor-setup-heading">
        <div className={styles.refreshIntro}>
            <span className={styles.minorProgress}>{minorCount} of 2 minor spots filled</span>
            <h2 id="minor-setup-heading">{openSpots ? `Use your ${openSpots === 1 ? 'remaining free minor keep' : '2 free minor keeps'}` : 'The minor bench is kept for free'}</h2>
            {openSpots ? <><p>Players on your Fantrax minor bench are automatically kept for free. They do not use any of your <strong>{KEEPER_TOTAL_LIMIT} regular keeper spots</strong> or your <strong>free rookie keep</strong>.</p><p>You have {openSpots} {openSpots === 1 ? 'open spot' : 'open spots'}. Before choosing your keepers, check whether anyone on your active lineup or regular bench is eligible for the minor bench. Moving them there lets you keep them for free.</p></>
                : <p>The players currently on your Fantrax minor bench are automatically kept for free. They do not use any of your {KEEPER_TOTAL_LIMIT} regular keeper spots or your free rookie keep.</p>}
        </div>
        {openSpots ? steps : <details className={styles.refreshHelp}><summary>How to update your minor bench for this keeper form</summary>{steps}</details>}
        <div className={styles.refreshActions}>
            <a href={fantraxUrl} target="_blank" rel="noopener noreferrer">Open Fantrax <span><Arrow direction="out" /> <span className="sr-only">in a new tab</span></span></a>
            <button type="button" disabled={disabled} onClick={onRefresh}>{refreshing ? 'Refreshing…' : 'Refresh from Fantrax'}</button>
            <small>Roster last checked {checkedAt} Eastern</small>
        </div>
        {error && <p role="alert" className={styles.refreshError}>{error}</p>}
        {message && <p role="status" className={styles.refreshMessage}>{message}</p>}
    </section>;
}
