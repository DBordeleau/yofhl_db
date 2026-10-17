import Link from 'next/link';
import Chases from './chases';
import { getRecordBook } from '@/lib/records/data';
import styles from './records.module.css';

export default async function HomeRecords() {
    const book = await getRecordBook();
    const highlights = book.records.filter(r => ['repeat-finals', 'player-season', 'season-points', 'scoring-titles'].includes(r.id) && r.entries.length);
    const highlight = highlights[Math.floor(Date.now() / (7 * 86400000)) % highlights.length];
    const holder = highlight?.entries[0];
    return <section id="records" className={styles.homePreview} aria-labelledby="home-records-heading">
        <div className={styles.sectionHeading}><h2 id="home-records-heading">On the horizon</h2><Link href="/records">Record book →</Link></div>
        <div className={styles.previewGrid}>
            {book.liveYear && book.chases.length ? <Chases chases={book.chases.slice(0, 2)} teams={book.teams} year={book.liveYear} compact /> : <p>Current scoring unavailable.</p>}
            {holder ? <Link className={styles.spotlight} href={`/records?category=${highlight.category}&record=${highlight.id}#record-archive`}><span>{highlight.title}</span><strong>{holder.value.toLocaleString('en-US')}<small>{highlight.unit}</small></strong><b>{holder.name}</b><span>{holder.detail}</span><span className={styles.spotlightArrow} aria-hidden="true">→</span></Link> : null}
        </div>
    </section>;
}
