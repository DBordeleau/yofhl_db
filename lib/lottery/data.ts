import { randomInt } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { rows } from '@/lib/data/db';
import { pickWinner, publicLottery, type LotteryRecord, type LotteryResponse, type LotteryTeam } from './model';
import { drawQuery, lotteryColumns, publicLotteryQuery } from './queries';

export const getLotteryTeams = () => rows<LotteryTeam>(sql`
    select f.id, coalesce(m.name, f.display_name) as name, coalesce(t.abbreviation, left(coalesce(m.name, f.display_name), 3)) as abbreviation,
           coalesce(m.logo_url, t.logo_url, f.logo_url) as logo
    from league.franchises f
    left join league.team_management m on m.franchise_id = f.id
    left join lateral (select abbreviation, wins, fpts_for, logo_url from league.team_seasons
                      where franchise_id = f.id order by season_year desc limit 1) t on true
    where f.folded_after_season is null
    order by t.wins asc nulls last, t.fpts_for asc nulls last, f.id`);

export const getCurrentLottery = async () => (await rows<LotteryRecord>(sql`
    select ${lotteryColumns} from league.draft_lotteries where is_current = true limit 1`))[0] ?? null;

export const getLotteryHistory = () => rows<LotteryRecord>(sql`
    select ${lotteryColumns} from league.draft_lotteries
    where is_current = false and cancelled_at is null order by starts_at desc limit 10`);

export async function getPublicLottery(id?: string): Promise<LotteryResponse> {
    // Database time also governs saves and drawing, keeping concurrent instances on one clock.
    const read = async (eventId?: string) => (await rows<{ record: LotteryRecord | null; now: string }>(publicLotteryQuery(eventId)))[0];
    let { record, now } = await read(id);
    if (record && record.winnerId === null && new Date(record.startsAt).getTime() <= new Date(now).getTime()) {
        const candidate = pickWinner(record.entries, randomInt(10_000));
        // Compare-and-set: only one request can persist the draw. A concurrent edit invalidates
        // this version; a concurrent draw wins once, and every other viewer reads its result.
        await rows(drawQuery(record.id, record.version, candidate));
        ({ record, now } = await read(record.id));
    }
    return { serverNow: new Date(now).toISOString(), lottery: record ? publicLottery(record, new Date(now).getTime()) : null };
}
