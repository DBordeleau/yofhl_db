import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get('q') || '';

        // Require at least 3 characters
        if (query.length < 3) {
            return NextResponse.json({ players: [] });
        }

        // Search for players by name
        const players = await prisma.player_stats.findMany({
            where: {
                Player: {
                    contains: query,
                    mode: 'insensitive'
                }
            },
            select: {
                ID: true,
                Player: true
            },
            distinct: ['ID'],
            orderBy: {
                Player: 'asc'
            },
            take: 10
        });

        return NextResponse.json({ players });
    } catch (error) {
        console.error('Error searching players:', error);
        return NextResponse.json(
            { error: 'Failed to search players' },
            { status: 500 }
        );
    }
}