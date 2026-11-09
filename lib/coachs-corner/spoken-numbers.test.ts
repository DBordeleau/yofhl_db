import assert from 'node:assert/strict';
import test from 'node:test';
import { episodeFrom } from './episode';
import { frameAt, spokenWords } from './timeline';
import { spokenForm } from './spoken-numbers';

const readings = (cases: Record<string, string>) => {
    for (const [written, said] of Object.entries(cases)) assert.equal(spokenForm(written), said, written);
};

test('plain integers are said in full, with "and" after the hundreds', () => readings({
    '0': 'zero', '7': 'seven', '30': 'thirty', '46': 'forty-six', '100': 'one hundred', '101': 'one hundred and one',
    '311': 'three hundred and eleven', '10300': 'ten thousand three hundred', '1234567': 'one million two hundred and thirty-four thousand five hundred and sixty-seven',
    '007': 'oh oh seven',
}));

test('four digits without a comma read in pairs, like a year', () => readings({
    '1910': 'nineteen-ten', '1905': 'nineteen-oh-five', '1900': 'nineteen hundred', '1986.': 'nineteen-eighty-six.',
    '2026': 'twenty-twenty-six', '2010': 'twenty-ten', '2000': 'two thousand', '2009': 'two thousand and nine',
    '1500': 'fifteen hundred', '3000': 'three thousand',
}));

test('comma thousands are said in full', () => readings({
    '10,300': 'ten thousand three hundred', '1,500': 'one thousand five hundred', '1,005': 'one thousand and five',
    '2,000,000': 'two million', '10,300,': 'ten thousand three hundred,',
}));

test('decimals read the fraction digit by digit', () => readings({
    '311.15': 'three hundred and eleven point one five', '2.5': 'two point five', '230.80': 'two hundred and thirty point eight oh',
    '.500': 'point five oh oh', '30%': 'thirty percent', '2.5%': 'two point five percent',
}));

test('records and scores, with a hyphen or an en dash, are "and" with zero as "oh"', () => readings({
    '2-0': 'two and oh', '2–0': 'two and oh', '3-0.': 'three and oh.', '0-4': 'oh and four', '4–0,': 'four and oh,',
    '2-1': 'two and one', '10-3': 'ten and three', '3-2-1': 'three, two and one', '(2-0)': '(two and oh)',
}));

test('year ranges and seasons are two years with a comma pause', () => readings({
    '1910-1911': 'nineteen-ten, nineteen-eleven', '1910–11': 'nineteen-ten, eleven', '2025-26': 'twenty-twenty-five, twenty-six',
    '1999–00': 'nineteen-ninety-nine, oh-oh',
}));

test('times read like a broadcaster says a clock', () => readings({
    '2:39': 'two thirty-nine', '2:05': 'two oh-five', '7:00': 'seven o’clock', '0:45': 'forty-five', '12:30': 'twelve thirty',
}));

test('ordinals, decades, short years, signs and numbers glued to letters', () => readings({
    '76th': 'seventy-sixth', '1st': 'first', '2nd': 'second', '3rd': 'third', '11th': 'eleventh', '12th': 'twelfth',
    '21st': 'twenty-first', '40th': 'fortieth', '100th': 'one hundredth', '1000th': 'one thousandth', '1,000th': 'one thousandth', '5th-line': 'fifth-line',
    '80s': 'eighties', '1980s': 'nineteen-eighties', '’80s': 'eighties', '‘72.': 'seventy-two.', '’05': 'oh-five',
    '+5': 'plus five', '−3': 'minus three', '-3': 'minus three', '#1': 'number one', 'G1': 'G one', '3GP': 'three GP', '4-for-4': 'four-for-four',
}));

test('words without digits are said as written', () => {
    for (const word of ['', 'Three', 'nineteen-ten,', 'oh.', '!!TWO-THIRTY', '“Hello,”', 'Nov.', '—']) assert.equal(spokenForm(word), word);
    // a reading the rules don't cover still gets a word per digit group
    assert.equal(spokenForm('1,2,3'), 'one, two, three');
    assert.equal(spokenForm('3:1'), 'three one');
});

/** a line's timing and voice, which must not depend on whether a number is written in digits */
const performance = (dialogue: string) => {
    const { timeline: tl, audioCues } = episodeFrom(`---\ntitle: Numbers\n---\n${dialogue}\nRON: Okay.`);
    return {
        lines: tl.lines.map(({ t0, t1, end, cutoff }) => ({ t0, t1, end, cutoff })),
        said: tl.lines.map(line => spokenWords(line).map(beat => ({ ...beat, text: beat.text.toLowerCase() }))),
        flaps: tl.flaps, voice: tl.voice, punches: tl.punches, duration: tl.duration, audioCues,
    };
};

test('a number in digits shows as written but times, flaps and sounds exactly like it spelled out', () => {
    const pairs: [string, string][] = [
        ['RON: Won Ontario, 1910-1911.', 'RON: Won Ontario, nineteen-ten, nineteen-eleven.'],
        ['DON: 30 goals! In 8 days!', 'DON: thirty goals! In eight days!'],
        ['DON (firm): No. [beat] That one’s mine. There. 3-0.', 'DON (firm): No. [beat] That one’s mine. There. Three and oh.'],
        ['RON: 2–0? Really?', 'RON: Two and oh? Really?'],
        ['DON (slow): 311.', 'DON (slow): Three hundred and eleven.'],
        ['RON: [>> stat "311.15"] 311.15, 10,300 and 2:39 left.', 'RON: [>> stat "311.15"] three hundred and eleven point one five, ten thousand three hundred and two thirty-nine left.'],
        ['DON: !!311!!', 'DON: !!THREE HUNDRED AND ELEVEN!!'],
        ['DON: {firm: 2-0}?', 'DON: {firm: two and oh}?'],
        ['DON: {sneak: 76th overall}', 'DON: {sneak: seventy-sixth overall}'],
        ['DON: It was 2-0--', 'DON: It was two and oh--'],
    ];
    for (const [digits, words] of pairs) assert.deepEqual(performance(digits), performance(words), digits);
});

test('the plate keeps the digits: one written word, revealed at once', () => {
    const { timeline: tl } = episodeFrom('---\ntitle: Numbers\n---\nRON: Won Ontario, 1910-1911.');
    const [line] = tl.lines;
    assert.equal(line.text, 'Won Ontario, 1910-1911.');
    assert.deepEqual(line.words.map(word => word.pieces.map(piece => piece.text).join('')), ['Won', 'Ontario,', '1910-1911.']);
    assert.deepEqual(spokenWords(line).map(beat => beat.text), ['Won', 'Ontario,', 'nineteen-ten,', 'nineteen-eleven.']);
    const year = line.words[2];
    assert.equal(frameAt(tl, year.t - 1).captions.ron?.shown, 2);
    assert.equal(frameAt(tl, year.t).captions.ron?.shown, 3);
    assert.equal(frameAt(tl, year.t + year.dur).captions.ron?.shown, 3);
});
