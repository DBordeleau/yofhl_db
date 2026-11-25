import type { Metadata } from 'next';
import RivalryCentre from '@/components/rivalries/rivalry-centre';
import { getRivalryData } from '@/lib/data/rivalries';
import { getSeasonArchive } from '@/lib/data/league';
import { headToHeadMetadata } from '@/lib/page-metadata';

export const metadata: Metadata = headToHeadMetadata();
export const dynamic = 'force-dynamic';

export default async function TeamComparisonPage() {
    const [data, archive] = await Promise.all([getRivalryData(), getSeasonArchive()]);
    if (data.teams.length < 2) return <main className="p-8">Two franchises are needed to compare rivalries.</main>;
    return <RivalryCentre {...data} availableYears={archive.published.map(season => season.year)} />;
}
