import prisma from '@/lib/db';

// maps franchise IDs to all abbreviations that are historically associated with the franchise ID
const teamMap: { [key: string]: string[] } = {
    "1": ["HCHH", "PVLS"],
    "2": ["NPD"],
    "3": ["STEG", "STEC", "HH"],
    "4": ["VWIZ"],
    "5": ["JAGR"],
    "6": ["WWE", "ORCA", "TEEHAW"],
    "7": ["Lali"],
    "8": ["SEED", "SKGS"],
    "9": ["WTURR", "Reaper", "Reapers"],
    "10": ["ASI", "RP"],
    "11": ["NFLD"],
    "12": ["DGWY", "MAC", "NKN"],
    "13": ["JUBA", "MEAT", "HUNG"],
    "14": ["JTPJ"],
};

// returns all-time top scorers based on a given team ID
export async function GET(request: Request, { params }: { params: Promise<{ ID: string }> }) {
    const { ID } = await params;

    // validate the ID
    const teamID = parseInt(ID, 10);
    if (isNaN(teamID) || !teamMap[ID]) {
        return new Response(JSON.stringify({ error: "Invalid team ID" }), { status: 400 });
    }

    // use the ID-Abbreviation mapping
    const yofhlTeams = teamMap[ID];

    try {
        // get the team name from the team_stats table using the teamID to display the current team name
        const teamInfo = await prisma.team_stats.findUnique({
            where: { ID: teamID },
            select: {
                Team: true,
            },
        });

        if (!teamInfo) {
            return new Response(JSON.stringify({ error: "Team not found" }), { status: 404 });
        }

        const teamName = teamInfo.Team;

        const topPlayers = await prisma.player_stats.groupBy({
            by: ['ID'],
            where: {
                YOFHLTeam: { in: yofhlTeams },
            },
            _sum: {
                FPts: true,
            },
            _avg: {
                FPG: true,
            },
            orderBy: { _sum: { FPts: 'desc' } },
        });

        const playerIds = topPlayers.map(player => player.ID);
        const playersDetails = await prisma.player_stats.findMany({
            where: {
                ID: { in: playerIds },
            },
            select: {
                ID: true,
                Player: true,
                Position: true,
                Year: true,
            },
        });

        const playersGrouped = playersDetails.reduce(
            (acc: { [key: string]: { Player: string; Positions: Set<string>; ChampionshipsWon: number } }, player) => {
                if (!acc[player.ID]) {
                    acc[player.ID] = {
                        Player: player.Player,
                        Positions: new Set<string>(),
                        ChampionshipsWon: 0,
                    };
                }

                player.Position.split(',').forEach(position => {
                    acc[player.ID].Positions.add(position.trim());
                });

                return acc;
            },
            {} as { [key: string]: { Player: string; Positions: Set<string>; ChampionshipsWon: number } }
        );

        const players = topPlayers.map(player => {
            const playerDetails = playersGrouped[player.ID];
            return {
                ID: player.ID,
                Player: playerDetails.Player,
                Position: Array.from(playerDetails.Positions).join(', '),
                FPts: player._sum.FPts,
                FPG: player._avg.FPG ? player._avg.FPG.toFixed(2) : 'N/A',
                ChampionshipsWon: playerDetails.ChampionshipsWon,
            };
        });

        return new Response(
            JSON.stringify({
                topPlayers: players,
                teamName: teamName,
            }),
            { status: 200 }
        );
    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ error: 'An error occurred while fetching team data' }), { status: 500 });
    }
}
