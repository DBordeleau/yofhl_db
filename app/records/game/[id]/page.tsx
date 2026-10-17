import Link from 'next/link';
import { notFound } from 'next/navigation';
import TeamBadge from '@/components/team-badge';
import { getRecordSource } from '@/lib/records/data';
import { matchupFormat } from '@/lib/records/model';
import { formatFpts, seasonLabel, teamSeasonHref } from '@/lib/league';
import styles from '@/components/records/records.module.css';
import ExploreNext from '@/components/explore-next';
import { getBannerSeasons } from '@/lib/data/league';
import { teamComparisonHref } from '@/lib/compare/state';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Matchup record · YOFHL', robots: { index: false, follow: false } };

export default async function RecordGame({ params }: { params: Promise<{ id: string }> }) {

    const { id } = await params;
    const source = await getRecordSource();
    const game = source.games.find(g => String(g.id) === id);
    if (!game) notFound();
    const period = source.periods.find(p => p.year === game.year && p.period === game.round);
    const format = period ? matchupFormat(period) : null;
    if (game.stage !== 'regular' || !format) notFound();
    const season = (await getBannerSeasons()).find(row => row.year === game.year && (row.team || row.playoffStatus === 'cancelled'));
    const sides = [{ id: game.away, name: game.awayName, points: game.awayScore }, { id: game.home, name: game.homeName, points: game.homeScore }];
    const scores = source.games.filter(g => g.year === game.year && g.round === game.round).flatMap(g => [{ id: g.away, name: g.awayName, points: g.awayScore }, { id: g.home, name: g.homeName, points: g.homeScore }]).sort((a, b) => b.points - a.points);
    const date = (value: string) => new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
    return <main className={styles.evidence}>
        <Link className={styles.back} href={`/records?category=matchups&format=${format}`}>← Record book</Link>
        <div className={styles.scoreboard}>
            <p>{seasonLabel(game.year)} · Period {game.round}{period ? ` · ${date(period.start)} – ${date(period.end)}` : ''}</p>
            <div className={styles.scoreTeams}>{sides.map((side, index) => {
                const team = source.teams.find(t => t.ID === side.id);
                return <div key={side.id}><TeamBadge logo={team?.LogoUrl ?? null} abbreviation={team?.Abbreviation ?? null} teamName={side.name} size={80} ring="none" />
                    {index === 0 ? <h1>{side.name}</h1> : <h2>{side.name}</h2>}<strong className={game.winner === side.id ? styles.winner : undefined}>{formatFpts(side.points)}</strong></div>;
            })}</div>
            <div className={styles.scoreLinks}><Link href={`/compare/teams?a=${game.away}&b=${game.home}&stage=regular`}>Head-to-head history ↗</Link><Link href={teamSeasonHref(game.year, game.winner ?? game.away)}>Season standings ↗</Link></div>
        </div>
        <table className={styles.periodTable}><caption>That period around the league</caption><thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col">FPts</th></tr></thead><tbody>{scores.map(side => <tr key={side.id} className={sides.some(s => s.id === side.id) ? styles.selectedGame : undefined}><td>{scores.findIndex(s => s.points === side.points) + 1}</td><th scope="row"><Link href={teamSeasonHref(game.year, side.id)}>{side.name}</Link></th><td>{formatFpts(side.points)}</td></tr>)}</tbody></table>
        <ExploreNext currentHref={`/records/game/${game.id}`} links={[
            ...sides.map(side => ({ href: `/teams/${side.id}`, title: side.name, reason: 'Explore this franchise’s history' })),
            { href: teamComparisonHref(game.away, game.home), title: 'Compare these teams', reason: 'Their complete head-to-head record' },
            season ? { href: `/season/${season.year}`, title: season.label, reason: 'See the season around this matchup' } : null,
        ]} />
    </main>;
}
