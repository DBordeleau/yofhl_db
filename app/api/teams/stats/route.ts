import prisma from '@/lib/db';

// returns data for team table at /teams/stats
export async function GET() {
    try {
        const teamStats = await prisma.team_stats.findMany({
            orderBy: { Wins: 'desc' },
        });

        const teams = teamStats.map((team) => ({
            ID: team.ID,
            Team: team.Team,
            Abbreviation: team.Abbreviation,
            Owner: team.Owner,
            Wins: team.Wins,
            Losses: team.Losses,
            FPF: team.FPF,
            Championships: team.Championships,
            Finals: team.Finals,
        }));

        return new Response(JSON.stringify(teams), { status: 200 });
    } catch {
        return new Response(JSON.stringify({ error: 'Failed to fetch team stats' }), { status: 500 });
    }
}
