import Link from 'next/link';
import { archivoItalic } from '@/components/coachs-corner/fonts';
import NewEpisodeBadge from '@/components/coachs-corner/new-episode-badge';
import type { EpisodeSummary } from '@/lib/data/coachs-corner';
import { artUrl } from '@/lib/coachs-corner/media';
import { episodeSeenKey } from '@/lib/coachs-corner/seen';
import styles from './hero-studio.module.css';

const runtime = (ms: number) => {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// stored titles may repeat the show name ("Coach's Corner: draft and opening matchups")
const episodeTitle = (title: string) => {
    const bare = title.replace(/^coach['’]s corner\s*[:·–-]\s*/i, '').trim() || title;
    return bare.charAt(0).toUpperCase() + bare.slice(1);
};

// lazy so the hosts never download on screens narrow enough to hide the studio
const Host = ({ pose, className }: { pose: string; className: string }) => <picture>
    <source type="image/avif" srcSet={artUrl(pose, true, 'avif')} />
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className={className} src={artUrl(pose, true)} alt="" width={640} height={640} loading="lazy" decoding="async" draggable={false} />
</picture>;

// The latest Coach's Corner episode on a hung studio monitor, Don and Ron at the desk below it.
export default function HeroStudio({ episode }: { episode: EpisodeSummary }) {
    const title = episodeTitle(episode.title);
    const length = runtime(episode.durationMs);
    const label = `Watch Coach's Corner${episode.week !== null ? `, week ${episode.week}` : ''}: ${title}, ${length}`;

    return <div className={`${styles.studio} ${archivoItalic.variable}`}><div className={styles.set}>
        <span className={styles.rig} aria-hidden="true"><i /><i /></span>
        <Link href="/coachs-corner" className={styles.monitor} aria-label={label}>
            <span className={styles.screen}>
                <span className={styles.slabs}>
                    <span className={styles.show}>Coach&rsquo;s Corner</span>
                    {episode.week !== null && <span className={styles.week}>Week {episode.week}</span>}
                    <span className={styles.badge}><NewEpisodeBadge episodeKey={episodeSeenKey(episode)} /></span>
                </span>
                <span className={styles.title}>{title}</span>
                <span className={styles.play}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>
                    Watch<span className={styles.runtime}>{length}</span>
                </span>
            </span>
        </Link>
        <span className={styles.desk} aria-hidden="true" />
        <Host pose="don-point-talk" className={`${styles.host} ${styles.don}`} />
        <Host pose="ron-skeptical-talk" className={`${styles.host} ${styles.ron}`} />
    </div></div>;
}
