import type { Metadata } from 'next';
import LotteryRoom from '@/components/lottery/lottery-room';
import { getPublicLottery } from '@/lib/lottery/data';
import './lottery.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Draft Lottery · YOFHL', description: 'One pick. A new era. Watch YOFHL draft lottery live and see the full draft order.' };

export default async function LotteryPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
    const { id } = await searchParams;
    const validId = id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : undefined;
    try {
        const initial = await getPublicLottery(validId);
        return <LotteryRoom initial={initial} id={validId} />;
    } catch {
        return <LotteryRoom initial={{ lottery: null, serverNow: new Date().toISOString() }} id={validId} unavailable />;
    }
}
