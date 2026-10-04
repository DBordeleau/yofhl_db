import { randomInt } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { rows } from '@/lib/data/db';
import { pickWinner, publicLottery, type LotteryRecord, type LotteryResponse, type LotteryTeam } from './model';
import { drawQuery, lotteryColumns } from './queries';

export const getLotteryTeams = () => rows<LotteryTeam>(sql`
    select f.id, f.display_name as name, coalesce(t.abbreviation, left(f.display_name, 3)) as abbreviation,
           f.logo_url as logo
    from league.franchises f
    left join lateral (select abbreviation, wins, fpts_for from league.team_seasons
                      where franchise_id = f.id order by season_year desc limit 1) t on true
    where f.folded_after_season is null
    order by t.wins asc nulls last, t.fpts_for asc nulls last, f.id`);

export const getCurrentLottery = async () => (await rows<LotteryRecord>(sql`
    select ${lotteryColumns} from league.draft_lotteries where is_current = true limit 1`))[0] ?? null;

export const getLotteryHistory = () => rows<LotteryRecord>(sql`
    select ${lotteryColumns} from league.draft_lotteries
    where is_current = false and cancelled_at is null order by starts_at desc limit 10`);

export async function getPublicLottery(id?: string): Promise<LotteryResponse> {
    let record = id
        ? (await rows<LotteryRecord>(sql`select ${lotteryColumns} from league.draft_lotteries where id = ${id} and cancelled_at is null`))[0] ?? null
        : await getCurrentLottery();
    // Database time also governs saves and drawing, keeping concurrent instances on one clock.
    let [clock] = await rows<{ now: string }>(sql`select clock_timestamp() as now`);
    if (record && record.winnerId === null && new Date(record.startsAt).getTime() <= new Date(clock.now).getTime()) {
        const candidate = pickWinner(record.entries, randomInt(10_000));
        // Compare-and-set: only one request can persist the draw. A concurrent edit invalidates
        // this version; a concurrent draw wins once, and every other viewer reads its result.
        await rows(drawQuery(record.id, record.version, candidate));
        record = (await rows<LotteryRecord>(sql`select ${lotteryColumns} from league.draft_lotteries
            where id = ${record.id} and cancelled_at is null`))[0] ?? null;
        [clock] = await rows<{ now: string }>(sql`select clock_timestamp() as now`);
    }
    return { serverNow: new Date(clock.now).toISOString(), lottery: record ? publicLottery(record, new Date(clock.now).getTime()) : null };
}
