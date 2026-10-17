import RecordBook from '@/components/records/record-book';
import { getRecordBook } from '@/lib/records/data';
import { PLAYER_STATS } from '@/lib/records/player-stats';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Record book · YOFHL', description: 'League records, franchise milestones, and career scoring chases.' };

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ category?: string; record?: string; team?: string; position?: string; format?: string; stat?: string }> }) {
    const params = await searchParams;
    const team = /^\d+$/.test(params.team ?? '') ? Number(params.team) : undefined;
    const position = ['C', 'LW', 'RW', 'D', 'G'].includes(params.position ?? '') ? params.position : undefined;
    const stat = PLAYER_STATS.find(s => s.id === params.stat)?.id;
    const book = await getRecordBook({ team, position, format: params.format, stat });
    return <RecordBook book={book} team={team} position={position} />;
}
