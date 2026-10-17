import type { CharacterId } from './cast';
import { parseScript } from './script';

export interface PullQuote { who: CharacterId; text: string }

/** The episode's best shout for a share card: the longest all-caps yell (!!…!!) that fits a plate, then any yell, then a short first line. */
export function pullQuote(source: string): PullQuote | null {
    const lines = parseScript(source).events.flatMap(event => event.kind === 'line' ? [event] : []);
    const shouts = lines.flatMap(line => {
        const runs: string[] = [];
        let run = '';
        for (const part of line.parts) {
            if (part.kind !== 'text') continue;
            const yelled = (part.style.delivery ?? line.style.delivery) === 'yell';
            if (yelled) run += part.text; else if (run) { runs.push(run); run = ''; }
        }
        if (run) runs.push(run);
        return runs.map(text => ({ who: line.speaker, text: text.replace(/\s+/g, ' ').trim() }));
    }).filter(quote => quote.text.length >= 12 && quote.text.length <= 80);
    // Don's all-caps outbursts are the show's signature; mixed-case shouts are the fallback.
    const capitals = shouts.filter(quote => quote.text === quote.text.toUpperCase());
    const pool = capitals.length ? capitals : shouts;
    if (pool.length) return pool.reduce((best, quote) => quote.text.length > best.text.length ? quote : best);
    const first = lines.map(line => ({ who: line.speaker, text: line.parts.flatMap(part => part.kind === 'text' ? [part.text] : []).join('').replace(/\s+/g, ' ').trim() }))
        .find(quote => quote.text.length >= 12 && quote.text.length <= 110);
    return first ?? null;
}
