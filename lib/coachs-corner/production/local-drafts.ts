import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseFactPacket, type FactPacket } from './facts';
import { episodeFrom, type Episode } from '../episode';
import { parseScript, refKey, statsSeason, type Diagnostic, type PlayerRef } from '../script';
import { snapshotDiagnostics } from '../player-snapshot';
import { artUrl, THEME_URL } from '../media';
import { CURRENT_SOUND_BANK } from '../sound-bank';
import { findPlayer, findTeam } from '../teams';

export const DRAFT_ROOT = 'local/coachs-corner/episodes';
export const validSlug = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80 && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/.test(slug);
export function draftDirectory(slug: string, root = process.cwd()) {
    if (!validSlug(slug)) throw new Error('Use a lowercase episode slug with letters, numbers and hyphens, up to 80 characters.');
    return path.resolve(root, DRAFT_ROOT, slug);
}

export function localPreviewAllowed(environment: string | undefined, host: string | null, hosted = false): boolean {
    return environment === 'development' && !hosted && !!host && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);
}

const inside = (parent: string, child: string) => {
    const relative = path.relative(parent, child);
    return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
};

/** Resolve every file, including symlinks, inside the one allowed draft directory. */
export async function readDraftFile(slug: string, filename: string, root = process.cwd()): Promise<string> {
    if (!['script.txt', 'facts.json', 'pronunciations.json', 'brief.md', 'review.md', 'continuity-proposals.md'].includes(filename)) throw new Error('Unsupported draft file');
    const base = await realpath(path.resolve(root, DRAFT_ROOT));
    const dir = await realpath(draftDirectory(slug, root));
    const file = await realpath(path.join(dir, filename));
    if (!inside(base, dir) || !inside(dir, file)) throw new Error('Draft path escapes the episode directory');
    if ((await stat(file)).size > 5_000_000) throw new Error(`${filename} is too large for a local draft`);
    return readFile(file, 'utf8');
}

export interface Pronunciation { name: string; donName: string }
export interface LocalDraft {
    slug: string;
    script: string;
    facts: FactPacket;
    pronunciations: Pronunciation[];
    brief: string;
    review: string;
    revision: string;
}

export async function loadLocalDraft(slug: string, root = process.cwd()): Promise<LocalDraft> {
    const [script, factsText, namesText, brief, review] = await Promise.all([
        'script.txt', 'facts.json', 'pronunciations.json', 'brief.md', 'review.md',
    ].map(name => readDraftFile(slug, name, root)));
    const pronunciations = JSON.parse(namesText) as Pronunciation[];
    if (!Array.isArray(pronunciations) || !pronunciations.every(p => typeof p.name === 'string' && typeof p.donName === 'string')) throw new Error('Invalid pronunciations.json');
    return { slug, script, facts: parseFactPacket(JSON.parse(factsText)), pronunciations, brief, review,
        revision: createHash('sha256').update(script + factsText + namesText).digest('hex').slice(0, 12) };
}

export async function listLocalDrafts(root = process.cwd()): Promise<string[]> {
    try {
        return (await readdir(path.resolve(root, DRAFT_ROOT), { withFileTypes: true }))
            .filter(entry => entry.isDirectory() && validSlug(entry.name)).map(entry => entry.name).sort().reverse();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
}

/** `coachs:stats --season`: an older stats season lives in the script's stats: key, so publishing quotes it too. */
export function withStatsSeason(script: string, season: number): string {
    const { meta } = parseScript(script);
    if (meta.stats === undefined ? statsSeason(meta) === season : meta.stats === season) return script;
    if (meta.stats !== undefined) throw new Error(`The script already says stats: ${meta.stats}. Change it there, or leave out --season.`);
    const lines = script.split('\n');
    const end = lines[0]?.trim() === '---' ? lines.findIndex((l, n) => n > 0 && l.trim() === '---') : -1;
    const at = lines.findIndex((l, n) => n < end && /^season\s*:/i.test(l.trim()));
    if (at < 0) throw new Error('Add season: to the script front matter before choosing a stats season.');
    lines.splice(at + 1, 0, `stats: ${season}${lines[at].endsWith('\r') ? '\r' : ''}`);
    const out = lines.join('\n');
    const problem = parseScript(out).diagnostics.find(d => d.line === at + 2 && d.severity === 'error');
    if (problem) throw new Error(problem.message);
    return out;
}

export interface DraftReport {
    diagnostics: Diagnostic[];
    /** the segment's length: the runtime without the intro */
    segmentSeconds: number;
    words: { don: number; ron: number };
    art: string[];
}
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The draft as the preview plays it, with warnings for teams the fact packet doesn't know. */
export const draftEpisode = (draft: LocalDraft): Episode =>
    episodeFrom(draft.script, { slug: draft.slug, knownTeam: ref => !!findTeam(draft.facts.teams, ref) });

/** Pass the episode the preview already compiled, so the checks and the preview see the same one. */
export async function checkDraft(draft: LocalDraft, { root = process.cwd(), episode = draftEpisode(draft) }: { root?: string; episode?: Episode } = {}): Promise<DraftReport> {
    const { meta, timeline } = episode;
    const diagnostics = [...episode.diagnostics];
    const report = (severity: 'error' | 'warning', message: string, line = 1) => diagnostics.push({ severity, message, line });
    if (draft.facts.kind === 'live' && meta.season !== draft.facts.season) report('error', 'Script season must match the fact packet ending year.');
    if (draft.facts.period && meta.week !== draft.facts.period.number) report('error', 'Script week must match the exported scoring period.');
    const names = new Set([...episode.playerRefs.map(ref => ref.name), ...draft.pronunciations.map(p => p.name)]);
    for (const name of names) {
        const player = draft.facts.players.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (!player || player.bornInNorthAmerica === null) report('warning', `Unverified birthplace: ${name}. Enrich facts for every named player, including dialogue-only names.`);
        if (player?.bornInNorthAmerica === false) {
            const alias = draft.pronunciations.find(p => p.name.toLowerCase() === name.toLowerCase())?.donName.trim();
            if (!alias || alias.toLowerCase() === name.toLowerCase()) report('error', `Choose Don's mispronunciation for ${name} in pronunciations.json.`);
            const surname = name.split(/\s+/).at(-1)!;
            for (const line of timeline.lines.filter(l => l.speaker === 'don')) {
                if (new RegExp(`(?:^|[^\\p{L}])${escaped(surname)}(?:$|[^\\p{L}])`, 'iu').test(line.text)) {
                    report('error', `Don uses the correct surname for ${name}; use the recorded mispronunciation.`, line.sourceLine);
                }
            }
        }
    }
    // the snapshot coachs:stats captured stands for this script only if it covers every cited player at its stats season
    const captured = draft.facts.playerSnapshot;
    const cited = (ref: PlayerRef) => episode.playerRefs.some(r => refKey(r) === refKey(ref));
    if (episode.playerRefs.length && (!captured || captured.season !== episode.statsSeason ||
        !episode.playerRefs.every(ref => captured.refs.some(r => refKey(r) === refKey(ref))))) {
        report('warning', `The player snapshot wasn't captured for this script's players and stats season; run coachs:stats -- --slug ${draft.slug}.`);
    } else if (captured) diagnostics.push(...snapshotDiagnostics(episode, captured.diagnostics.filter(d => cited(d.ref))));
    // every monitor cue is on the timeline's monitor track, with the line that cued it
    for (const { value: graphic, line } of timeline.monitor) {
        if (graphic.type !== 'gap') continue;
        const seasons = new Set([graphic.base, ...graphic.others].map(ref => findPlayer(draft.facts.players, ref)?.season).filter(season => season != null));
        if (seasons.size > 1) report('error', 'Gap graphics must compare fantasy points from the same archived season.', line);
    }
    const urls = [...timeline.art.flatMap(id => [artUrl(id), artUrl(id, true)]), THEME_URL];
    // File-backed effects and voices must exist even when no explicit sfx cue names them.
    for (const slot of Object.values(CURRENT_SOUND_BANK)) if ('files' in slot.source) urls.push(...slot.source.files);
    for (const url of new Set(urls)) {
        if (!url.startsWith('/') || url.includes('..')) { report('error', `Expected a local public asset: ${url}`); continue; }
        try { if (!(await stat(path.join(root, 'public', url.slice(1)))).isFile()) throw new Error(); }
        catch { report('error', `Missing asset: ${url}`); }
    }
    const words = { don: 0, ron: 0 };
    for (const line of timeline.lines) words[line.speaker] += line.words.length;
    return { diagnostics, segmentSeconds: episode.summary.segment / 1000, words, art: timeline.art };
}
