import { mkdir, readFile, writeFile, copyFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadLeagueConfig } from '../db/lib/league-config';
import { captureFacts, referencePacket, parseFactPacket } from '../../lib/coachs-corner/production/facts';
import { captureArchivedStats } from '../../lib/coachs-corner/production/archived-stats';
import { checkDraft, draftDirectory, loadLocalDraft, DRAFT_ROOT } from '../../lib/coachs-corner/production/local-drafts';
import { PILOT_SCRIPT } from '../../lib/coachs-corner/pilot';
import { parseScript, playerRefs } from '../../lib/coachs-corner/script';

async function replaceFacts(dir: string, facts: ReturnType<typeof parseFactPacket>) {
    const backup = `facts-${Date.now()}.json`;
    await copyFile(path.join(dir, 'facts.json'), path.join(dir, backup));
    await writeFile(path.join(dir, 'facts.next.json'), JSON.stringify(facts, null, 2) + '\n');
    await rename(path.join(dir, 'facts.next.json'), path.join(dir, 'facts.json'));
    return backup;
}

async function main() {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
        slug: { type: 'string' }, period: { type: 'string' }, players: { type: 'string' }, season: { type: 'string' }, 'air-date': { type: 'string' },
        from: { type: 'string' }, pilot: { type: 'boolean' }, recap: { type: 'boolean' }, refresh: { type: 'boolean' }, help: { type: 'boolean' },
    } });
    const command = positionals[0];
    if (values.help || !command) {
        console.log(`Coach's Corner local production\n\nprepare --slug <slug> [--recap [--air-date YYYY-MM-DD] | --period <scoring-period>] [--players "Name,Name"]\nprepare --slug <slug> --pilot                 Offline pilot reference\nprepare --slug <slug> --from <facts.json>      Reuse an existing snapshot\nfacts --slug <slug> [--recap | --period <n>] --refresh  Back up and replace facts only\nstats --slug <slug> [--season <ending-year>]  Freeze archive stats for script graphics\ncheck --slug <slug>                          Validate script, assets and names\n\nFiles: ${DRAFT_ROOT}/<slug>/\nPreview: http://localhost:3000/coachs-corner/local/<slug>\n--recap selects the previous Monday through Sunday in America/Toronto, including before Monday's Fantrax rollover.\n--air-date selects the recap relative to an intended broadcast date; live observation times stay unchanged.\nIt reselects the recap week on refresh; ordinary refresh keeps the snapshot's period.\nLive exports are fetched now; historical cutoffs cannot be reconstructed.\n--players also supports facts refresh and stats. Include dialogue-only players.\nLive captures include prior-season YOFHL stats for named players.\nstats defaults to episode season minus one, preserves live facts, and backs up facts.json.\nCommands never publish or write to the database.`);
        return;
    }
    if (!['prepare', 'facts', 'stats', 'check'].includes(command) || positionals.length !== 1) throw new Error('Unknown command. Use --help.');
    if (!values.slug) throw new Error('--slug is required');
    if (values.recap && (values.period !== undefined || values.pilot || values.from !== undefined)) throw new Error('--recap cannot be combined with --period, --pilot or --from.');
    if (values.recap && (command === 'stats' || command === 'check')) throw new Error('--recap applies only to live prepare or facts --refresh.');
    if (values['air-date'] !== undefined && !values.recap) throw new Error('--air-date requires --recap.');
    const dir = draftDirectory(values.slug);
    const requestedPlayers = values.players?.split(',').map(name => name.trim()).filter(Boolean);
    if (values.season && (command !== 'stats' || !/^[1-9]\d*$/.test(values.season))) throw new Error('--season is a positive ending year for the stats command only.');
    if (command === 'stats') {
        if (values.pilot || values.from || values.refresh || values.period) throw new Error('stats enriches an existing snapshot; use only --slug, --players and --season.');
        const draft = await loadLocalDraft(values.slug);
        const parsed = parseScript(draft.script);
        if (parsed.diagnostics.some(d => d.severity === 'error')) throw new Error('Fix script parsing errors before capturing graphic statistics.');
        if (parsed.meta.season !== draft.facts.season) throw new Error('Script season must match the fact packet ending year before capturing statistics.');
        const names = [...playerRefs(parsed), ...(requestedPlayers ?? [])];
        const facts = await captureArchivedStats(draft.facts, names, { season: values.season ? Number(values.season) : undefined });
        if (facts === draft.facts) { console.log('No player/gap graphics or additional --players to capture.'); return; }
        const backup = await replaceFacts(dir, facts);
        console.log(`Updated archived player statistics only; previous snapshot retained as ${backup}. Live matchup/roster data and capture times are unchanged.`);
        console.log(JSON.stringify({ players: facts.players.filter(p => names.some(name => name.toLowerCase() === p.name.toLowerCase()))
            .map(({ name, season, fpts, fpg, games, statsSource }) => ({ name, season, fpts, fpg, games, statsSource })),
            limitations: facts.limitations.filter(note => note.startsWith('Archived YOFHL stats for ')) }, null, 2));
        return;
    }
    if (command === 'check') {
        const draft = await loadLocalDraft(values.slug);
        const result = await checkDraft(draft);
        console.log(JSON.stringify({ slug: values.slug, ...result }, null, 2));
        if (result.diagnostics.some(d => d.severity === 'error')) process.exitCode = 1;
        return;
    }
    if (values.pilot && values.from) throw new Error('Choose --pilot or --from, not both.');
    if ((values.pilot || values.from) && (values.players || values.period)) throw new Error('--period and --players apply only to live captures.');
    if (values.period && !/^[1-9]\d*$/.test(values.period)) throw new Error('--period must be a positive scoring period number');
    if (command === 'facts' && (!values.refresh || values.pilot || values.from)) throw new Error('Use facts --refresh for an explicit live snapshot replacement.');
    if (command === 'prepare' && values.refresh) throw new Error('prepare always creates a new draft. Use facts --refresh to update an existing snapshot.');
    // Check existence before network requests. Existing scripts are never replaced by prepare or facts.
    let previous: Awaited<ReturnType<typeof loadLocalDraft>> | undefined;
    if (command === 'facts') previous = await loadLocalDraft(values.slug);
    else {
        try { await readFile(path.join(dir, 'script.txt')); throw new Error(`Draft ${values.slug} already exists. Choose a new slug or edit its files.`); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    const config = loadLeagueConfig();
    let facts = values.from ? parseFactPacket(JSON.parse(await readFile(values.from, 'utf8')))
        : values.pilot ? referencePacket(config, 2027)
            : await captureFacts(config, { recap: values.recap, airDate: values['air-date'],
                period: values.recap ? undefined : values.period ? Number(values.period) : previous?.facts.period?.number,
                players: [...(requestedPlayers ?? previous?.facts.players.map(p => p.name) ?? []),
                    ...(previous ? playerRefs(parseScript(previous.script)) : [])] });
    if (!values.pilot && !values.from) facts = await captureArchivedStats(facts, facts.players.map(p => p.name));
    const factsText = JSON.stringify(facts, null, 2) + '\n';
    if (command === 'facts') {
        const backup = await replaceFacts(dir, facts);
        console.log(`Updated facts only; previous snapshot retained as ${backup}. Reconcile script numbers and pronunciation entries against the new snapshot.`);
    } else {
        await mkdir(path.dirname(dir), { recursive: true });
        await mkdir(dir);
        const date = values['air-date'] ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const script = values.pilot ? PILOT_SCRIPT : `---\ntitle: Coach's Corner draft\nseason: ${facts.season}\nweek: ${facts.period?.number ?? ''}\ndate: ${date}\nsegment: 4:00\n---\n\n# Replace this opening after choosing the week's grievance.\n[don: rest, ron: rest]\n>> logo\n\nRON: We're back.\n\nDON: Put the thing up.\n`;
        const ledger = JSON.parse(await readFile('assets/coachs-corner/editorial/continuity.json', 'utf8')) as { pronunciations: { name: string; donName: string }[] };
        const pronunciations = facts.players.map(p => ({ name: p.name, donName: ledger.pronunciations.find(n => n.name === p.name)?.donName ?? '' }));
        const files: Record<string, string> = {
            'facts.json': factsText, 'script.txt': script, 'pronunciations.json': JSON.stringify(pronunciations, null, 2) + '\n',
            'brief.md': `# ${values.slug}\n\nStatus: outline needed.\n\nFacts captured ${facts.capturedAt}. Read facts.json limitations before writing.\n\n## Episode intent\n\nChoose the main grievance, supporting stories, ending callback and useful silence.\n\n## Additional evidence\n\nRecord sources and observation times for transactions, news, injuries, birthplace corrections and league-chat material.\n\n## Asset requests\n\nGive each beat an ID. Record action, existing alternative, required pose/mouth pair, sound onset and fallback.\n`,
            'review.md': '# Editorial review\n\nStatus: not reviewed.\n\nRecord line-specific character, factual and playback findings. Identify revisions and unresolved issues. Automated checks do not establish editorial quality.\n',
            'continuity-proposals.md': '# Proposed continuity\n\nStatus: unapproved.\n\nAfter user review, record accepted callbacks, names, predictions and writing preferences with episode/line evidence. Draft inventions do not enter the approved ledger automatically.\n',
        };
        for (const [filename, contents] of Object.entries(files)) await writeFile(path.join(dir, filename), contents, { flag: 'wx' });
    }
    console.log(`Facts: ${facts.kind}, season ${facts.season}, period ${facts.period?.number ?? 'reference'}, captured ${facts.capturedAt}`);
    if (values.recap) console.log(facts.limitations.find(note => note.startsWith('Recap covers ')));
    console.log(`Preview: http://localhost:3000/coachs-corner/local/${values.slug}`);
    console.log(`Edit: ${path.join(dir, 'script.txt')}`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
