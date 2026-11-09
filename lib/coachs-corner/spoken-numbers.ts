// A word's spoken form: how the voice and line timing read it. Dialogue may show numbers as digits
// ("1910-1911", "30 goals", "2-0"); the speech plate keeps them exactly as written, while the timeline
// counts the syllables of the number as a broadcaster would say it. The reading rules are in
// docs/coachs-corner.md ("Numbers"). A word without a digit comes back unchanged, so spelled-out
// scripts time exactly as before.

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', ' thousand', ' million', ' billion', ' trillion'];
const ORDINALS: Record<string, string> = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };

const belowHundred = (n: number) => n < 20 ? SMALL[n] : TENS[Math.floor(n / 10)] + (n % 10 ? `-${SMALL[n % 10]}` : '');

const belowThousand = (n: number) => {
    const hundreds = Math.floor(n / 100), rest = n % 100;
    if (!hundreds) return belowHundred(rest);
    return `${SMALL[hundreds]} hundred${rest ? ` and ${belowHundred(rest)}` : ''}`;
};

/** each digit on its own, zero as "oh": decimals, leading zeros, numbers too long to name */
const digitByDigit = (digits: string) => Array.from(digits, d => d === '0' ? 'oh' : SMALL[Number(d)]).join(' ');

/** the full quantity: 311 "three hundred and eleven", 10300 "ten thousand three hundred", 1005 "one thousand and five" */
function cardinal(digits: string): string {
    if (/^0\d/.test(digits)) return digitByDigit(digits);
    const groups: number[] = [];
    for (let end = digits.length; end > 0; end -= 3) groups.unshift(Number(digits.slice(Math.max(0, end - 3), end)));
    if (groups.length > SCALES.length) return digitByDigit(digits);
    if (groups.every(g => g === 0)) return 'zero';
    return groups.flatMap((g, i) => {
        if (!g) return [];
        const last = i === groups.length - 1;
        return [`${last && groups.length > 1 && g < 100 ? 'and ' : ''}${belowThousand(g)}${SCALES[groups.length - 1 - i]}`];
    }).join(' ');
}

/** two digits after a year or an apostrophe: 11 "eleven", 05 "oh-five" */
const twoDigits = (digits: string) => digits[0] === '0' ? `oh-${digitByDigit(digits[1])}` : belowHundred(Number(digits));

/** four digits read in pairs, like a year: 1910 "nineteen-ten", 1905 "nineteen-oh-five", 1900 "nineteen hundred", 2026 "twenty-twenty-six"; 2000 and 2009 in full */
function pairs(digits: string): string {
    const high = Number(digits.slice(0, 2)), low = Number(digits.slice(2));
    if (high % 10 === 0 && low < 10) return cardinal(digits);
    if (!low) return `${belowHundred(high)} hundred`;
    return `${belowHundred(high)}-${twoDigits(digits.slice(2))}`;
}

/** a whole number written without commas: four digits read like a year, anything else in full */
const integer = (digits: string) => /^[1-9]\d{3}$/.test(digits) ? pairs(digits) : cardinal(digits);

/** one quantity: 30, 311, 1910, 10,300, 311.15, .500 */
function amount(text: string): string | null {
    const m = text.match(/^(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d+))?$/);
    if (!m || (m[1] === undefined && m[2] === undefined)) return null;
    const [, whole, fraction] = m;
    const words: string[] = [];
    if (whole !== undefined) words.push(whole.includes(',') ? cardinal(whole.replace(/,/g, '')) : integer(whole));
    if (fraction !== undefined) words.push('point', digitByDigit(fraction));
    return words.join(' ');
}

/** a game clock or time of day: 2:39 "two thirty-nine", 2:05 "two oh-five", 7:00 "seven o'clock", 0:45 "forty-five" */
function clock(minutes: string, seconds: string): string {
    const m = Number(minutes), s = Number(seconds);
    if (!m) return cardinal(String(s));
    return `${cardinal(String(m))} ${s ? twoDigits(seconds) : 'o’clock'}`;
}

/** 2-0 "two and oh", 3-2-1 "three, two and one", 1910-1911 "nineteen-ten, nineteen-eleven", 2025–26 "twenty-twenty-five, twenty-six" */
function range(sides: string[]): string | null {
    const [first, second] = sides;
    if (sides.length === 2 && /^[1-9]\d{3}$/.test(first) && /^\d{2}(?:\d{2})?$/.test(second)) {
        return `${pairs(first)}, ${second.length === 2 ? twoDigits(second) : integer(second)}`;
    }
    const read = sides.map(side => side === '0' ? 'oh' : amount(side));
    if (read.some(side => side === null)) return null;
    return `${read.slice(0, -1).join(', ')} and ${read.at(-1)}`;
}

function read(core: string): string | null {
    const time = core.match(/^(\d{1,2}):(\d{2})$/);
    if (time) return clock(time[1], time[2]);
    const sides = core.split(/[-–]/);
    return sides.length > 1 ? range(sides) : amount(core);
}

/** anything the rules above don't cover still gets a word per digit group, so it can't time as nothing */
const fallback = (core: string) => core.replace(/\d+/g, digits => ` ${integer(digits)} `)
    .replace(/\s*([,:.\-–])\s*/g, (_, mark: string) => mark === ',' ? ', ' : ' ').replace(/\s+/g, ' ').trim();

const lastWord = (words: string, change: (word: string) => string) =>
    words.replace(/[a-z’]+$/, change);

const ordinal = (words: string) => lastWord(words, w => ORDINALS[w] ?? (w.endsWith('y') ? `${w.slice(0, -1)}ieth` : `${w}th`));
const plural = (words: string) => lastWord(words, w => w.endsWith('y') ? `${w.slice(0, -1)}ies` : /(?:x|s)$/.test(w) ? `${w}es` : `${w}s`);

// prefix (sign, #, apostrophe) · the number itself, ending on a digit · suffix (ordinal, plural, percent)
const NUMBER = /(#|[+−]|(?<![\p{L}\p{N}])-(?=\.?\d))?(['‘’](?=\d{2}(?!\d)))?(\.?\d(?:[\d,.:–-]*\d)?)((?:st|nd|rd|th)(?!\p{L})|['’]?s(?!\p{L})|%)?/giu;
const PREFIX: Record<string, string> = { '#': 'number ', '+': 'plus ', '-': 'minus ', '−': 'minus ' };

/** How the voice and line timing read a word. Unchanged unless it contains a digit. */
export function spokenForm(word: string): string {
    if (!/\d/.test(word)) return word;
    return word.replace(NUMBER, (match, prefix: string | undefined, apostrophe: string | undefined, core: string, suffix: string | undefined, offset: number) => {
        const kind = suffix?.toLowerCase();
        const isOrdinal = !!kind && /^(?:st|nd|rd|th)$/.test(kind);
        // ordinals are said in full: 1000th is "one thousandth", never "ten hundredth"
        let words = apostrophe && core.length === 2 ? twoDigits(core)
            : `${apostrophe ?? ''}${isOrdinal && /^\d+$/.test(core) ? cardinal(core) : read(core) ?? fallback(core)}`;
        if (isOrdinal) words = ordinal(words);
        else if (kind === '%') words += ' percent';
        else if (kind) words = plural(words);
        words = (prefix ? PREFIX[prefix] : '') + words;
        // keep letters glued to a number as their own word: G1 "G one", 3GP "three GP", 3+2 "three plus two"
        const before = /[\p{L}\p{N}]/u.test(word[offset - 1] ?? '') ? ' ' : '';
        const after = /\p{L}/u.test(word[offset + match.length] ?? '') ? ' ' : '';
        return before + words + after;
    });
}
