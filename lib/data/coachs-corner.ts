import { sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { PILOT_SCRIPT, PILOT_SLUG } from '@/lib/coachs-corner/pilot';
import pilotPlayers from '@/lib/coachs-corner/pilot-players.json';
import { parseScript, playerRefs } from '@/lib/coachs-corner/script';
import { compile } from '@/lib/coachs-corner/timeline';
import type { StudioBanner, StudioPlayer, StudioTeam } from '@/lib/coachs-corner/teams';
import playerPortraits from '@/lib/records/player-portraits.json';
import { fallbackColours } from '@/lib/team-branding';
import { cached, rows } from './db';
import { getBannerSeasons, getFranchiseCards } from './league';
import { getTeamBranding } from './team-branding';

export const COACHS_CORNER_TAG = 'coachs-corner';
export const episodeTag = (slug: string) => `coachs-corner:episode:${slug}`;

export interface EpisodeSummary {
    slug: string;
    title: string;
    season: number | null;
    week: number | null;
    /** the length the player shows, intro bumper included */
    durationMs: number;
    publishedAt: string | null;
}

export interface Episode extends EpisodeSummary {
    script: string;
    players: StudioPlayer[] | null;
}

const pilot = (): Episode => {
    const script = parseScript(PILOT_SCRIPT);
    const { meta, showEnd } = compile(script);
    return {
        slug: PILOT_SLUG, title: meta.title, season: meta.season ?? null, week: meta.week ?? null,
        durationMs: showEnd, publishedAt: meta.date ? `${meta.date}T12:00:00Z` : null, script: PILOT_SCRIPT, players: pilotPlayers,
    };
};

const summary = sql`slug, title, season, week, duration_ms as "durationMs", published_at::text as "publishedAt"`;

/** published episodes, newest first, with the pilot at the end unless it was republished */
export const getPublishedEpisodes = cached(async (): Promise<EpisodeSummary[]> => {
    // A successful empty query can use the pilot. A database failure must reject so
    // Next cannot persist it as an empty archive (or a missing episode).
    const found = await rows<EpisodeSummary>(sql`select ${summary} from league.coachs_corner_episodes
        where published_at is not null order by published_at desc, id desc`);
    if (found.some(r => r.slug === PILOT_SLUG)) return found;
    const p = pilot();
    return [...found, { slug: p.slug, title: p.title, season: p.season, week: p.week, durationMs: p.durationMs, publishedAt: p.publishedAt }];
}, 'coachs-corner-episodes-v4', [COACHS_CORNER_TAG]);

export const getPublishedEpisode = cached(async (slug: string): Promise<Episode | null> => {
    const [row] = await rows<Episode>(sql`select ${summary}, script, players from league.coachs_corner_episodes where slug = ${slug} limit 1`);
    if (row?.publishedAt) return row;
    return slug === PILOT_SLUG ? pilot() : null;
}, 'coachs-corner-episode-v5', slug => [episodeTag(slug)]);

// ---------- admin ----------

export interface AdminEpisode extends Episode { id: number; updatedAt: string }

export const getAllEpisodes = () => rows<EpisodeSummary & { id: number; updatedAt: string }>(sql`
    select ${summary}, id, updated_at::text as "updatedAt" from league.coachs_corner_episodes order by updated_at desc`);

export const getEpisodeById = async (id: number): Promise<AdminEpisode | null> => {
    const [row] = await rows<AdminEpisode>(sql`select ${summary}, id, script, players, updated_at::text as "updatedAt"
        from league.coachs_corner_episodes where id = ${id} limit 1`);
    return row ?? null;
};

export const pilotEpisode = pilot;

// ---------- the teams the monitor can show ----------

const firstName = (owner: string | null) => owner?.split(/\s+/)[0] ?? null;

export const getStudioTeams = async (): Promise<StudioTeam[]> => {
    const [cards, palettes] = await Promise.all([getFranchiseCards(), getTeamBranding()]);
    return cards.filter(card => !card.defunct).map(card => {
        const colours = palettes[card.ID] ?? fallbackColours;
        return {
            id: card.ID, name: card.Team, abbreviation: card.Abbreviation, owner: card.Owner, ownerFirst: firstName(card.Owner),
            logo: card.LogoUrl, primary: colours.primary, secondary: colours.secondary,
        };
    });
};

/** the most recent champions, oldest first, for the rafters behind the desk */
export const getStudioBanners = async (): Promise<StudioBanner[]> => {
    const [seasons, palettes] = await Promise.all([getBannerSeasons(), getTeamBranding()]);
    return seasons.filter(s => s.team && s.abbreviation).slice(-8).map(s => {
        const colours = (s.franchiseId && palettes[s.franchiseId]) || fallbackColours;
        return { label: s.label, team: s.team!, abbreviation: s.abbreviation!, primary: colours.primary, secondary: colours.secondary };
    });
};

// ---------- the players the monitor can show ----------

const portraits: Record<string, string> = playerPortraits;

// the NHL's own headshot is far sharper than the league's 96 px portraits
const nhlHeadshot = unstable_cache(async (name: string, team: string | null): Promise<string | null> => {
    try {
        const search = new URL('https://search.d3.nhle.com/api/v1/search/player');
        search.search = new URLSearchParams({ culture: 'en-us', limit: '20', q: name }).toString();
        const found = await (await fetch(search, { signal: AbortSignal.timeout(5000) })).json() as { playerId: string; name: string; teamAbbrev?: string | null; lastTeamAbbrev?: string | null }[];
        const same = found.filter(p => p.name.toLowerCase() === name.toLowerCase());
        const pick = same.find(p => team && (p.teamAbbrev === team || p.lastTeamAbbrev === team)) ?? same[0];
        if (!pick || !/^\d+$/.test(pick.playerId)) return null;
        const landing = await (await fetch(`https://api-web.nhle.com/v1/player/${pick.playerId}/landing`, { signal: AbortSignal.timeout(5000) })).json() as { headshot?: string };
        return typeof landing.headshot === 'string' && landing.headshot.startsWith('https://') ? landing.headshot : null;
    } catch {
        return null;
    }
}, ['coachs-corner-headshot-v1'], { revalidate: 60 * 60 * 24 * 7 });

/** last season's fantasy line for each named player, plus a headshot */
const studioPlayerStats = async (names: string[]): Promise<StudioPlayer[]> => {
    const selected = Array.from(new Map(names.map(n => [n.trim().toLowerCase(), n.trim()])).values()).filter(Boolean).slice(0, 20);
    const wanted = selected.map(name => name.toLowerCase());
    if (!wanted.length) return [];
    const found = await rows<{ id: string; name: string; season: number; nhl_team: string | null; positions: string[]; fpts: number; fpg: number }>(sql`
            select distinct on (p.id) replace(p.id, '*', '') as id, p.name, ps.season_year as season, ps.nhl_team, ps.positions,
                   ps.fpts::float8 as fpts, ps.fpg::float8 as fpg
            from league.players p join league.player_seasons ps on ps.player_id = p.id
            where lower(p.name) in ${wanted}
            order by p.id, ps.season_year desc`);
    return selected.map(name => {
        // the most recent season wins when two players share a name
        const row = found.filter(r => r.name.toLowerCase() === name.trim().toLowerCase()).sort((a, b) => b.season - a.season)[0];
        const headshot = row ? portraits[row.id] ?? null : null;
        return {
            name: row?.name ?? name, headshot, nhlTeam: row?.nhl_team ?? null, positions: row?.positions ?? [],
            season: row?.season ?? null, fpts: row?.fpts ?? null, fpg: row?.fpg ?? null,
            games: row && row.fpg ? Math.round(row.fpts / row.fpg) : null,
        };
    });
};

/** Admin preview/publication only: NHL lookups never run while serving a public page. */
export const getStudioPlayers = async (names: string[]): Promise<StudioPlayer[]> => {
    const players = await studioPlayerStats(names);
    return Promise.all(players.map(async player => ({ ...player,
        headshot: await nhlHeadshot(player.name, player.nhlTeam) ?? player.headshot,
    })));
};

// Legacy database episodes use cached league statistics and local portrait URLs
// until explicitly republished with a frozen snapshot. The pilot has its own snapshot.
const legacyPlayers = cached(studioPlayerStats, 'coachs-corner-player-stats-v1');
export const getEpisodePlayers = (episode: Episode): Promise<StudioPlayer[]> =>
    episode.players !== null ? Promise.resolve(episode.players) : legacyPlayers(playerRefs(parseScript(episode.script)));
