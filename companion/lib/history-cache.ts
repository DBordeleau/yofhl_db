import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Completed seasons stay on disk until an explicit refresh or a cache-key change.
export async function historicalCache<T>(directory: string, key: string, load: () => Promise<T>, parse: (value: unknown) => T, refresh = false): Promise<T> {
    const file = resolve(directory, `${createHash('sha256').update(key).digest('hex')}.json`);
    if (!refresh) {
        let text: string | undefined;
        try { text = await readFile(file, 'utf8'); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        if (text) {
            try {
                const saved = JSON.parse(text);
                if (saved.version === 1 && saved.key === key) return parse(saved.value);
            } catch { /* A corrupt or obsolete cache is replaced only after a successful load. */ }
        }
    }
    const value = parse(await load());
    await mkdir(directory, { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, JSON.stringify({ version: 1, key, value }));
        await rename(temporary, file);
    } finally {
        await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    return value;
}
