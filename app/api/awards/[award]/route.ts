import prisma from '@/lib/db';

// returns data for award tables at /awards/[award]
export async function GET(request: Request, { params }: { params: Promise<{ award: string }> }) {
    const { award } = await params;

    if (!award || typeof award !== 'string') {
        return new Response(
            JSON.stringify({ message: 'Invalid or missing award parameter' }),
            { status: 400 }
        );
    }

    try {
        const awardsData = await prisma.awards.findMany({
            where: {
                Award: award,
            },
            include: {
                player: true,
            },
            orderBy: {
                Year: 'desc'
            }
        });

        if (awardsData.length === 0) {
            return new Response(
                JSON.stringify({ message: 'No awards found for this award name' }),
                { status: 404 }
            );
        }

        // format the awards data to include player names, award table Winner field contains ID not name
        const formattedAwards = awardsData.map((award) => ({
            Award: award.Award,
            Year: award.Year,
            Winner: award.player ? award.player.Player : 'Unknown',
            PlayerID: award.player ? award.player.ID : null,
            Team: award.Team,
        }));

        return new Response(JSON.stringify(formattedAwards), { status: 200 });
    } catch (error: unknown) {
        console.error('Error fetching awards data:', error);

        if (error instanceof Error) {
            return new Response(
                JSON.stringify({ message: 'Error fetching awards data', error: error.message }),
                { status: 500 }
            );
        } else {
            return new Response(
                JSON.stringify({ message: 'Unknown error occurred' }),
                { status: 500 }
            );
        }
    }
}