import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

// returns championship roster data for table at /champions/[year]
export async function GET(req: Request, { params }: { params: Promise<{ year: string }> }) {
    const { year } = await params;

    if (!year || isNaN(parseInt(year, 10))) {
        return NextResponse.json({ error: 'Invalid year parameter' }, { status: 400 });
    }

    try {
        // get the championship roster for the given year
        const champions = await prisma.player_stats.findMany({
            where: {
                Year: parseInt(year, 10),
                Champion: true,
            },
            orderBy: {
                FPts: 'desc', // default sort by fantasy points
            },
        });

        return NextResponse.json(champions, { status: 200 });
    } catch (error) {
        console.error('Error fetching champions:', error);
        return NextResponse.json({ error: 'Failed to fetch champions' }, { status: 500 });
    }
}
