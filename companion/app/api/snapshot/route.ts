import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
export const dynamic = 'force-dynamic';
export async function GET() {
    try {
        const data = JSON.parse(await readFile(resolve(process.cwd(), 'companion/.data/snapshot.json'), 'utf8'));
        return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return Response.json({ error: 'No local data snapshot yet. Run npm run draft:sync from the YOFHL repo, then retry.' }, { status: 503 });
    }
}
