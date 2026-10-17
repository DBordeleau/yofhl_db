import { sql } from 'drizzle-orm';
import { rows } from '../data/db';
import { COACHS_CORNER_TAG, episodeTag, getStudioPlayers } from '../data/coachs-corner';
import { hasErrors, parseScript, playerRefs } from './script';
import { compile, INTRO_MS } from './timeline';

export interface EpisodeInput { id: number | null; slug: string; script: string; publish?: boolean }
export interface EpisodeWrite { id: number; slug: string; oldSlug: string | null; publicChanged: boolean }
export type SaveResult = EpisodeWrite | { error: string };

/** Only public changes invalidate the archive, navigation, and affected episodes. */
export function publicationEffects(change: EpisodeWrite) {
    const slugs = [...new Set([change.oldSlug, change.slug].filter((slug): slug is string => !!slug))];
    return {
        tags: change.publicChanged ? [COACHS_CORNER_TAG, ...slugs.map(episodeTag)] : [],
        paths: ['/admin/coachs-corner', `/admin/coachs-corner/${change.id}`,
            ...(change.publicChanged ? ['/coachs-corner', ...slugs.map(slug => `/coachs-corner/${slug}`)] : [])],
    };
}

const cleanSlug = (raw: string) => raw.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').slice(0, 80).replace(/^-+|-+$/g, '');
const isUniqueViolation = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    return ('code' in error && error.code === '23505') || ('cause' in error && isUniqueViolation(error.cause));
};

// Called only by authenticated server actions. Keeping writes here also lets the
// actual SQL and cache effects be tested against disposable Postgres.
export async function saveEpisodeRecord(input: EpisodeInput): Promise<SaveResult> {
    if (input.id !== null && (!Number.isSafeInteger(input.id) || input.id <= 0)) return { error: 'Invalid episode ID.' };
    const script = parseScript(input.script);
    const publish = input.publish === true;
    if (publish && hasErrors(script)) return { error: 'Fix the errors in the script before publishing.' };
    const slug = cleanSlug(input.slug || script.meta.title || 'episode');
    if (!slug) return { error: 'Give the episode a URL slug.' };
    if (['local', 'audio-preview'].includes(slug)) return { error: 'That URL is reserved. Choose another slug.' };
    const tl = compile(script);
    // Resolve before the write. A failed stats lookup must leave the live episode
    // intact; optional NHL headshots fall back to existing portrait URLs.
    const players = publish ? await getStudioPlayers(playerRefs(script)) : null;
    const snapshot = players === null ? null : JSON.stringify(players);
    const title = script.meta.title || 'Untitled episode';
    const season = script.meta.season ?? null;
    const week = script.meta.week ?? null;
    const duration = Math.round(tl.showEnd - INTRO_MS);
    try {
        const [row] = input.id !== null ? await rows<EpisodeWrite>(sql`
            with previous as materialized (
                select id, slug, published_at from league.coachs_corner_episodes where id = ${input.id} for update
            ), changed as (
                update league.coachs_corner_episodes e
                set slug = ${slug}, title = ${title}, season = ${season}, week = ${week}, script = ${input.script},
                    duration_ms = ${duration}, updated_at = now(), players = ${snapshot}::jsonb,
                    published_at = case when ${publish} then now() else null end
                from previous p where e.id = p.id and (${publish} or p.published_at is null)
                returning e.id, e.slug, p.slug as "oldSlug", (${publish} or p.published_at is not null) as "publicChanged"
            ) select * from changed`)
            : await rows<EpisodeWrite>(sql`
                insert into league.coachs_corner_episodes (slug, title, season, week, script, duration_ms, players, published_at)
                values (${slug}, ${title}, ${season}, ${week}, ${input.script}, ${duration}, ${snapshot}::jsonb,
                    case when ${publish} then now() else null end)
                returning id, slug, null::text as "oldSlug", ${publish}::boolean as "publicChanged"`);
        // The condition lives in the UPDATE, not a separate check: a stale editor
        // cannot save a draft over an episode another tab just published.
        return row ?? { error: 'This episode is published or no longer exists. Reload it and use “Update published episode” to change a live episode.' };
    } catch (error) {
        if (isUniqueViolation(error)) return { error: `Another episode already uses the slug “${slug}”.` };
        throw error;
    }
}

// There is deliberately no publish-by-ID shortcut: publishing must validate the
// submitted script and capture its player snapshot through saveEpisodeRecord.
export async function unpublishEpisodeRecord(id: number): Promise<EpisodeWrite | undefined> {
    const [row] = await rows<EpisodeWrite>(sql`
        update league.coachs_corner_episodes set published_at = null, updated_at = now()
        where id = ${id} and published_at is not null
        returning id, slug, slug as "oldSlug", true as "publicChanged"`);
    return row;
}

export async function deleteEpisodeRecord(id: number): Promise<EpisodeWrite | undefined> {
    const [row] = await rows<EpisodeWrite>(sql`
        delete from league.coachs_corner_episodes where id = ${id}
        returning id, slug, slug as "oldSlug", published_at is not null as "publicChanged"`);
    return row;
}
