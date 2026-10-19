import {
    CAST, CHARACTERS, SHOTS, SOUNDS, SPEEDS, resolveDelivery, resolveGesture,
    type CharacterId, type Delivery, type Shot, type Sound,
} from './cast';

// Parser for Coach's Corner screenplays. The format is documented in docs/coachs-corner.md; in short:
//
//   ---                                  front matter: title, week, season, date, segment, pace
//   DON (point): Yeah. !!THE DRAFT.!!    a line: speaker, optional (gesture, delivery, speed, then X)
//     [beat] {sneak: muttered aside}     indented lines continue it; [cues] and {styles} work inline
//   [don: stare, 1.9s] Don stares.       a stage line: cues and a hold; trailing text is a note
//   >> matchup HH 41.5 NPD 38            the desk monitor cuts to a graphic
//   # a comment

export interface Meta {
    title: string;
    week?: number;
    season?: number;
    date?: string;
    /** planned segment length in ms; the on-air clock runs into overtime past it */
    segment?: number;
    /** words per minute at normal delivery */
    pace: number;
    /** the schedule slot the public page names ("Pilot"); set by the page, not the front matter */
    label?: string;
}

export type Graphic =
    | { type: 'off' } | { type: 'bars' } | { type: 'static' } | { type: 'logo' }
    | { type: 'title'; title: string; sub?: string }
    | { type: 'team'; team: string; caption?: string }
    | { type: 'matchup'; home: string; away: string; homeScore?: string; awayScore?: string; caption?: string }
    | { type: 'pick'; pick: string; team?: string; player: string; detail?: string }
    | { type: 'stat'; value: string; label?: string; detail?: string; team?: string }
    | { type: 'list'; title: string; rows: { team?: string; label?: string; value: string }[] }
    | { type: 'compare'; home: string; away: string; homeScore?: string; awayScore?: string; rows: { label: string; home: string; away: string; highlight?: boolean }[] }
    | { type: 'numbers'; team?: string; items: { value: string; label: string }[] }
    | { type: 'player'; name: string; team?: string; caption?: string; mood?: 'hearts' }
    | { type: 'gap'; base: string; others: string[] };

export type Cue =
    | { type: 'pause'; ms: number }
    | { type: 'pose'; who: CharacterId; gesture: string }
    | { type: 'cam'; shot: Shot }
    | { type: 'sfx'; sound: Sound }
    | { type: 'monitor'; graphic: Graphic }
    | { type: 'clear' };

export interface Span {
    delivery?: Delivery;
    speed?: number;
    /** absolute words per minute, overriding pace and delivery */
    wpm?: number;
    gesture?: string;
}

export type Part = { kind: 'text'; text: string; style: Span } | { kind: 'cue'; cue: Cue };

export type ScriptEvent =
    | { kind: 'line'; line: number; speaker: CharacterId; style: Span; after?: string; parts: Part[] }
    | { kind: 'stage'; line: number; cues: Cue[]; note?: string };

export interface Diagnostic {
    line: number;
    severity: 'error' | 'warning';
    message: string;
}

export interface Script {
    meta: Meta;
    events: ScriptEvent[];
    diagnostics: Diagnostic[];
}

export interface ParseOptions {
    /** returns false for team references the league doesn't know, which become warnings */
    knownTeam?: (ref: string) => boolean;
}

export const DEFAULT_PACE = 198;
const NAMED_PAUSES: Record<string, number> = { beat: 450, pause: 1000, 'long pause': 2400 };

const parseDuration = (raw: string): number | null => {
    const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|sec|secs|seconds?)?$/i);
    if (!m) return null;
    const n = Number(m[1]);
    return /^ms$/i.test(m[2] ?? '') ? n : n * 1000;
};

// "3:30" or "210s" or "3.5m"
const parseClock = (raw: string): number | null => {
    const mmss = raw.trim().match(/^(\d+):(\d{1,2})$/);
    if (mmss) return (Number(mmss[1]) * 60 + Number(mmss[2])) * 1000;
    const mins = raw.trim().match(/^(\d+(?:\.\d+)?)\s*m(in)?$/i);
    if (mins) return Number(mins[1]) * 60000;
    return parseDuration(raw);
};

// ---------- typography ----------

/** straight quotes, double hyphens and triple dots to their typographic forms */
export const smarten = (text: string) =>
    text
        .replace(/\.\.\./g, '…')
        .replace(/-{2,3}/g, '—')
        .replace(/(^|[\s([{—])"/g, '$1“')
        .replace(/"/g, '”')
        .replace(/(^|[\s([{—])'(?=\w)/g, '$1‘')
        .replace(/'/g, '’');

// ---------- tokenising helpers ----------

/** splits on whitespace, keeping "quoted strings" (straight or curly) together; quoted tokens are marked */
const tokenize = (raw: string) => {
    const tokens: { value: string; quoted: boolean }[] = [];
    const re = /"([^"]*)"|“([^”]*)”|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) {
        if (m[3] !== undefined) tokens.push({ value: m[3], quoted: false });
        else tokens.push({ value: m[1] ?? m[2], quoted: true });
    }
    return tokens;
};

const isNumberish = (s: string) => /^[+-]?\d+(\.\d+)?$/.test(s);

const GRAPHIC_TYPES = ['off', 'bars', 'static', 'logo', 'title', 'team', 'matchup', 'compare', 'numbers', 'pick', 'stat', 'player', 'gap', 'list'] as const;

export const parseGraphic = (raw: string): { graphic?: Graphic; error?: string; teams: string[] } => {
    const trimmed = raw.trim();
    const space = trimmed.search(/\s/);
    const type = (space < 0 ? trimmed : trimmed.slice(0, space)).toLowerCase();
    const rest = space < 0 ? '' : trimmed.slice(space + 1).trim();
    const tokens = tokenize(rest);
    const quoted = tokens.filter(t => t.quoted).map(t => smarten(t.value));
    const bare = tokens.filter(t => !t.quoted).map(t => t.value);
    const teams: string[] = [];
    const team = (ref: string) => { teams.push(ref); return ref; };

    switch (type) {
        case 'off': case 'bars': case 'static': case 'logo':
            return { graphic: { type }, teams };
        case 'title': {
            const title = quoted[0] ?? smarten(rest);
            if (!title) return { error: 'A title graphic needs some text, like >> title "Opening week".', teams };
            return { graphic: { type, title, sub: quoted[1] }, teams };
        }
        case 'team': {
            if (!bare[0]) return { error: 'Name the team, like >> team HH "Leading the league".', teams };
            return { graphic: { type, team: team(bare[0]), caption: quoted[0] }, teams };
        }
        case 'matchup': {
            const names = bare.filter(t => !isNumberish(t) && !/^(vs\.?|v)$/i.test(t));
            if (names.length !== 2) return { error: 'A matchup needs two teams, like >> matchup HH 41.5 NPD 38.', teams };
            const scoreAfter = (name: string) => {
                const i = bare.indexOf(name);
                return isNumberish(bare[i + 1] ?? '') ? bare[i + 1] : undefined;
            };
            return {
                graphic: { type, home: team(names[0]), away: team(names[1]), homeScore: scoreAfter(names[0]), awayScore: scoreAfter(names[1]), caption: quoted[0] },
                teams,
            };
        }
        case 'pick': {
            const pick = bare.find(t => /^#?\d+$/.test(t));
            const who = bare.find(t => t !== pick);
            if (!pick || !quoted[0]) return { error: 'A pick needs a number and a player, like >> pick 3 HH "Ivar Stenberg" (the team is optional).', teams };
            return { graphic: { type, pick: pick.replace('#', ''), team: who ? team(who) : undefined, player: quoted[0], detail: quoted[1] }, teams };
        }
        case 'stat': {
            const [first, ...others] = tokens;
            if (!first) return { error: 'A stat needs a value, like >> stat "76th" "Tom Wilson" "overall pick".', teams };
            const labels = others.filter(t => t.quoted).map(t => smarten(t.value));
            const ref = others.find(t => !t.quoted)?.value;
            return { graphic: { type, value: smarten(first.value), label: labels[0], detail: labels[1], team: ref ? team(ref) : undefined }, teams };
        }
        case 'compare': {
            // first segment names the teams (and scores), each later one is "label home away"
            const [head, ...segments] = rest.split(/[,|]/).map(r => r.trim()).filter(Boolean);
            const headTokens = (head ?? '').split(/\s+/);
            const names = headTokens.filter(t => !isNumberish(t) && !/^(vs\.?|v)$/i.test(t));
            if (names.length !== 2) return { error: 'A compare starts with two teams, like >> compare Reapers 158 TEEHAW 114.1, G 12 8, Hit 29 17.', teams };
            const scoreAfter = (name: string) => {
                const i = headTokens.indexOf(name);
                return isNumberish(headTokens[i + 1] ?? '') ? headTokens[i + 1] : undefined;
            };
            const rows = [];
            for (const seg of segments) {
                const m = seg.match(/^(\*)?(.+?)\s+(\S+)\s+(\S+)$/);
                if (!m) return { error: `“${seg}” should be a label and two values, like Hit 29 17.`, teams };
                rows.push({ label: smarten(m[2]), home: m[3], away: m[4], highlight: m[1] ? true : undefined });
            }
            if (!rows.length) return { error: 'A compare needs at least one stat row, like G 12 8.', teams };
            return { graphic: { type, home: team(names[0]), away: team(names[1]), homeScore: scoreAfter(names[0]), awayScore: scoreAfter(names[1]), rows }, teams };
        }
        case 'numbers': {
            const segments = rest.split(/[,|]/).map(r => r.trim()).filter(Boolean);
            let ref: string | undefined;
            const first = segments[0]?.match(/^([^\s\d"“][^\s]*)\s+(.*)$/);
            if (first && !isNumberish(first[1])) { ref = first[1]; segments[0] = first[2]; }
            const items = segments.map(seg => {
                const m = seg.match(/^(\S+)\s*(.*)$/);
                return { value: m?.[1] ?? seg, label: smarten(m?.[2] ?? '') };
            });
            if (!items.length) return { error: 'Numbers need at least one value, like >> numbers HH 1 goal, 18 assists.', teams };
            return { graphic: { type, team: ref ? team(ref) : undefined, items }, teams };
        }
        case 'player': {
            if (!quoted[0]) return { error: 'Name the player in quotes, like >> player "Tom Wilson" Lali hearts "76th overall".', teams };
            const mood = bare.some(t => t.toLowerCase() === 'hearts') ? 'hearts' as const : undefined;
            const ref = bare.find(t => t.toLowerCase() !== 'hearts');
            return { graphic: { type, name: quoted[0], team: ref ? team(ref) : undefined, caption: quoted[1], mood }, teams };
        }
        case 'gap': {
            if (quoted.length < 2) return { error: 'A gap compares players by last season’s FPts, like >> gap "Tom Wilson" "William Nylander".', teams };
            return { graphic: { type, base: quoted[0], others: quoted.slice(1, 4) }, teams };
        }
        case 'list': {
            const titleMatch = rest.match(/^(?:"([^"]*)"|“([^”]*)”)\s*/);
            const title = titleMatch ? smarten(titleMatch[1] ?? titleMatch[2]) : '';
            const body = titleMatch ? rest.slice(titleMatch[0].length) : rest;
            const rows = body.split(/[,|]/).map(r => r.trim()).filter(Boolean).map(row => {
                const [head, ...tail] = tokenize(row);
                const value = tail.map(t => t.value).join(' ');
                return head.quoted ? { label: smarten(head.value), value } : { team: team(head.value), value };
            });
            if (!rows.length) return { error: 'A list needs rows, like >> list "Standings" HUNG 3-0, JAGR 2-1.', teams };
            return { graphic: { type, title, rows }, teams };
        }
        default:
            return { error: `“${type}” isn’t a monitor graphic. Use one of: ${GRAPHIC_TYPES.join(', ')}.`, teams };
    }
};

// ---------- cues ----------

interface CueContext {
    speaker?: CharacterId;
    line: number;
    report: (severity: Diagnostic['severity'], message: string) => void;
    teamRefs: (refs: string[]) => void;
}

/** the contents of one [bracket]; returns its cues */
const parseCues = (raw: string, ctx: CueContext): Cue[] => {
    const body = raw.trim();
    const monitor = body.match(/^(?:>>|monitor\s*:)\s*(.*)$/i);
    if (monitor) {
        const { graphic, error, teams } = parseGraphic(monitor[1]);
        if (error) ctx.report('error', error);
        ctx.teamRefs(teams);
        return graphic ? [{ type: 'monitor', graphic }] : [];
    }
    const cues: Cue[] = [];
    for (const itemRaw of body.split(',')) {
        const item = itemRaw.trim();
        if (!item) continue;
        const lower = item.toLowerCase();
        const ms = parseDuration(item);
        if (ms !== null) { cues.push({ type: 'pause', ms }); continue; }
        if (lower in NAMED_PAUSES) { cues.push({ type: 'pause', ms: NAMED_PAUSES[lower] }); continue; }
        if (lower === 'clear') { cues.push({ type: 'clear' }); continue; }

        const kv = item.match(/^([a-z]+)\s*:\s*(.+)$/i);
        if (kv) {
            const key = kv[1].toLowerCase();
            const value = kv[2].trim();
            if (key === 'cam' || key === 'camera') {
                const shot = value.toLowerCase().replace(/\s+/g, ' ').replace(/^close-?up /, 'close ') as Shot;
                if ((SHOTS as readonly string[]).includes(shot)) cues.push({ type: 'cam', shot });
                else ctx.report('error', `“${value}” isn’t a camera shot. Use one of: ${SHOTS.join(', ')}.`);
                continue;
            }
            if (key === 'sfx' || key === 'sound') {
                const sound = value.toLowerCase() as Sound;
                if ((SOUNDS as readonly string[]).includes(sound)) cues.push({ type: 'sfx', sound });
                else ctx.report('error', `“${value}” isn’t a sound. Use one of: ${SOUNDS.join(', ')}.`);
                continue;
            }
            const who = CHARACTERS.find(c => c === key || CAST[c].name.toLowerCase() === key);
            if (who) {
                const gesture = resolveGesture(who, value);
                if (gesture) cues.push({ type: 'pose', who, gesture });
                else ctx.report('error', `${CAST[who].name} has no “${value}” gesture. Try: ${Object.keys(CAST[who].gestures).join(', ')}.`);
                continue;
            }
            ctx.report('error', `“${kv[1]}:” isn’t a cue. Use cam:, sfx:, don:, ron: or >> for the monitor.`);
            continue;
        }

        if (ctx.speaker) {
            const gesture = resolveGesture(ctx.speaker, item);
            if (gesture) { cues.push({ type: 'pose', who: ctx.speaker, gesture }); continue; }
        }
        const owners = CHARACTERS.filter(c => resolveGesture(c, item));
        if (!ctx.speaker && owners.length) {
            ctx.report('error', `Say whose gesture “${item}” is, like [${owners[0]}: ${item}].`);
        } else {
            ctx.report('error', `“${item}” isn’t a cue. Use a gesture, a pause like 1.5s or beat, clear, cam:, sfx: or >>.`);
        }
    }
    return cues;
};

/** a run of (modifier, modifier) words used by line headers and {style: …} spans */
const parseStyleWords = (raw: string, who: CharacterId, report: CueContext['report']) => {
    const style: Span = {};
    let after: string | undefined;
    const words = raw.split(/[\s,]+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
        const w = words[i].toLowerCase();
        if (w === 'then' || w === 'to') {
            const next = words[++i];
            const gesture = next ? resolveGesture(who, next) : null;
            if (gesture) after = gesture;
            else report('error', `“${w}” needs a gesture after it, like (then stare).`);
            continue;
        }
        const delivery = resolveDelivery(w);
        if (delivery) { style.delivery = delivery; continue; }
        if (w in SPEEDS) { style.speed = SPEEDS[w]; continue; }
        const wpm = w.match(/^(\d{2,3})(wpm)?$/);
        if (wpm) { style.wpm = Number(wpm[1]); continue; }
        const gesture = resolveGesture(who, w);
        if (gesture) { style.gesture = gesture; continue; }
        report('error', `“${words[i]}” isn’t a gesture, delivery or speed for ${CAST[who].name}.`);
    }
    return { style, after };
};

// ---------- dialogue text ----------

interface Frame { style: Span; close: '!!' | '**' | '}' }

/** inline markup to parts: !!yell!!, **firm**, {sneak fast: text}, [cues] */
const parseDialogue = (text: string, who: CharacterId, ctx: CueContext): Part[] => {
    const parts: Part[] = [];
    const stack: Frame[] = [];
    let buf = '';
    const current = (): Span => Object.assign({}, ...stack.map(f => f.style));
    const flush = () => {
        if (buf) parts.push({ kind: 'text', text: buf, style: current() });
        buf = '';
    };
    const toggle = (marker: '!!' | '**', style: Span) => {
        flush();
        const top = stack[stack.length - 1];
        if (top?.close === marker) stack.pop();
        else if (stack.some(f => f.close === marker)) ctx.report('error', `A ${marker} span is closed out of order.`);
        else stack.push({ style, close: marker });
    };

    for (let i = 0; i < text.length; i++) {
        const two = text.slice(i, i + 2);
        // inside a yell, "!!FIVE!!!" closes on the last two marks and keeps the first as text
        if (text.slice(i, i + 3) === '!!!' && stack[stack.length - 1]?.close === '!!') { buf += '!'; continue; }
        if (two === '!!') { toggle('!!', { delivery: 'yell' }); i++; continue; }
        if (two === '**') { toggle('**', { delivery: 'firm' }); i++; continue; }
        const ch = text[i];
        if (ch === '{') {
            const colon = text.indexOf(':', i);
            const close = text.indexOf('}', i);
            if (colon < 0 || (close >= 0 && close < colon)) {
                ctx.report('error', 'A { style span needs a colon, like {sneak: text}.');
                buf += ch;
                continue;
            }
            flush();
            const { style } = parseStyleWords(text.slice(i + 1, colon), who, ctx.report);
            stack.push({ style, close: '}' });
            i = colon;
            if (text[i + 1] === ' ') i++;
            continue;
        }
        if (ch === '}') {
            flush();
            const top = stack[stack.length - 1];
            if (top?.close === '}') stack.pop();
            else ctx.report('error', top ? `Close the ${top.close} span before the }.` : 'There’s a } without a matching {.');
            continue;
        }
        if (ch === '[') {
            const close = text.indexOf(']', i);
            if (close < 0) { ctx.report('error', 'A [ cue is never closed with ].'); buf += ch; continue; }
            flush();
            for (const cue of parseCues(text.slice(i + 1, close), ctx)) parts.push({ kind: 'cue', cue });
            i = close;
            continue;
        }
        buf += ch;
    }
    flush();
    for (const frame of stack) ctx.report('error', `A ${frame.close === '}' ? '{' : frame.close} span is never closed.`);

    // typography after markup so the markers can't be mistaken for quotes; each part sees the
    // character before it, so !!RON!!'s still gets an apostrophe
    let prev = ' ';
    for (const part of parts) {
        if (part.kind !== 'text') continue;
        part.text = smarten(prev + part.text).slice(prev.length);
        prev = part.text.slice(-1) || prev;
    }
    return parts;
};

// ---------- the document ----------

const SPEAKER_RE = /^([A-Za-z][A-Za-z .'-]{0,24}?)\s*(?:\(([^)]*)\))?\s*:\s?(.*)$/;

const speakerFor = (name: string): CharacterId | null => {
    const key = name.trim().toLowerCase();
    return CHARACTERS.find(c => c === key || CAST[c].name.toLowerCase() === key) ?? null;
};

export function parseScript(source: string, options: ParseOptions = {}): Script {
    const diagnostics: Diagnostic[] = [];
    const events: ScriptEvent[] = [];
    const meta: Meta = { title: '', pace: DEFAULT_PACE };
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    let i = 0;

    const reporter = (line: number) => (severity: Diagnostic['severity'], message: string) =>
        diagnostics.push({ line, severity, message });
    const teamRefs = (line: number) => (refs: string[]) => {
        if (!options.knownTeam) return;
        for (const ref of refs) if (!options.knownTeam(ref)) diagnostics.push({ line, severity: 'warning', message: `No team matches “${ref}”. Use an abbreviation like HH, an owner’s first name or a team name.` });
    };

    // front matter
    if (lines[0]?.trim() === '---') {
        const end = lines.findIndex((l, n) => n > 0 && l.trim() === '---');
        if (end < 0) {
            diagnostics.push({ line: 1, severity: 'error', message: 'The front matter starts with --- but never ends with another ---.' });
        } else {
            for (let n = 1; n < end; n++) {
                const raw = lines[n].replace(/\s+#.*$/, '').trim();
                if (!raw || raw.startsWith('#')) continue;
                const m = raw.match(/^([a-z]+)\s*:\s*(.*)$/i);
                const report = reporter(n + 1);
                if (!m) { report('error', 'Front matter lines look like key: value.'); continue; }
                const key = m[1].toLowerCase();
                const value = m[2].trim().replace(/^["']|["']$/g, '');
                if (key === 'title') meta.title = smarten(value);
                else if (key === 'week') { if (/^\d+$/.test(value)) meta.week = Number(value); else report('error', 'week should be a number.'); }
                else if (key === 'season') { if (/^\d{4}$/.test(value)) meta.season = Number(value); else report('error', 'season is the year the season ends in, like 2027.'); }
                else if (key === 'date') { if (/^\d{4}-\d{2}-\d{2}$/.test(value)) meta.date = value; else report('error', 'date looks like 2026-10-14.'); }
                else if (key === 'segment') { const ms = parseClock(value); if (ms) meta.segment = ms; else report('error', 'segment is a length like 3:30.'); }
                else if (key === 'pace') { if (/^\d{2,3}$/.test(value)) meta.pace = Number(value); else report('error', 'pace is words per minute, like 180.'); }
                else report('warning', `“${m[1]}” isn’t a front matter key; it’s ignored.`);
            }
            i = end + 1;
        }
    }

    let open: Extract<ScriptEvent, { kind: 'line' }> | null = null;
    let openText = '';
    let openLine = 0;
    const closeLine = () => {
        if (!open) return;
        const ctx: CueContext = { speaker: open.speaker, line: openLine, report: reporter(openLine), teamRefs: teamRefs(openLine) };
        open.parts = parseDialogue(openText.trim(), open.speaker, ctx);
        if (!open.parts.some(p => p.kind === 'text' && p.text.trim())) ctx.report('error', `${CAST[open.speaker].name}’s line has no words.`);
        events.push(open);
        open = null;
        openText = '';
    };

    for (; i < lines.length; i++) {
        const lineNo = i + 1;
        const raw = lines[i];
        const trimmed = raw.trim();
        const report = reporter(lineNo);

        if (!trimmed) { closeLine(); continue; }
        if (trimmed.startsWith('#')) continue;

        // indented lines continue the open line
        if (open && /^\s/.test(raw)) { openText += ' ' + trimmed; continue; }

        if (trimmed.startsWith('>>')) {
            closeLine();
            const { graphic, error, teams } = parseGraphic(trimmed.slice(2));
            if (error) report('error', error);
            teamRefs(lineNo)(teams);
            if (graphic) events.push({ kind: 'stage', line: lineNo, cues: [{ type: 'monitor', graphic }] });
            continue;
        }

        if (trimmed.startsWith('[')) {
            closeLine();
            const cues: Cue[] = [];
            let rest = trimmed;
            const ctx: CueContext = { line: lineNo, report, teamRefs: teamRefs(lineNo) };
            while (rest.startsWith('[')) {
                const close = rest.indexOf(']');
                if (close < 0) { report('error', 'A [ cue is never closed with ].'); rest = ''; break; }
                cues.push(...parseCues(rest.slice(1, close), ctx));
                rest = rest.slice(close + 1).trim();
            }
            events.push({ kind: 'stage', line: lineNo, cues, note: rest || undefined });
            continue;
        }

        const m = raw.match(SPEAKER_RE);
        const speaker = m ? speakerFor(m[1]) : null;
        if (m && speaker) {
            closeLine();
            const { style, after } = parseStyleWords(m[2] ?? '', speaker, report);
            open = { kind: 'line', line: lineNo, speaker, style, after, parts: [] };
            openText = m[3];
            openLine = lineNo;
            continue;
        }
        // an all-caps NAME: at the margin is a speaker, even mid-speech
        if (m && /^[A-Z]{2,}$/.test(m[1].trim())) {
            closeLine();
            report('error', `“${m[1]}” isn’t in the cast. The speakers are ${CHARACTERS.map(c => CAST[c].name.toUpperCase()).join(' and ')}.`);
            continue;
        }
        if (open) { openText += ' ' + trimmed; continue; }
        report('error', 'This line isn’t dialogue, a [cue] or a >> monitor graphic. Start dialogue with DON: or RON:, and indent lines that continue it.');
    }
    closeLine();

    if (!meta.title) diagnostics.push({ line: 1, severity: 'error', message: 'Give the episode a title in the front matter: title: Draft and opening matchups.' });
    if (!events.some(e => e.kind === 'line')) diagnostics.push({ line: 1, severity: 'error', message: 'The script has no dialogue yet.' });

    diagnostics.sort((a, b) => a.line - b.line);
    return { meta, events, diagnostics };
}

export const hasErrors = (script: Script) => script.diagnostics.some(d => d.severity === 'error');

/** players named by >> player and >> gap graphics, for looking up headshots and stats */
export const playerRefs = (script: Script) => Array.from(new Set(script.events.flatMap(e => {
    const cues = e.kind === 'stage' ? e.cues : e.parts.flatMap(p => (p.kind === 'cue' ? [p.cue] : []));
    return cues.flatMap(c => {
        if (c.type !== 'monitor') return [];
        if (c.graphic.type === 'player') return [c.graphic.name];
        if (c.graphic.type === 'gap') return [c.graphic.base, ...c.graphic.others];
        return [];
    });
})));
