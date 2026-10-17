import { parse } from 'csv-parse/browser/esm/sync';
import { cleanId, normalizeName, positionsFrom, type Snapshot, type Player, type Draft } from './model';

export interface PoolImport { players: Player[]; ids: string[]; ignoredOwned: number; excludedKeepers: number; added: number }
export function parsePoolCsv(text: string, snapshot: Snapshot, draft: Draft): PoolImport {
    if (text.length > 10_000_000) throw new Error('CSV is too large. Export the player list only.');
    const rows = parse(text, { bom: true, columns: (headers: string[]) => headers.map(h => h.trim().toLowerCase()), skip_empty_lines: true, trim: true }) as Record<string, string>[];
    if (!rows.length) throw new Error('The CSV has no player rows.');
    if (!('id' in rows[0]) && !('player' in rows[0]) && !('name' in rows[0])) throw new Error('Expected Fantrax columns ID and Player, or a Player/Name column.');
    const players = [...snapshot.players], byId = new Map(players.map(p => [p.id, p]));
    const byName = new Map<string, Player[]>();
    for (const player of players) byName.set(normalizeName(player.name), [...(byName.get(normalizeName(player.name)) ?? []), player]);
    const ids = new Set<string>(), seen = new Set<string>(), problems: string[] = [];
    let ignoredOwned = 0, excludedKeepers = 0, added = 0;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i], name = row.player || row.name || '', id = cleanId(row.id ?? '');
        const status = row.status?.trim();
        if (status && status !== 'FA' && !/^W(?:\s|$)/.test(status)) { ignoredOwned++; continue; }
        let player = id ? byId.get(id) : undefined;
        if (!id) {
            const matches = byName.get(normalizeName(name)) ?? [];
            if (matches.length === 1) player = matches[0];
            else { problems.push(`Row ${i + 2}: ${name || 'unnamed player'} ${matches.length ? 'matches multiple players; include the Fantrax ID' : 'was not found; include ID and Position'}.`); continue; }
        }
        if (!player) {
            const positions = positionsFrom(row.position ?? '');
            if (!/^[a-zA-Z0-9_-]+$/.test(id) || !name || !positions.length) { problems.push(`Row ${i + 2}: a new player needs ID, Player and Position.`); continue; }
            player = { id, name, positions, team: row.team ?? '', available: true, age: null, previous: null, projected: null, note: 'Added from your CSV. No matched scoring data.' };
            players.push(player); byId.set(id, player); added++;
        }
        if (seen.has(player.id)) { problems.push(`Row ${i + 2}: duplicate player ${player.name}.`); continue; }
        seen.add(player.id);
        if (draft.keeperIds.includes(player.id)) { excludedKeepers++; continue; }
        ids.add(player.id);
    }
    if (problems.length) throw new Error(`${problems.slice(0,5).join('\n')}${problems.length > 5 ? `\n…and ${problems.length - 5} more.` : ''}\nNothing was imported.`);
    if (!ids.size) throw new Error('No available players remain in this CSV after removing rostered players and your keepers. Nothing was imported.');
    return { players, ids: [...ids], ignoredOwned, excludedKeepers, added };
}
