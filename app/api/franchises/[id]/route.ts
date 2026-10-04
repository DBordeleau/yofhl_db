import { NextResponse } from 'next/server';
import { getFranchise } from '@/lib/data/league';

// GET /api/franchises/:id — franchise identity, records, season history and player leaders
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const id = parseInt((await params).id, 10);
    const franchise = isNaN(id) ? null : await getFranchise(id);
    if (!franchise) return NextResponse.json({ error: 'Franchise not found' }, { status: 404 });
    return NextResponse.json(franchise);
}
