import type { Metadata } from 'next';
import RivalryCentre from '@/components/rivalries/rivalry-centre';
import { getRivalryData } from '@/lib/data/rivalries';
import { getBannerSeasons } from '@/lib/data/league';

export const metadata: Metadata = { title: 'Compare teams · YOFHL DB' };
export const dynamic = 'force-dynamic';

export default async function TeamComparisonPage() {
    const [data, seasons] = await Promise.all([getRivalryData(), getBannerSeasons()]);
    if (data.teams.length < 2) return <main className="p-8">Two franchises are needed to compare rivalries.</main>;
    return <RivalryCentre {...data} availableYears={seasons.filter(season => season.team || season.playoffStatus === 'cancelled').map(season => season.year)} />;
}
