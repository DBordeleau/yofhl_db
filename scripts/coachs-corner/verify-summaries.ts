import { parseArgs } from 'node:util';
import { verifyEpisodeSummaries } from '../../lib/coachs-corner/publishing';

// Recompiles every stored Coach's Corner script and lists rows whose stored title, season, week or
// runtime no longer match the episode module, as after a compiler change.
//   npm run coachs:verify-summaries            report only
//   npm run coachs:verify-summaries -- --fix   rewrite the stale rows
// Never touches the players snapshot or the first air date. Run by hand, never at request time.

async function main() {
    const { values } = parseArgs({ options: { fix: { type: 'boolean' } } });
    const fix = values.fix === true;
    const drifts = await verifyEpisodeSummaries({ fix });
    for (const drift of drifts) {
        console.log(`${drift.slug} (#${drift.id})`);
        for (const { field, stored, compiled } of drift.fields) console.log(`  ${field}: ${stored} → ${compiled}`);
    }
    if (!drifts.length) console.log('Every stored summary matches its script.');
    else if (fix) console.log(`Rewrote ${drifts.length} episode summar${drifts.length === 1 ? 'y' : 'ies'}. Publishing or unpublishing any episode clears the cached listings.`);
    else console.log(`${drifts.length} episode summar${drifts.length === 1 ? 'y has' : 'ies have'} drifted. Run again with --fix to rewrite them.`);
}

main().then(() => process.exit()).catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
