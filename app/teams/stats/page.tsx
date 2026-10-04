import TeamGrid from '@/components/team-grid';
import { getFranchiseCards } from '@/lib/data/league';

// every franchise's all-time record as cards at /teams/stats
export default async function TeamStatsPage() {
    const teams = await getFranchiseCards();
    return (
        <main className="mx-auto max-w-page px-4 pb-16 pt-8 md:px-8 md:pt-12 3xl:max-w-page-3xl 4xl:max-w-page-4xl">
            <TeamGrid teams={teams} />
        </main>
    );
}
