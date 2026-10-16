import { sql } from 'drizzle-orm';
import { cached, rows } from './db';
import type { DraftHindsightData, DraftProduction } from '../draft/hindsight';

export const getDraftHindsight = cached(async (year: number): Promise<DraftHindsightData> => {
    const [production, latest] = await Promise.all([
        rows<DraftProduction>(sql`
            select ps.player_id as "playerId", ps.season_year as year, ps.fpts::float8 as points
            from league.player_seasons ps
            where ps.season_year >= ${year} and exists (
                select 1 from league.draft_picks d where d.season_year = ${year} and d.player_id = ps.player_id)
            order by ps.season_year`),
        rows<{ year: number | null }>(sql`select max(season_year) as year from league.player_seasons`),
    ]);
    return { production, latestYear: latest[0]?.year ?? year };
}, 'draft-hindsight-demo');
