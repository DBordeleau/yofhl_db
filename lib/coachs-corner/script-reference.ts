import { CHARACTERS } from './cast';
import { EFFECTS, type Reaction } from './effects';

// The editor's Script reference, as data. Lists that have a registry (effects, monitor graphics)
// are derived from it, so a new entry shows up here with no edit to this file.

/** a show length as a script writes it: 4.5s, or 800ms under a second */
const scriptLength = (ms: number) => (ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`);

export interface FxReference {
    effect: Reaction;
    /** the default length, as a script writes it */
    length: string;
    /** a stage-line cue at the default length */
    example: string;
}

/** one entry per effect in the registry, taking turns between the hosts */
export const FX_REFERENCE: FxReference[] = (Object.keys(EFFECTS) as Reaction[]).map((effect, i) => ({
    effect,
    length: scriptLength(EFFECTS[effect].defaultMs),
    example: `fx: ${CHARACTERS[i % CHARACTERS.length]} ${effect}`,
}));

/** a flashback block with both header options; the reference test parses it in a week 6 episode */
export const FLASHBACK_EXAMPLE = `[flashback: week 4, don: remembrance-rest, lapel: poppy]
RON: Who's he going to get in a trade? Nobody wants--
DON (remembrance-point): He's sitting right there.
[end flashback]`;

/** one example per monitor graphic, written after >> (the reference test holds this to the parser's full list) */
export const GRAPHIC_REFERENCE: readonly string[] = [
    'off', 'bars', 'static', 'logo',
    'title "Big text" "small text"',
    'team HH "caption"',
    'matchup HH 41.5 NPD 38 "caption"',
    'matchup HH 141.5 NPD 138 final',
    'compare Reapers 158 TEEHAW 114.1, G 12 8, *Hit 29 17',
    'standings "Week 1 standings" HH 1 0 212.35, NPD 0 1 174.20',
    'list "Standings" HH 3-0, JAGR 2-1',
    'pick 3 HH "Player" "detail"',
    'stat "76th" "Tom Wilson" "overall pick" Lali',
    'numbers HH 1 goal, 18 assists',
    'player "Tom Wilson" Lali hearts "76th overall"',
    'gap "Tom Wilson" "William Nylander" "Nico Hischier"',
    'split "Alexis Lafreniere" "FP/G" Lali 3.00 "2020–25", JAGR 5.11 "This season"',
    'wire claim JAGR "Ryan O\'Reilly" "Mon. Nov. 9" fpts 83.75 fpg 5.58',
    'wire swap HH "Mackenzie Blackwood" "John Gibson"',
];
