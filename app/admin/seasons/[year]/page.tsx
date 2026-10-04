import Link from 'next/link';
import { notFound } from 'next/navigation';
import AdminHeader from '@/components/admin/admin-header';
import AwardsEditor from '@/components/admin/awards-editor';
import BracketReview from '@/components/admin/bracket-review';
import LoginForm from '@/components/admin/login-form';
import RosterEditor from '@/components/admin/roster-editor';
import { adminConfigured, isAdmin } from '@/lib/admin/auth';
import { getSeasonAdmin } from '@/lib/admin/data';

export const dynamic = 'force-dynamic';

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

    return (
        <>
            <AdminHeader title={season.label} back />
            <p className="-mt-3 mb-6 text-sm text-ink-soft">
                Changes go live on the site as soon as they&apos;re saved.{' '}
                <Link href={`/champions/${season.year}`} className="font-bold text-rink-blue hover:underline" target="_blank">View the season page</Link>
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
                <Section title="Awards" description={playoffs ? undefined : 'The playoffs were cancelled this season, so there is no Playoff MVP.'}>
                    <AwardsEditor year={season.year} awards={season.awards} />
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
