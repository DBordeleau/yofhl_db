import Link from 'next/link';
import { notFound } from 'next/navigation';
import Arrow from '@/components/arrow';
import TeamBadge from '@/components/team-badge';
import { awardVote } from '@/lib/award-vote/award-vote';
import { seasonLabel } from '@/lib/league';

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }) {
    const { year } = await params;
    return { title: `${seasonLabel(Number(year))} Award Ballots · YOFHL` };
}

// A season's award vote, once published: every franchise's ballot under its name and owner that season. A season
// with no published award vote has no ballots page.
export default async function SeasonBallotsPage({ params }: { params: Promise<{ year: string }> }) {
    const { year } = await params;
    if (!/^\d{4}$/.test(year)) notFound();
    const seasonYear = Number(year);
    const page = await awardVote.readPublishedBallots({ seasonYear });
    if (!page.ok) notFound();

    return (
        <div className="mx-auto max-w-board pt-6">
            <Link href={`/season/${seasonYear}`} className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ink-muted hover:text-rink-blue"><Arrow direction="left" /> {seasonLabel(seasonYear)} season</Link>
            <div className="mb-6 px-1">
                <h1 className="font-wide text-2xl font-extrabold uppercase md:text-3xl">{seasonLabel(seasonYear)} award ballots</h1>
            </div>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {page.ballots.map(ballot => (
                    <section key={ballot.team.franchiseId} className="overflow-hidden rounded-3xl border border-line bg-white shadow-card" aria-labelledby={`ballot-${ballot.team.franchiseId}`}>
                        <div className="flex items-center gap-3 border-b-2 border-ink px-4 py-3">
                            <TeamBadge logo={ballot.team.logo} abbreviation={ballot.team.abbreviation} teamName={ballot.team.name} size={40} sizeClass="h-10 w-10" />
                            <div className="min-w-0">
                                <h2 id={`ballot-${ballot.team.franchiseId}`} className="font-bold"><Link href={`/teams/${ballot.team.franchiseId}`} className="underline-offset-[3px] hover:text-rink-blue hover:underline">{ballot.team.name}</Link></h2>
                                {ballot.owner && <p className="text-xs font-semibold text-ink-muted">{ballot.owner}</p>}
                            </div>
                        </div>
                        {ballot.voidReason !== null && <p className="border-b border-line-soft px-4 py-2 text-sm"><span className="font-bold uppercase">Void</span> · {ballot.voidReason}</p>}
                        {ballot.voted ? (
                            <div className="grid gap-4 px-4 py-3">
                                {ballot.rankings.map(ranking => (
                                    <div key={ranking.award}>
                                        <h3 className="text-[11px] font-bold uppercase tracking-[.12em] text-ink-muted">{page.awards.find(award => award.award === ranking.award)?.label}</h3>
                                        <ol className="mt-1 text-sm">
                                            {ranking.players.map((player, rank) => (
                                                <li key={rank} className="flex gap-2"><span className="tabular w-4 shrink-0 text-ink-muted">{rank + 1}</span>{player?.name ?? '—'}</li>
                                            ))}
                                        </ol>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="px-4 py-3 text-sm text-ink-muted">Didn’t vote</p>}
                    </section>
                ))}
            </div>
        </div>
    );
}
