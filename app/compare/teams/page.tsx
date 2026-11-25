import type { Metadata } from 'next';
import RivalryCentre from '@/components/rivalries/rivalry-centre';
import { getRivalryData } from '@/lib/data/rivalries';
import { getSeasonArchive } from '@/lib/data/league';
import { pageMetadata } from '@/lib/site-metadata';

export const metadata: Metadata = pageMetadata({ path: '/compare/teams', name: 'Compare teams',
    description: 'Compare any two YOFHL franchises head to head, in the regular season and the playoffs.' });
export const dynamic = 'force-dynamic';

export default async function TeamComparisonPage() {
    const [data, archive] = await Promise.all([getRivalryData(), getSeasonArchive()]);
    if (data.teams.length < 2) return <main className="p-8">Two franchises are needed to compare rivalries.</main>;
    return <RivalryCentre {...data} availableYears={archive.published.map(season => season.year)} />;
}
