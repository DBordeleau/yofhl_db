import { publicJson } from '@/lib/public-json';
import { NextResponse } from 'next/server';
import { parsePositiveInt4 } from '@/lib/data/bounds';
import { getFranchise } from '@/lib/data/league';

// GET /api/franchises/:id — franchise identity, records, season history and player leaders
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const id = parsePositiveInt4((await params).id);
    const franchise = id === null ? null : await getFranchise(id);
    if (!franchise) return NextResponse.json({ error: 'Franchise not found' }, { status: 404 });
    return publicJson(franchise);
}
