import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseFactPacket, type FactPacket } from './facts';
import { parseScript, playerRefs, type Diagnostic } from '../script';
import { compile, INTRO_MS } from '../timeline';
import { artUrl, THEME_URL } from '../media';
import { CURRENT_SOUND_BANK } from '../sound-bank';
import { findTeam } from '../teams';

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

export interface DraftReport {
    diagnostics: Diagnostic[];
    durationSeconds: number;
    words: { don: number; ron: number };
    art: string[];
}
const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function checkDraft(draft: LocalDraft, root = process.cwd()): Promise<DraftReport> {
    const parsed = parseScript(draft.script, { knownTeam: ref => !!findTeam(draft.facts.teams, ref) });
    const timeline = compile(parsed);
    const diagnostics = [...parsed.diagnostics];
    const report = (severity: 'error' | 'warning', message: string, line = 1) => diagnostics.push({ severity, message, line });
    if (draft.facts.kind === 'live' && parsed.meta.season !== draft.facts.season) report('error', 'Script season must match the fact packet ending year.');
    if (draft.facts.period && parsed.meta.week !== draft.facts.period.number) report('error', 'Script week must match the exported scoring period.');
    const names = new Set([...playerRefs(parsed), ...draft.pronunciations.map(p => p.name)]);
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
    for (const name of playerRefs(parsed)) {
        const player = draft.facts.players.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (!player || player.fpts === null || player.fpg === null || player.season === null) report('warning', `No complete frozen fantasy statistics for ${name}; run coachs:stats -- --slug ${draft.slug}. Resolve missing archive records with sourced evidence or an honest graphic fallback.`);
    }
    for (const event of parsed.events) {
        const cues = event.kind === 'stage' ? event.cues : event.parts.flatMap(part => part.kind === 'cue' ? [part.cue] : []);
        for (const cue of cues) {
            if (cue.type !== 'monitor' || cue.graphic.type !== 'gap') continue;
            const seasons = new Set([cue.graphic.base, ...cue.graphic.others].map(name =>
                draft.facts.players.find(p => p.name.toLowerCase() === name.toLowerCase())?.season).filter(season => season != null));
            if (seasons.size > 1) report('error', 'Gap graphics must compare fantasy points from the same archived season.', event.line);
        }
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
    return { diagnostics, durationSeconds: (timeline.showEnd - INTRO_MS) / 1000, words, art: timeline.art };
}
