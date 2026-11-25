import RecordBook from '@/components/records/record-book';
import { getRecordBook } from '@/lib/records/data';
import { PLAYER_STATS } from '@/lib/records/player-stats';
import { RECORD_BOOK_DESCRIPTION } from '@/lib/page-metadata';
import { pageMetadata } from '@/lib/site-metadata';

export const dynamic = 'force-dynamic';
export const metadata = pageMetadata({ path: '/records', name: 'Record book', description: RECORD_BOOK_DESCRIPTION });

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ category?: string; record?: string; team?: string; position?: string; format?: string; stat?: string }> }) {
    const params = await searchParams;
    const team = /^\d+$/.test(params.team ?? '') ? Number(params.team) : undefined;
    const position = ['C', 'LW', 'RW', 'D', 'G'].includes(params.position ?? '') ? params.position : undefined;
    const stat = PLAYER_STATS.find(s => s.id === params.stat)?.id;
    const book = await getRecordBook({ team, position, format: params.format, stat });
    return <RecordBook book={book} team={team} position={position} />;
}
