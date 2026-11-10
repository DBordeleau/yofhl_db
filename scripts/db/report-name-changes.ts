import { sql } from 'drizzle-orm';
import { connect, queryRows } from './lib/connect';

// Lists draft and transaction rows whose shown team name differs from the season identity
// name (league.season_teams), so the commissioner can decide which recorded names to keep.
//   npm run db:report:names
const main = async () => {
    const connection = await connect();
    try {
        const changes = await queryRows(connection.db, sql`
            select 'draft' as source, d.season_year as season, d.team_name as recorded, st.name as "seasonIdentity", count(*)::int as rows
            from league.draft_picks d
            left join league.season_teams st on st.franchise_id = d.franchise_id and st.season_year = d.season_year
            where d.franchise_id is not null and d.team_name is distinct from st.name
            group by 1, 2, 3, 4
            union all
            select 'transaction ' || v.side, e.season_year, v.recorded, st.name, count(*)::int
            from league.transaction_events e
            join league.transaction_assets a on a.event_id = e.id
            cross join lateral (values ('from', a.from_franchise_id, a.from_name), ('to', a.to_franchise_id, a.to_name)) v(side, franchise, recorded)
            left join league.season_teams st on st.franchise_id = v.franchise and st.season_year = e.season_year
            where v.franchise is not null and v.recorded is distinct from st.name
            group by 1, 2, 3, 4
            order by 2, 1, 3`);
        console.log(`Name changes in ${connection.label}:`);
        console.table(changes);
    } finally {
        await connection.close();
    }
};

main().catch((error) => { console.error(error); process.exitCode = 1; });
