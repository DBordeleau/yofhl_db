import Link from 'next/link';
import AdminHeader from '@/components/admin/admin-header';
import LoginForm from '@/components/admin/login-form';
import LotteryEditor from '@/components/admin/lottery-editor';
import { adminConfigured, isAdmin } from '@/lib/admin/auth';
import { getCurrentLottery, getLotteryHistory, getLotteryTeams } from '@/lib/lottery/data';
import { formatEastern } from '@/lib/lottery/model';
import Arrow from '@/components/arrow';

export const dynamic = 'force-dynamic';

export default async function AdminLotteryPage() {
    if (!(await isAdmin())) return <LoginForm next="/admin/lottery" configured={adminConfigured()} />;
    const [lottery, teams, history] = await Promise.all([getCurrentLottery(), getLotteryTeams(), getLotteryHistory()]);
    return <>
        <AdminHeader title="Draft lottery" back />
        <LotteryEditor key={lottery?.id ?? 'new'} initial={lottery} teams={teams} />
        {history.length > 0 && <section className="mt-10">
            <h2 className="font-wide text-xl font-extrabold">Previous lotteries</h2>
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white px-5">
                {history.map((event) => <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div><p className="font-bold">{event.title}</p><p className="text-sm text-ink-muted">{formatEastern(event.startsAt)}</p></div>
                    <Link href={`/lottery?id=${event.id}`} className="py-3 text-sm font-bold text-rink-blue">View results <Arrow /></Link>
                </li>)}
            </ul>
        </section>}
    </>;
}
