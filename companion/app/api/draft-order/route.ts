import { FANTRAX_LEAGUE_ID } from '../../../../lib/fantrax/data';
import { parseFantraxOrder, parseFantraxRosters } from '../../../lib/fantrax-order';

export const dynamic = 'force-dynamic';

async function fantrax(endpoint: string) {
    const response = await fetch(`https://www.fantrax.com/fxea/general/${endpoint}?leagueId=${FANTRAX_LEAGUE_ID}&excludePlayerInfo=true`,
        { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Fantrax could not be reached. Your current order has been kept.');
    return response.json();
}

export async function GET() {
    try {
        const [info, results, rosters] = await Promise.all([fantrax('getLeagueInfo'), fantrax('getDraftResults'), fantrax('getTeamRosters').catch(() => null)]);
        const plan = parseFantraxOrder(info, results);
        let teamRosters: Record<string, string[]> | null = null;
        try { if (rosters) teamRosters = parseFantraxRosters(info, rosters); } catch { /* Keep existing keeper counts when rosters are unavailable. */ }
        return Response.json({ ...plan, rosters: teamRosters }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : 'Could not load the Fantrax draft order.' }, { status: 502 });
    }
}
