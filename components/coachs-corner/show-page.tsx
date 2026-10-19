import type { Episode, EpisodeSummary } from '@/lib/data/coachs-corner';
import type { StudioBanner, StudioPlayer, StudioTeam } from '@/lib/coachs-corner/teams';
import { episodeSeenKey } from '@/lib/coachs-corner/seen';
import { pullQuote } from '@/lib/coachs-corner/pull-quote';
import { episodeShareCard } from '@/lib/share/model';
import { episodeLabel } from '@/lib/coachs-corner/episode-label';
import { archivoItalic } from './fonts';
import EpisodePicker, { type PickerEpisode } from './episode-picker';
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
    const label = episodeLabel(episode);
    const guide: PickerEpisode[] = (index >= 0 ? episodes : [episode, ...episodes]).map(e => ({
        slug: e.slug, href: `/coachs-corner/${e.slug}`, label: episodeLabel(e), title: e.title,
        aired: aired(e.publishedAt), airedIso: e.publishedAt, runtime: runtime(e.durationMs), seenKey: episodeSeenKey(e),
    }));

    return (
        <main className={`${styles.page} ${archivoItalic.variable}`}>
            <div className={styles.inner}>
                <header className={styles.head}>
                    <h1 className={styles.title}>Coach&rsquo;s Corner</h1>
                    <EpisodePicker episodes={guide} current={episode.slug} />
                </header>

                <Player key={episodeSeenKey(episode)} episodeKey={episodeSeenKey(episode)} script={episode.script} teams={teams} players={players} banners={banners} label={label}
                    nextHref={previous ? `/coachs-corner/${previous.slug}` : undefined}
                    share={episodeShareCard(episode, pullQuote(episode.script))} />
            </div>
        </main>
    );
}
