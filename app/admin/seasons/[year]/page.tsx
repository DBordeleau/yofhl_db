import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminHeader from '@/components/admin/admin-header';
import AwardVotePanel from '@/components/admin/award-vote-panel';
import AwardsEditor from '@/components/admin/awards-editor';
import BracketReview from '@/components/admin/bracket-review';
import LoginForm from '@/components/admin/login-form';
import RookieReview from '@/components/admin/rookie-review';
import RosterEditor from '@/components/admin/roster-editor';
import { adminConfigured, isAdmin } from '@/lib/admin/auth';
import { getSeasonAdmin } from '@/lib/admin/data';
import { awardVote } from '@/lib/award-vote/award-vote';

export const dynamic = 'force-dynamic';
// preparing an award vote's ballot runs in batches that each fit this limit
export const maxDuration = 60;

const Section = ({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) => (
    <section className="rounded-3xl border border-line bg-ice/60 p-4 shadow-card md:p-6">
        <h2 className="font-wide text-lg font-extrabold uppercase md:text-xl">{title}</h2>
        {description && <p className="mb-5 mt-1 max-w-2xl text-sm text-ink-soft">{description}</p>}
        {children}
    </section>
);

// championship roster, awards and bracket review for one season at /admin/seasons/[year]
export default async function AdminSeason({ params }: { params: Promise<{ year: string }> }) {
    const { year } = await params;
    if (!(await isAdmin())) return <LoginForm next={`/admin/seasons/${encodeURIComponent(year)}`} configured={adminConfigured()} />;

    const season = await getSeasonAdmin(parseInt(year, 10));
    if (!season) notFound();
    const playoffs = season.playoffStatus === 'complete';
    // from 2026–27 on, and for the season before the live season as a rehearsal
    const vote = await awardVote.readPreview({ seasonYear: season.year });
    const rookies = vote.kind ? await awardVote.readRookieReview({ seasonYear: season.year }) : null;
    const tallies = await awardVote.readTallies({ seasonYear: season.year });
    // refused until the ballot lock has passed, so no rankings show while owners can still change them
    const ballots = await awardVote.readBallots({ seasonYear: season.year });
    const rehearsal = vote.kind === 'rehearsal' || !!vote.vote?.rehearsal;

    return (
        <>
            <AdminHeader title={season.label} back />
            <p className="-mt-3 mb-6 text-sm text-ink-soft">
                Changes go live on the site as soon as they&apos;re saved.{' '}
                <Link href={`/season/${season.year}`} className="font-bold text-rink-blue hover:underline" target="_blank">View the season page</Link>
            </p>
            <div className="flex flex-col gap-6">
                {playoffs && season.champion && (
                    <Section
                        title="Championship roster"
                        description={<>Everyone who gets a {season.champion.name} ring. Start from their end-of-season roster, then search for players they dropped late in the year (Fantrax lists them as free agents).</>}
                    >
                        <RosterEditor
                            year={season.year}
                            championName={season.champion.name}
                            championAbbreviation={season.champion.abbreviation}
                            roster={season.roster}
                            suggestions={season.suggestions}
                        />
                    </Section>
                )}
                {playoffs && !season.champion && (
                    <Section title="Championship roster" description="The bracket doesn't have a champion yet, so there's no roster to set. Import the season's playoff results first." >
                        <span />
                    </Section>
                )}
                {vote.kind && (
                    <Section
                        title={rehearsal ? 'Award vote rehearsal' : 'Award vote'}
                        description={rehearsal
                            ? 'A rehearsal of the award vote on this past season: prepare and preview a real ballot before the first live vote. It can never be opened, and owners never see it. Preparing again replaces it.'
                            : 'Prepare the ballot from Fantrax and the archive, then check it here as owners will see it. Preparing again replaces it.'}
                    >
                        <AwardVotePanel year={season.year} preview={vote} tallies={tallies.ok ? tallies : null}
                            ballots={ballots.ok ? ballots.ballots : null} />
                    </Section>
                )}
                {rookies && (
                    <Section
                        title={rehearsal ? 'Rookie review rehearsal' : 'Rookie review'}
                        description="Who is a Calder-eligible rookie for the Teemu Trophy, by the NHL’s records. Add a player the NHL lookup missed or remove one wrongly admitted; your changes stay when you prepare again."
                    >
                        <RookieReview year={season.year} review={rookies} rehearsal={rehearsal} />
                    </Section>
                )}
                <Section title="Awards" description={playoffs ? undefined : 'The playoffs were cancelled this season, so there is no Playoff MVP.'}>
                    <AwardsEditor year={season.year} awards={season.awards} published={season.awardVotePublished} />
                </Section>
                {playoffs && (
                    <Section
                        title="Bracket review"
                        description="Correct who advanced when the exported scores are wrong, and add a note that appears under the bracket. Fixed scores themselves live in league/league.yml."
                    >
                        <BracketReview year={season.year} games={season.games} />
                    </Section>
                )}
            </div>
        </>
    );
}
