import styles from './draft-class.module.css';

export default function FptsLegend({ labels }: { labels: string[] }) {
    return <div className={styles.legend}>
        <div className={styles.legendTitle}>SEASON FPTS</div>
        <div className={styles.legendBar} aria-hidden="true"><span /><span /><span /><span /></div>
        <div className={styles.legendLabels}>{labels.map(label => <span key={label}>{label}</span>)}</div>
    </div>;
}
