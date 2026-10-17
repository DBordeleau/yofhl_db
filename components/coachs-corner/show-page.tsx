import Link from 'next/link';
import type { Episode, EpisodeSummary } from '@/lib/data/coachs-corner';
import type { StudioBanner, StudioPlayer, StudioTeam } from '@/lib/coachs-corner/teams';
import { episodeSeenKey } from '@/lib/coachs-corner/seen';
import { pullQuote } from '@/lib/coachs-corner/pull-quote';
import { episodeShareCard } from '@/lib/share/model';
import { archivoItalic } from './fonts';
import Player from './player';
import styles from './page.module.css';

const runtime = (ms: number) => {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const aired = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null;

export default function ShowPage({ episode, episodes, teams, players, banners }: { episode: Episode; episodes: EpisodeSummary[]; teams: StudioTeam[]; players: StudioPlayer[]; banners: StudioBanner[] }) {
    const index = episodes.findIndex(e => e.slug === episode.slug);
    const previous = index >= 0 ? episodes[index + 1] : undefined;

    return (
        <main className={`${styles.page} ${archivoItalic.variable}`}>
            <div className={styles.inner}>
                <header className={styles.head}>
                    <h1 className={styles.title}>Coach&rsquo;s Corner</h1>
                    <p className={styles.episode}>
                        {episode.week !== null && <b>Week {episode.week}</b>}
                        <span>{episode.title}</span>
                        {aired(episode.publishedAt) && <time dateTime={episode.publishedAt!}>{aired(episode.publishedAt)}</time>}
                    </p>
                </header>

                <Player key={episodeSeenKey(episode)} episodeKey={episodeSeenKey(episode)} script={episode.script} teams={teams} players={players} banners={banners} nextHref={previous ? `/coachs-corner/${previous.slug}` : undefined}
                    share={episodeShareCard(episode, pullQuote(episode.script))} />

                {episodes.length > 1 && (
                    <section className={styles.archive} aria-labelledby="cc-episodes">
                        <h2 id="cc-episodes">Episodes</h2>
                        <ol>
                            {episodes.map(e => (
                                <li key={e.slug}>
                                    <Link href={`/coachs-corner/${e.slug}`} aria-current={e.slug === episode.slug ? 'page' : undefined}>
                                        <span className={styles.week}>{e.week !== null ? <><small>Wk</small>{e.week}</> : '—'}</span>
                                        <span className={styles.name}>{e.title}</span>
                                        <span className={styles.meta}>{[aired(e.publishedAt), runtime(e.durationMs)].filter(Boolean).join(' · ')}</span>
                                    </Link>
                                </li>
                            ))}
                        </ol>
                    </section>
                )}
            </div>
        </main>
    );
}
