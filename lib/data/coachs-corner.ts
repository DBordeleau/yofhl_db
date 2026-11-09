import { sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { PILOT_SCRIPT, PILOT_SLUG } from '@/lib/coachs-corner/pilot';
import pilotPlayers from '@/lib/coachs-corner/pilot-players.json';
import pilotTeams from '@/lib/coachs-corner/pilot-teams.json';
import { episodeFrom, scriptAirDate, type Episode as CompiledEpisode } from '@/lib/coachs-corner/episode';
import { forgiving, nhlLive, noNhl, playerSnapshot, type PlayerSnapshot } from '@/lib/coachs-corner/player-snapshot';
import type { PlayerRef } from '@/lib/coachs-corner/script';
import type { StudioBanner, StudioPlayer, StudioTeam } from '@/lib/coachs-corner/teams';
import { fallbackColours } from '@/lib/team-branding';
import { loadStudioTeams } from '@/lib/coachs-corner/studio-teams';
import { leagueTags } from './cache-tags';
import { cached, rows } from './db';
import { getSeasonArchive } from './league';
import { seasonLabel } from '../seasons';
import { getTeamBranding } from './team-branding';

export const COACHS_CORNER_TAG = 'coachs-corner';
export const episodeTag = (slug: string) => `coachs-corner:episode:${slug}`;

export interface EpisodeSummary {
    /** null for the bundled pilot until it is saved to the database */
    id: number | null;
    slug: string;
    title: string;
    season: number | null;
    week: number | null;
    /** the episode's runtime, intro included: what the player clock shows. A cache of the episode module's summary. */
    durationMs: number;
    publishedAt: string | null;
}

export interface Episode extends EpisodeSummary {
    script: string;
    players: StudioPlayer[] | null;
    /** the team snapshot (GLOSSARY.md); null for drafts and episodes published before it existed */
    teams: StudioTeam[] | null;
}

const pilot = (): Episode => {
    const { summary } = episodeFrom(PILOT_SCRIPT, { slug: PILOT_SLUG });
    return {
        id: null, slug: PILOT_SLUG, title: summary.title, season: summary.season, week: summary.week,
        durationMs: summary.runtime, publishedAt: scriptAirDate(summary.date), script: PILOT_SCRIPT, players: pilotPlayers, teams: pilotTeams,
    };
};

const summary = sql`id, slug, title, season, week, duration_ms as "durationMs", published_at::text as "publishedAt"`;

/** published episodes, newest first, with the pilot at the end unless it was republished */
export const getPublishedEpisodes = cached(async (): Promise<EpisodeSummary[]> => {
    // A successful empty query can use the pilot. A database failure must reject so
    // Next cannot persist it as an empty archive (or a missing episode).
    const found = await rows<EpisodeSummary>(sql`select ${summary} from league.coachs_corner_episodes
        where published_at is not null order by published_at desc, id desc`);
    if (found.some(r => r.slug === PILOT_SLUG)) return found;
    const p = pilot();
    return [...found, { id: p.id, slug: p.slug, title: p.title, season: p.season, week: p.week, durationMs: p.durationMs, publishedAt: p.publishedAt }];
}, 'coachs-corner-episodes-v6', [COACHS_CORNER_TAG]);

export const getPublishedEpisode = cached(async (slug: string): Promise<Episode | null> => {
    const [row] = await rows<Episode>(sql`select ${summary}, script, players, teams from league.coachs_corner_episodes where slug = ${slug} limit 1`);
    if (row?.publishedAt) return row;
    return slug === PILOT_SLUG ? pilot() : null;
}, 'coachs-corner-episode-v8', slug => [episodeTag(slug)]);

// ---------- admin ----------

export interface AdminEpisode extends Episode { id: number; updatedAt: string }

export const getAllEpisodes = () => rows<EpisodeSummary & { id: number; updatedAt: string }>(sql`
    select ${summary}, updated_at::text as "updatedAt" from league.coachs_corner_episodes order by updated_at desc`);

export const getEpisodeById = async (id: number): Promise<AdminEpisode | null> => {
    const [row] = await rows<AdminEpisode>(sql`select ${summary}, script, players, teams, updated_at::text as "updatedAt"
        from league.coachs_corner_episodes where id = ${id} limit 1`);
    return row ?? null;
};

export const pilotEpisode = pilot;

// ---------- the teams the monitor can show ----------

/** The live studio team list. An owner's rename or new colours expire it through the tags they already expire. */
export const getStudioTeams = cached(() => loadStudioTeams(), 'coachs-corner-studio-teams-v1', [leagueTags.franchiseCards, leagueTags.branding]);

/** An episode shows the teams it aired with. One published before team snapshots follows the live list until republished. */
export const getEpisodeTeams = (episode: Pick<Episode, 'teams'>): Promise<StudioTeam[]> =>
    episode.teams !== null ? Promise.resolve(episode.teams) : getStudioTeams();

/** the most recent champions, oldest first, for the rafters behind the desk */
export const getStudioBanners = async (): Promise<StudioBanner[]> => {
    const [{ seasons }, palettes] = await Promise.all([getSeasonArchive(), getTeamBranding()]);
    return seasons.filter(s => s.team && s.abbreviation).slice(-8).map(s => {
        const colours = (s.franchiseId && palettes[s.franchiseId]) || fallbackColours;
        return { label: seasonLabel(s.year), team: s.team!, abbreviation: s.abbreviation!, primary: colours.primary, secondary: colours.secondary };
    });
};

// ---------- the players the monitor can show ----------

// the NHL's own headshot is far sharper than the league's 96 px portraits
const week = 60 * 60 * 24 * 7;
// an outage rejects inside the cache, so only real answers are kept and the next publish asks again
const cachedNhl = forgiving({
    search: unstable_cache(nhlLive.search, ['coachs-corner-nhl-search-v1'], { revalidate: week }),
    headshot: unstable_cache(nhlLive.headshot, ['coachs-corner-nhl-headshot-v1'], { revalidate: week }),
});

/** Admin preview and publishing only: NHL lookups never run while serving a public page. */
export const getPlayerSnapshot = (season: number | null, refs: PlayerRef[]): Promise<PlayerSnapshot> =>
    playerSnapshot(season, refs, { portraits: cachedNhl });

// Episodes stored without a snapshot resolve under the same policy at their own stats season, with
// Fantrax portraits only, until explicitly republished. The pilot has its own snapshot.
const legacyPlayers = cached(async (season: number | null, refs: PlayerRef[]): Promise<StudioPlayer[]> =>
    (await playerSnapshot(season, refs, { portraits: noNhl })).players, 'coachs-corner-legacy-players-v1');
/** `compiled` is the episode module's output, so the loader never parses a script itself. */
export const getEpisodePlayers = (episode: Episode, compiled: Pick<CompiledEpisode, 'statsSeason' | 'playerRefs'>): Promise<StudioPlayer[]> =>
    episode.players !== null ? Promise.resolve(episode.players) : legacyPlayers(compiled.statsSeason, compiled.playerRefs);
