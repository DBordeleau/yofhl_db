import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@/db/schema';
import type { Db } from './connect';
import { eraFor, findByName, normalizeName, type LeagueConfig } from './league-config';

const key = (parts: unknown[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const csv = (file: string): string[][] => parse(readFileSync(file, 'utf8'), { bom: true, skip_empty_lines: true });
const fileYear = (file: string) => {
    const match = path.basename(file).match(/^\d{4}-(\d{4}) /);
    if (!match) throw new Error(`Unrecognized history filename: ${file}`);
    return Number(match[1]);
};
const filesIn = (folder: string, pattern: RegExp) => existsSync(folder)
    ? readdirSync(folder).filter((file) => pattern.test(file)).sort().map((file) => path.join(folder, file)) : [];
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Fantrax labels these exports EDT/EST explicitly. Honor that offset, not the machine timezone.
export function exportDate(source: string, zone?: string) {
    const match = source.match(/([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/);
    if (!match || !months.includes(match[1])) throw new Error(`Invalid export date: ${source}`);
    const month = months.indexOf(match[1]) + 1;
    const day = Number(match[2]);
    const year = Number(match[3]);
    const occurredOn = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (new Date(`${occurredOn}T00:00:00Z`).toISOString().slice(0, 10) !== occurredOn) throw new Error(`Invalid date: ${source}`);
    if (!zone) return { occurredOn, occurredAt: null };
    const time = source.match(/, (\d{1,2}):(\d{2})(AM|PM)$/);
    if (!time || !['EDT', 'EST'].includes(zone) || Number(time[1]) < 1 || Number(time[1]) > 12 || Number(time[2]) > 59) throw new Error(`Invalid timestamp: ${source} (${zone})`);
    const hour = Number(time[1]) % 12 + (time[3] === 'PM' ? 12 : 0);
    const occurredAt = new Date(`${occurredOn}T${String(hour).padStart(2, '0')}:${time[2]}:00${zone === 'EDT' ? '-04:00' : '-05:00'}`).toISOString();
    return { occurredOn, occurredAt };
}

interface Identity { id: string; name: string; season: number; teams: string[]; positions: string[] }
export function resolvePlayer(catalog: Identity[], name: string, nhl: string, positions: string, year: number) {
    let candidates = catalog.filter((p) => normalizeName(p.name) === normalizeName(name));
    const inSeason = candidates.filter((p) => p.season === year);
    if (inSeason.length) candidates = inSeason;
    const teams = nhl.split('/').filter((t) => t !== '(N/A)' && t);
    const byTeam = candidates.filter((p) => p.teams.some((t) => teams.includes(t)));
    if (byTeam.length) candidates = byTeam;
    const pos = positions.split(',');
    const byPosition = candidates.filter((p) => p.positions.some((p) => pos.includes(p)));
    if (byPosition.length) candidates = byPosition;
    const ids = [...new Set(candidates.map((p) => p.id))];
    if (ids.length !== 1) throw new Error(`Cannot uniquely identify ${name} (${nhl}, ${positions}, ${year}): ${ids.join(', ') || 'no match'}`);
    return ids[0];
}

const franchiseFor = (config: LeagueConfig, name: string, year: number) => {
    if (name === '(Drop)') return null;
    const exact = findByName(config, year, name);
    if (exact) return exact.franchise.id;
    // Transactions near a rebrand can retain another name of the same active franchise.
    const matches = config.franchises.filter((f) => eraFor(f, year) && f.eras.some((e) => [e.name, ...(e.aliases ?? [])].some((n) => normalizeName(n) === normalizeName(name))));
    if (matches.length !== 1) throw new Error(`Unknown or ambiguous franchise: ${name} (${year})`);
    return matches[0].id;
};

type Asset = typeof schema.transactionAssets.$inferInsert;
export interface HistoryImport {
    events: (typeof schema.transactionEvents.$inferInsert)[];
    assets: Asset[];
    picks: (typeof schema.draftPicks.$inferInsert)[];
    players: { id: string; name: string }[];
    transactionFiles: string[];
    draftYears: number[];
    skippedLineups: number;
}

// Connected components separate unrelated trades processed at the same timestamp.
export function groupAssets(assets: Asset[]): Asset[][] {
    const groups: Asset[][] = [];
    for (const asset of assets) {
        const teams = new Set([asset.fromFranchiseId, asset.toFranchiseId].filter((id) => id != null));
        const connected = groups.filter((group) => group.some((a) => (a.fromFranchiseId != null && teams.has(a.fromFranchiseId)) || (a.toFranchiseId != null && teams.has(a.toFranchiseId))));
        const merged = [asset, ...connected.flat()];
        for (const group of connected) groups.splice(groups.indexOf(group), 1);
        groups.push(merged);
    }
    return groups;
}

export function prepareHistory(dataDir: string, config: LeagueConfig, years?: number[]): HistoryImport {
    const catalog: Identity[] = [];
    const identities = new Map<string, string>();
    const drafts = filesIn(path.join(dataDir, 'drafts'), /^\d{4}-\d{4} draft\.csv$/i);
    for (const file of filesIn(dataDir, /^\d{4}-\d{4} Player Stats\.csv$/i)) {
        const [header, ...records] = csv(file);
        const col = (name: string) => { const i = header.indexOf(name); if (i < 0) throw new Error(`${file}: missing ${name}`); return i; };
        for (const row of records) {
            const identity = { id: row[col('ID')], name: row[col('Player')], season: fileYear(file), teams: row[col('Team')].split('/'), positions: row[col('Position')].split(',') };
            catalog.push(identity);
            identities.set(identity.id, identity.name);
        }
    }
    // Draft exports supply ids even for prospects missing from the season's player export.
    for (const file of drafts) for (const row of csv(file).slice(1)) if (row[5]) {
        if (!/^\*[^*]+\*$/.test(row[0])) throw new Error(`${file}: invalid player id ${row[0]}`);
        catalog.push({ id: row[0], name: row[5], season: fileYear(file), teams: row[6].split('/'), positions: row[4].split(',') });
        if (!identities.has(row[0])) identities.set(row[0], row[5]);
    }
    const byName = new Map<string, Identity[]>();
    for (const identity of catalog) {
        const name = normalizeName(identity.name);
        const candidates = byName.get(name) ?? [];
        candidates.push(identity);
        byName.set(name, candidates);
    }
    const result: HistoryImport = { events: [], assets: [], picks: [], players: [], transactionFiles: [], draftYears: [], skippedLineups: 0 };
    const used = new Set<string>();
    const wanted = (file: string) => !years || years.includes(fileYear(file));
    for (const file of filesIn(path.join(dataDir, 'transactions'), /^\d{4}-\d{4} (Trades|FA Claims)\.csv$/i).filter(wanted)) {
        const [header, ...records] = csv(file);
        const trade = /Trades\.csv$/i.test(file);
        const sourceFile = path.basename(file);
        const year = fileYear(file);
        const zone = header[5]?.match(/\((EDT|EST)\)/)?.[1];
        const expected = trade ? ['Player', 'Team', 'Position', 'From', 'To'] : ['Player', 'Team', 'Position', 'Type', 'Team'];
        if (!zone || expected.some((h, i) => header[i] !== h)) throw new Error(`Unexpected transaction columns in ${file}`);
        result.transactionFiles.push(sourceFile);
        const buckets = new Map<string, { occurredAt: string; occurredOn: string; assets: Asset[] }>();
        records.forEach((row, i) => {
            if (!trade && row[3] === 'Lineup Change') { result.skippedLineups++; return; }
            if (!trade && !['Claim', 'Drop'].includes(row[3])) throw new Error(`${file}: unknown action ${row[3]}`);
            const action = trade ? row[4] === '(Drop)' ? 'drop' : 'trade' : row[3] === 'Claim' ? 'claim' : 'drop';
            const fromName = trade ? row[3] : action === 'drop' ? row[4] : null;
            const toName = trade ? row[4] === '(Drop)' ? null : row[4] : action === 'claim' ? row[4] : null;
            const assetKind = /^\d{4} Draft Pick, Round \d+(?: \(.+\)| Pick \d+)$/.test(row[0]) ? 'pick' : 'player';
            const playerId = assetKind === 'player' ? resolvePlayer(byName.get(normalizeName(row[0])) ?? [], row[0], row[1], row[2], year) : null;
            if (playerId) used.add(playerId);
            const { occurredAt, occurredOn } = exportDate(row[5], zone);
            const asset: Asset = {
                id: key([sourceFile, i + 2]), eventId: '', playerId, label: row[0], assetKind, action,
                fromFranchiseId: fromName ? franchiseFor(config, fromName, year) : null,
                toFranchiseId: toName ? franchiseFor(config, toName, year) : null,
                fromName, toName, sourceRow: i + 2,
            };
            const bucket = buckets.get(row[5]) ?? { occurredAt: occurredAt!, occurredOn, assets: [] };
            bucket.assets.push(asset);
            buckets.set(row[5], bucket);
        });
        for (const [sourceTime, bucket] of buckets) for (const group of groupAssets(bucket.assets)) {
            const franchises = [...new Set(group.flatMap((a) => [a.fromFranchiseId, a.toFranchiseId]).filter((id) => id != null))].sort();
            const eventId = key([sourceFile, sourceTime, franchises]);
            result.events.push({ id: eventId, seasonYear: year, kind: trade ? 'trade' : 'free_agent', occurredAt: bucket.occurredAt, occurredOn: bucket.occurredOn, sourceFile, sourceTime });
            result.assets.push(...group.map((a) => ({ ...a, eventId })));
        }
    }
    for (const file of drafts.filter(wanted)) {
        const [header, ...records] = csv(file);
        if (header.slice(0, 9).join('|') !== 'Player ID|Round|Pick|Ov Pick|Pos|Player|Team|Fantasy Team|Time (EDT)') throw new Error(`Unexpected draft columns: ${file}`);
        const year = fileYear(file);
        result.draftYears.push(year);
        const overall = new Set<number>();
        records.forEach((row) => {
            const round = Number(row[1]), pick = Number(row[2]), number = Number(row[3]);
            if (![round, pick, number].every((v) => Number.isInteger(v) && v > 0) || overall.has(number)) throw new Error(`${file}: invalid or duplicate pick ${row[3]}`);
            overall.add(number);
            const playerId = row[5] ? row[0] : null;
            if (playerId) used.add(playerId);
            if (playerId && !row[7]) throw new Error(`${file}: player at pick ${number} has no team`);
            result.picks.push({ seasonYear: year, overall: number, round, pick, franchiseId: row[7] ? franchiseFor(config, row[7], year) : null, teamName: row[7] || null, playerId, playerName: row[5] || null, positions: row[4], draftedOn: exportDate(row[8]).occurredOn, sourceTime: row[8], sourceFile: path.basename(file) });
        });
    }
    result.players = [...used].map((id) => ({ id, name: identities.get(id)! }));
    return result;
}

const chunks = <T,>(rows: T[], size = 400) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
export async function writeHistory(db: Db, prepared: HistoryImport) {
    // Atomic replacement only for supplied exports. Missing files do not erase archived seasons.
    await db.transaction(async (tx) => {
        for (const batch of chunks(prepared.players)) await tx.insert(schema.players).values(batch).onConflictDoNothing();
        if (prepared.transactionFiles.length) await tx.delete(schema.transactionEvents).where(inArray(schema.transactionEvents.sourceFile, prepared.transactionFiles));
        for (const batch of chunks(prepared.events)) await tx.insert(schema.transactionEvents).values(batch);
        for (const batch of chunks(prepared.assets)) await tx.insert(schema.transactionAssets).values(batch);
        for (const year of prepared.draftYears) await tx.delete(schema.draftPicks).where(eq(schema.draftPicks.seasonYear, year));
        for (const batch of chunks(prepared.picks)) await tx.insert(schema.draftPicks).values(batch);
    });
}
