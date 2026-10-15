import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import RivalryCentre from '@/components/rivalries/rivalry-centre';
import { getRivalryData } from '@/lib/data/rivalries';

export const metadata: Metadata = { title: 'Rivalries · YOFHL local demo', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function RivalryDemo({ searchParams }: { searchParams: Promise<{ a?: string; b?: string; stage?: string }> }) {
    if (process.env.NODE_ENV !== 'development') notFound();
    const [data, params] = await Promise.all([getRivalryData(), searchParams]);
    if (data.teams.length < 2) return <main className="p-8">Two franchises are needed to compare rivalries.</main>;
    const a = data.teams.find(team => team.ID === Number(params.a))?.ID ?? data.teams.find(team => team.ID === 4)?.ID ?? data.teams[0].ID;
    const b = data.teams.find(team => team.ID === Number(params.b) && team.ID !== a)?.ID ?? data.teams.find(team => team.ID === 5 && team.ID !== a)?.ID ?? data.teams.find(team => team.ID !== a)!.ID;
    const stage = params.stage === 'playoff' ? 'playoff' : 'regular';
    return <RivalryCentre key={`${a}-${b}-${stage}`} {...data} initialA={a} initialB={b} initialStage={stage} />;
}
