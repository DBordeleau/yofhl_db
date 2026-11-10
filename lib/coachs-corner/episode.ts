import { compileAudioCues, type AudioCue } from './audio-cues';
import { episodeLabel } from './episode-label';
import { pullQuote, type PullQuote } from './pull-quote';
import { graphicPlayers, parseScript, playerRefs, refKey, statsSeason, type Diagnostic, type Meta, type PlayerRef, type TeamRef } from './script';
import { teamDiagnostics, type StudioTeam } from './teams';
import { compile, frameAt, type Frame, type Timeline } from './timeline';
import { INTRO_MS } from './transport';

// The only place a script is parsed and compiled. Every surface (player, editor, pages, publishing,
// production tools) reads one episode from here instead of deriving its own answers.
// Pure and plain data: no database, network or filesystem, and the output crosses the server/client boundary.

/** Before the first play the studio shows its opening picture, the set as the segment begins, not the bumper. */
export const OPENING_PICTURE_MS = 5999;

export interface ScriptSummary {
    title: string;
    season: number | null;
    week: number | null;
    /** front-matter date, YYYY-MM-DD */
    date: string | null;
    /** show time at normal speed to the end of the last line, intro included: what the player clock shows */
    runtime: number;
    /** runtime without the intro; production tools only */
    segment: number;
    players: PlayerRef[];
}

export interface Episode {
    meta: Meta;
    diagnostics: Diagnostic[];
    hasErrors: boolean;
    timeline: Timeline;
    audioCues: AudioCue[];
    openingPicture: Frame;
    pullQuote: PullQuote | null;
    /** the episode's schedule slot: "Pilot" or "Week N" */
    label: string | null;
    playerRefs: PlayerRef[];
    /** every team the graphics name, with its line */
    teamRefs: TeamRef[];
    /** the season the player cards quote (GLOSSARY.md: player snapshot) */
    statsSeason: number | null;
    summary: ScriptSummary;
}

export interface EpisodeOptions {
    /** how the label tells the pilot apart */
    slug?: string;
    /** the team list to check team cues against; its errors join the diagnostics but never change the compiled episode */
    teams?: StudioTeam[];
}

export function episodeFrom(source: string, { slug, teams }: EpisodeOptions = {}): Episode {
    const script = parseScript(source);
    const timeline = compile(script);
    const { meta } = script;
    const players = playerRefs(script);
    const runtime = Math.round(timeline.showEnd);
    const diagnostics = teams ? [...script.diagnostics, ...teamDiagnostics(teams, script.teamRefs)].sort((a, b) => a.line - b.line) : script.diagnostics;
    return {
        meta, diagnostics, hasErrors: diagnostics.some(d => d.severity === 'error'), timeline,
        audioCues: compileAudioCues(timeline),
        openingPicture: frameAt(timeline, OPENING_PICTURE_MS),
        pullQuote: pullQuote(script),
        label: episodeLabel({ slug: slug ?? '', week: meta.week ?? null }),
        playerRefs: players,
        teamRefs: script.teamRefs,
        statsSeason: statsSeason(meta),
        summary: {
            title: meta.title || 'Untitled episode', season: meta.season ?? null, week: meta.week ?? null, date: meta.date ?? null,
            runtime, segment: runtime - INTRO_MS, players,
        },
    };
}

/** Script-dated episodes (the pilot, local drafts) air at noon UTC on their front-matter date. */
export const scriptAirDate = (date: string | null): string | null => date ? `${date}T12:00:00Z` : null;

/** the line of the first graphic that cites a player, where diagnostics about that player belong */
export const citationLine = (episode: Pick<Episode, 'timeline'>, ref: PlayerRef): number =>
    episode.timeline.monitor.find(({ value }) => graphicPlayers(value).some(cited => refKey(cited) === refKey(ref)))?.line ?? 1;
